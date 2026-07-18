from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .config import Settings
from .database import Database
from .normalizer import normalize_datalab
from .providers import (
    DatalabClient,
    DemoMappingProvider,
    DemoOCRProvider,
    MappingProvider,
    MappingValidationError,
    OCRProvider,
    ProviderError,
    QwenClient,
    validate_mapping_output,
)
from .storage import LocalStorage


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProcessingCancelled(RuntimeError):
    pass


class Pipeline:
    def __init__(
        self,
        database: Database,
        storage: LocalStorage,
        settings: Settings,
        ocr_provider: OCRProvider | None = None,
        mapping_provider: MappingProvider | None = None,
    ):
        self.database = database
        self.storage = storage
        self.settings = settings
        if settings.provider_mode == "demo":
            self.ocr_provider = ocr_provider or DemoOCRProvider()
            self.mapping_provider = mapping_provider or DemoMappingProvider()
        else:
            self.ocr_provider = ocr_provider or DatalabClient(settings)
            self.mapping_provider = mapping_provider or QwenClient(settings)

    def _call_ocr_with_retry(
        self, job_id: str, provider_files: list[tuple[str, bytes, str]]
    ) -> dict[str, Any]:
        last_error: ProviderError | None = None
        for attempt in range(1, self.settings.provider_max_attempts + 1):
            with self.database.connect() as connection:
                cursor = connection.execute(
                    """UPDATE ocr_jobs SET status = 'processing', attempt_count = ?
                       WHERE ocr_job_id = ?
                         AND status IN ('queued', 'processing', 'retrying')
                         AND EXISTS (
                           SELECT 1 FROM submissions s
                           WHERE s.submission_id = ocr_jobs.submission_id
                             AND s.processing_mode != 'full_manual'
                         )""",
                    (attempt, job_id),
                )
                if cursor.rowcount == 0:
                    raise ProcessingCancelled()
            try:
                return self.ocr_provider.convert(provider_files)
            except ProviderError as exc:
                last_error = exc
                if not exc.retryable:
                    break
                if attempt < self.settings.provider_max_attempts:
                    self.database.execute(
                        "UPDATE ocr_jobs SET status = 'retrying' WHERE ocr_job_id = ?",
                        (job_id,),
                    )
        raise last_error or ProviderError("OCR failed")

    def _call_mapping_with_retry(
        self, job_id: str, payload: dict[str, Any]
    ) -> dict[str, Any]:
        last_error: ProviderError | None = None
        for attempt in range(1, self.settings.provider_max_attempts + 1):
            with self.database.connect() as connection:
                cursor = connection.execute(
                    """UPDATE mapping_jobs SET status = 'processing', attempt_count = ?
                       WHERE mapping_job_id = ?
                         AND status IN ('queued', 'processing', 'retrying')
                         AND EXISTS (
                           SELECT 1 FROM submissions s
                           WHERE s.submission_id = mapping_jobs.submission_id
                             AND s.processing_mode != 'full_manual'
                         )""",
                    (attempt, job_id),
                )
                if cursor.rowcount == 0:
                    raise ProcessingCancelled()
            try:
                return self.mapping_provider.map(payload)
            except ProviderError as exc:
                last_error = exc
                if not exc.retryable:
                    break
                if attempt < self.settings.provider_max_attempts:
                    self.database.execute(
                        "UPDATE mapping_jobs SET status = 'retrying' WHERE mapping_job_id = ?",
                        (job_id,),
                    )
        raise last_error or ProviderError("Mapping failed")

    def process(self, submission_id: str, idempotency_key: str) -> None:
        submission = self.database.fetchone(
            "SELECT * FROM submissions WHERE submission_id = ?", (submission_id,)
        )
        if not submission:
            return
        if submission["processing_mode"] == "full_manual":
            self.database.execute(
                "UPDATE submissions SET status = 'awaiting_review' WHERE submission_id = ?",
                (submission_id,),
            )
            return
        existing = self.database.fetchone(
            """SELECT * FROM ocr_jobs
               WHERE submission_id = ? AND idempotency_key = ?""",
            (submission_id, idempotency_key),
        )
        if existing:
            if (
                existing["status"] in {"queued", "processing", "retrying"}
                and existing["provider_request_id"]
                and isinstance(self.ocr_provider, DatalabClient)
            ):
                try:
                    raw = self.ocr_provider.poll(existing["provider_request_id"])
                    self._finish_ocr(
                        existing["ocr_job_id"], submission_id, idempotency_key, raw
                    )
                except (
                    ProviderError,
                    ValueError,
                    TypeError,
                    sqlite3.DatabaseError,
                ) as exc:
                    self._fail_ocr(existing["ocr_job_id"], submission_id, exc)
            elif existing["status"] == "completed":
                mapping = self.database.fetchone(
                    """SELECT * FROM mapping_jobs
                       WHERE submission_id = ? AND ocr_job_id = ?
                       ORDER BY created_at DESC LIMIT 1""",
                    (submission_id, existing["ocr_job_id"]),
                )
                if not mapping:
                    self._run_mapping(
                        submission_id,
                        existing["ocr_job_id"],
                        f"{idempotency_key}:mapping",
                    )
                elif mapping["status"] in {"queued", "processing", "retrying"}:
                    self._run_mapping(
                        submission_id,
                        existing["ocr_job_id"],
                        mapping["idempotency_key"],
                    )
            return
        self._run_ocr(submission_id, idempotency_key)

    def _run_ocr(self, submission_id: str, idempotency_key: str) -> None:
        job_id = str(uuid4())
        created = now()
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            submission_state = connection.execute(
                "SELECT processing_mode FROM submissions WHERE submission_id = ?",
                (submission_id,),
            ).fetchone()
            if (
                not submission_state
                or submission_state["processing_mode"] == "full_manual"
            ):
                return
            existing = connection.execute(
                """SELECT 1 FROM ocr_jobs
                   WHERE submission_id = ? AND idempotency_key = ?""",
                (submission_id, idempotency_key),
            ).fetchone()
            if existing:
                return
            connection.execute(
                """INSERT INTO ocr_jobs
                   (ocr_job_id, submission_id, provider, idempotency_key, status, created_at)
                   VALUES (?, ?, ?, ?, 'queued', ?)""",
                (
                    job_id,
                    submission_id,
                    self.ocr_provider.name,
                    idempotency_key,
                    created,
                ),
            )
        files = self.database.fetchall(
            "SELECT * FROM submission_files WHERE submission_id = ? ORDER BY page_number",
            (submission_id,),
        )
        try:
            provider_files = [
                (
                    row["file_name"],
                    self.storage.read_file(row["storage_key"]),
                    row["media_type"],
                )
                for row in files
            ]
            if isinstance(self.ocr_provider, DatalabClient):
                request_id = self.ocr_provider.submit(provider_files)
                with self.database.connect() as connection:
                    connection.execute("BEGIN IMMEDIATE")
                    cursor = connection.execute(
                        """UPDATE ocr_jobs
                           SET provider_request_id = ?, status = 'processing',
                               attempt_count = 1
                           WHERE ocr_job_id = ?
                             AND status IN ('queued', 'processing', 'retrying')
                             AND EXISTS (
                               SELECT 1 FROM submissions s
                               WHERE s.submission_id = ocr_jobs.submission_id
                                 AND s.processing_mode != 'full_manual'
                             )""",
                        (request_id, job_id),
                    )
                    if cursor.rowcount == 0:
                        return
                raw = self.ocr_provider.poll(request_id)
            else:
                raw = self._call_ocr_with_retry(job_id, provider_files)
            self._finish_ocr(job_id, submission_id, idempotency_key, raw)
        except ProcessingCancelled:
            return
        except (
            ProviderError,
            OSError,
            ValueError,
            TypeError,
            sqlite3.DatabaseError,
        ) as exc:
            self._fail_ocr(job_id, submission_id, exc)

    def _finish_ocr(
        self,
        job_id: str,
        submission_id: str,
        idempotency_key: str,
        raw: dict[str, Any],
    ) -> None:
        try:
            current = self.database.fetchone(
                """SELECT j.status AS job_status, s.processing_mode
                   FROM ocr_jobs j JOIN submissions s ON s.submission_id = j.submission_id
                   WHERE j.ocr_job_id = ?""",
                (job_id,),
            )
            if (
                not current
                or current["job_status"] in {"cancelled", "completed"}
                or current["processing_mode"] == "full_manual"
            ):
                return
            raw_content = json.dumps(raw, ensure_ascii=False)
            blocks = normalize_datalab(raw)
            if not blocks:
                raise ProviderError("Datalab returned no usable OCR blocks")
            with self.database.connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                locked_state = connection.execute(
                    """SELECT j.status AS job_status, s.processing_mode
                       FROM ocr_jobs j JOIN submissions s
                         ON s.submission_id = j.submission_id
                       WHERE j.ocr_job_id = ?""",
                    (job_id,),
                ).fetchone()
                if (
                    not locked_state
                    or locked_state["job_status"] in {"cancelled", "completed"}
                    or locked_state["processing_mode"] == "full_manual"
                ):
                    return
                raw_location = self.storage.save_raw_response(job_id, raw_content)
                for block in blocks:
                    block_id = f"{job_id}:{block.reading_order}:{block.block_id}"
                    connection.execute(
                        """INSERT INTO ocr_blocks
                           (block_id, ocr_job_id, page_number, reading_order, content,
                            content_type, bounding_box_json, ocr_confidence)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            block_id,
                            job_id,
                            block.page_number,
                            block.reading_order,
                            block.content,
                            block.content_type,
                            json.dumps(block.bounding_box),
                            block.ocr_confidence,
                        ),
                    )
                connection.execute(
                    """UPDATE ocr_jobs SET status = 'completed', provider_request_id = ?,
                       raw_response_location = ?, completed_at = ? WHERE ocr_job_id = ?""",
                    (
                        raw.get("_provider_request_id"),
                        raw_location,
                        now(),
                        job_id,
                    ),
                )
            latest_submission = self.database.fetchone(
                "SELECT processing_mode FROM submissions WHERE submission_id = ?",
                (submission_id,),
            )
            if (
                latest_submission
                and latest_submission["processing_mode"] != "full_manual"
            ):
                self._run_mapping(submission_id, job_id, f"{idempotency_key}:mapping")
        except (
            ProviderError,
            OSError,
            ValueError,
            TypeError,
            sqlite3.DatabaseError,
        ) as exc:
            self._fail_ocr(job_id, submission_id, exc)

    def _fail_ocr(self, job_id: str, submission_id: str, exc: BaseException) -> None:
        failure_code = (
            "ocr_failed" if isinstance(exc, ProviderError) else "invalid_ocr_result"
        )
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            cursor = connection.execute(
                """UPDATE ocr_jobs SET status = 'failed', failure_code = ?,
                   completed_at = ?
                   WHERE ocr_job_id = ?
                     AND status IN ('queued', 'processing', 'retrying')""",
                (failure_code, now(), job_id),
            )
            if cursor.rowcount:
                connection.execute(
                    """UPDATE submissions SET status = 'awaiting_review',
                       processing_mode = 'full_manual', fallback_reason = ?
                       WHERE submission_id = ?
                         AND processing_mode != 'full_manual'""",
                    (failure_code, submission_id),
                )

    def rerun_mapping(self, submission_id: str, idempotency_key: str) -> None:
        ocr_job = self.database.fetchone(
            """SELECT * FROM ocr_jobs WHERE submission_id = ? AND status = 'completed'
               ORDER BY created_at DESC LIMIT 1""",
            (submission_id,),
        )
        if not ocr_job:
            return
        self._run_mapping(submission_id, ocr_job["ocr_job_id"], idempotency_key)

    def _run_mapping(
        self, submission_id: str, ocr_job_id: str, idempotency_key: str
    ) -> None:
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            submission_state = connection.execute(
                "SELECT processing_mode FROM submissions WHERE submission_id = ?",
                (submission_id,),
            ).fetchone()
            if (
                not submission_state
                or submission_state["processing_mode"] == "full_manual"
            ):
                return
            existing = connection.execute(
                """SELECT * FROM mapping_jobs
                   WHERE submission_id = ? AND idempotency_key = ?""",
                (submission_id, idempotency_key),
            ).fetchone()
            if existing and existing["status"] in {"completed", "failed", "cancelled"}:
                return
            job_id = existing["mapping_job_id"] if existing else str(uuid4())
            if not existing:
                connection.execute(
                    """INSERT INTO mapping_jobs
                   (mapping_job_id, submission_id, ocr_job_id, model_name, prompt_version,
                    idempotency_key, status, created_at)
                   VALUES (?, ?, ?, ?, 'v1', ?, 'queued', ?)""",
                    (
                        job_id,
                        submission_id,
                        ocr_job_id,
                        self.mapping_provider.model_name,
                        idempotency_key,
                        now(),
                    ),
                )
        submission = self.database.fetchone(
            "SELECT * FROM submissions WHERE submission_id = ?", (submission_id,)
        )
        rubric_items = self.database.fetchall(
            """SELECT * FROM rubric_items WHERE submission_id = ?
               ORDER BY position""",
            (submission_id,),
        )
        blocks = self.database.fetchall(
            """SELECT * FROM ocr_blocks WHERE ocr_job_id = ?
               ORDER BY page_number, reading_order""",
            (ocr_job_id,),
        )
        payload = {
            "question": {
                "question_id": submission["question_id"],
                "content": submission["question_content"],
            },
            "rubric_items": [
                {
                    "rubric_item_id": item["rubric_item_id"],
                    "description": item["description"],
                    "topic_tags": json.loads(item["topic_tags_json"]),
                }
                for item in rubric_items
            ],
            "ocr_blocks": [
                {
                    "block_id": block["block_id"],
                    "page_number": block["page_number"],
                    "reading_order": block["reading_order"],
                    "content": block["content"],
                    "content_type": block["content_type"],
                    "bounding_box": json.loads(block["bounding_box_json"]),
                    "ocr_confidence": block["ocr_confidence"],
                }
                for block in blocks
            ],
        }
        try:
            raw = self._call_mapping_with_retry(job_id, payload)
            mappings = validate_mapping_output(
                raw,
                {item["rubric_item_id"] for item in rubric_items},
                {block["block_id"] for block in blocks},
            )
            current = self.database.fetchone(
                """SELECT j.status AS job_status, s.processing_mode
                   FROM mapping_jobs j JOIN submissions s
                     ON s.submission_id = j.submission_id
                   WHERE j.mapping_job_id = ?""",
                (job_id,),
            )
            if (
                not current
                or current["job_status"] in {"cancelled", "completed"}
                or current["processing_mode"] == "full_manual"
            ):
                return
            with self.database.connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                locked_state = connection.execute(
                    """SELECT j.status AS job_status, s.processing_mode
                       FROM mapping_jobs j JOIN submissions s
                         ON s.submission_id = j.submission_id
                       WHERE j.mapping_job_id = ?""",
                    (job_id,),
                ).fetchone()
                if (
                    not locked_state
                    or locked_state["job_status"] in {"cancelled", "completed"}
                    or locked_state["processing_mode"] == "full_manual"
                ):
                    return
                for mapping in mappings:
                    connection.execute(
                        """INSERT INTO draft_mappings
                           (mapping_job_id, rubric_item_id, evidence_block_ids_json,
                            mapping_confidence) VALUES (?, ?, ?, ?)""",
                        (
                            job_id,
                            mapping.rubric_item_id,
                            json.dumps(mapping.evidence_block_ids),
                            mapping.mapping_confidence,
                        ),
                    )
                connection.execute(
                    """UPDATE mapping_jobs SET status = 'completed', completed_at = ?
                       WHERE mapping_job_id = ?""",
                    (now(), job_id),
                )
                connection.execute(
                    """UPDATE submissions SET status = 'awaiting_review',
                       processing_mode = 'ai_assisted', fallback_reason = NULL
                       WHERE submission_id = ?""",
                    (submission_id,),
                )
        except ProcessingCancelled:
            self.database.execute(
                """UPDATE mapping_jobs SET status = 'cancelled', completed_at = ?
                   WHERE mapping_job_id = ?
                     AND status IN ('queued', 'processing', 'retrying')""",
                (now(), job_id),
            )
        except (ProviderError, MappingValidationError, ValueError):
            failure_code = (
                "invalid_mapping_schema"
                if isinstance(locals().get("raw"), dict)
                else "mapping_failed"
            )
            with self.database.connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                cursor = connection.execute(
                    """UPDATE mapping_jobs SET status = 'failed', failure_code = ?,
                       completed_at = ?
                       WHERE mapping_job_id = ?
                         AND status IN ('queued', 'processing', 'retrying')""",
                    (failure_code, now(), job_id),
                )
                if cursor.rowcount:
                    connection.execute(
                        """UPDATE submissions SET status = 'awaiting_review',
                           processing_mode = 'partial_fallback', fallback_reason = ?
                           WHERE submission_id = ?
                             AND processing_mode != 'full_manual'""",
                        (failure_code, submission_id),
                    )
