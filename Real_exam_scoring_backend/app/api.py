from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Request,
    Response,
    UploadFile,
)
from fastapi.responses import FileResponse

from .config import Settings
from .database import Database
from .pipeline import Pipeline
from .schemas import OCRContentUpdate, ReviewUpdate, SubmissionCreate, UploadCreate
from .storage import ALLOWED_MEDIA_TYPES, LocalStorage


router = APIRouter(prefix="/api")


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def teacher(
    x_teacher_id: Annotated[str | None, Header()] = None,
    x_role: Annotated[str | None, Header()] = None,
) -> str:
    if not x_teacher_id:
        raise HTTPException(401, "X-Teacher-Id is required")
    if x_role != "teacher":
        raise HTTPException(403, "Teacher role is required")
    return x_teacher_id


def idempotency_key(
    value: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> str:
    if not value or len(value) > 200:
        raise HTTPException(400, "A valid Idempotency-Key is required")
    return value


def database(request: Request) -> Database:
    return request.app.state.database


def storage(request: Request) -> LocalStorage:
    return request.app.state.storage


def pipeline(request: Request) -> Pipeline:
    return request.app.state.pipeline


def settings(request: Request) -> Settings:
    return request.app.state.settings


def owned_submission(db: Database, submission_id: str, actor: str) -> dict[str, Any]:
    row = db.fetchone(
        "SELECT * FROM submissions WHERE submission_id = ? AND created_by = ?",
        (submission_id, actor),
    )
    if not row:
        raise HTTPException(404, "Submission not found")
    return row


def decode_rows(rows: list[dict[str, Any]], *json_fields: str) -> list[dict[str, Any]]:
    for row in rows:
        for field in json_fields:
            if field in row and row[field] is not None:
                row[field.removesuffix("_json")] = json.loads(row.pop(field))
    return rows


def detail(db: Database, submission: dict[str, Any]) -> dict[str, Any]:
    submission_id = submission["submission_id"]
    result = dict(submission)
    result["question"] = {
        "question_id": result.pop("question_id"),
        "content": result.pop("question_content"),
    }
    result.pop("idempotency_key", None)
    result["rubric_items"] = decode_rows(
        db.fetchall(
            """SELECT rubric_item_id, description, topic_tags_json, max_points, position
               FROM rubric_items WHERE submission_id = ? ORDER BY position""",
            (submission_id,),
        ),
        "topic_tags_json",
    )
    result["files"] = decode_rows(
        db.fetchall(
            """SELECT file_id, page_number, file_name, media_type, checksum, upload_status,
                  image_quality_status, quality_warnings_json FROM submission_files
           WHERE submission_id = ? ORDER BY page_number""",
            (submission_id,),
        ),
        "quality_warnings_json",
    )
    page_numbers = sorted({row["page_number"] for row in result["files"]})
    missing_pages = (
        sorted(set(range(1, max(page_numbers) + 1)) - set(page_numbers))
        if page_numbers
        else []
    )
    result["quality_warnings"] = (
        [{"code": "warning_missing_pages", "page_numbers": missing_pages}]
        if missing_pages
        else []
    )
    result["ocr_jobs"] = db.fetchall(
        """SELECT ocr_job_id, provider, provider_request_id, status, attempt_count,
                  failure_code, created_at, completed_at FROM ocr_jobs
           WHERE submission_id = ? ORDER BY created_at""",
        (submission_id,),
    )
    result["mapping_jobs"] = db.fetchall(
        """SELECT mapping_job_id, ocr_job_id, model_name, prompt_version, status,
                  attempt_count, failure_code, created_at, completed_at FROM mapping_jobs
           WHERE submission_id = ? ORDER BY created_at""",
        (submission_id,),
    )
    result["ocr_blocks"] = decode_rows(
        db.fetchall(
            """SELECT b.block_id, b.page_number, b.reading_order, b.content,
                      b.content_type, b.bounding_box_json, b.ocr_confidence
               FROM ocr_blocks b JOIN ocr_jobs j ON j.ocr_job_id = b.ocr_job_id
               WHERE j.submission_id = ?
               ORDER BY j.created_at DESC, b.page_number, b.reading_order""",
            (submission_id,),
        ),
        "bounding_box_json",
    )
    result["draft_mappings"] = decode_rows(
        db.fetchall(
            """SELECT d.mapping_job_id, d.rubric_item_id, d.evidence_block_ids_json,
                      d.mapping_confidence
               FROM draft_mappings d JOIN mapping_jobs j
                 ON j.mapping_job_id = d.mapping_job_id
               WHERE j.submission_id = ? AND j.status = 'completed'
               ORDER BY j.created_at DESC, d.rubric_item_id""",
            (submission_id,),
        ),
        "evidence_block_ids_json",
    )
    result["reviews"] = decode_rows(
        db.fetchall(
            """SELECT rubric_item_id, status, evidence_block_ids_json, updated_by, updated_at
               FROM reviews WHERE submission_id = ? ORDER BY rubric_item_id""",
            (submission_id,),
        ),
        "evidence_block_ids_json",
    )
    return result


@router.post("/submissions", status_code=201)
def create_submission(
    payload: SubmissionCreate,
    response: Response,
    actor: Annotated[str, Depends(teacher)],
    key: Annotated[str, Depends(idempotency_key)],
    db: Annotated[Database, Depends(database)],
) -> dict[str, Any]:
    existing = db.fetchone(
        "SELECT * FROM submissions WHERE created_by = ? AND idempotency_key = ?",
        (actor, key),
    )
    if existing:
        response.status_code = 200
        return detail(db, existing)
    submission_id = str(uuid4())
    created = utcnow()
    concurrent_existing: dict[str, Any] | None = None
    with db.connect() as connection:
        cursor = connection.execute(
            """INSERT OR IGNORE INTO submissions
               (submission_id, class_id, student_id, assessment_template_id,
                question_id, question_content, processing_mode, status, created_by,
                created_at, idempotency_key)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)""",
            (
                submission_id,
                payload.class_id,
                payload.student_id,
                payload.assessment_template_id,
                payload.question.question_id,
                payload.question.content,
                payload.processing_mode,
                actor,
                created,
                key,
            ),
        )
        if cursor.rowcount == 0:
            row = connection.execute(
                """SELECT * FROM submissions
                   WHERE created_by = ? AND idempotency_key = ?""",
                (actor, key),
            ).fetchone()
            concurrent_existing = dict(row)
        else:
            for position, item in enumerate(payload.rubric_items):
                connection.execute(
                    """INSERT INTO rubric_items
                       (submission_id, rubric_item_id, description, topic_tags_json,
                        max_points, position)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        submission_id,
                        item.rubric_item_id,
                        item.description,
                        json.dumps(item.topic_tags, ensure_ascii=False),
                        item.max_points,
                        position,
                    ),
                )
    if concurrent_existing:
        response.status_code = 200
        return detail(db, concurrent_existing)
    return detail(
        db,
        db.fetchone(
            "SELECT * FROM submissions WHERE submission_id = ?", (submission_id,)
        ),
    )


@router.get("/submissions/{submission_id}")
def get_submission(
    submission_id: str,
    actor: Annotated[str, Depends(teacher)],
    db: Annotated[Database, Depends(database)],
) -> dict[str, Any]:
    return detail(db, owned_submission(db, submission_id, actor))


@router.get("/files/{file_id}/content", response_class=FileResponse)
def get_file_content(
    file_id: str,
    actor: Annotated[str, Depends(teacher)],
    db: Annotated[Database, Depends(database)],
    store: Annotated[LocalStorage, Depends(storage)],
) -> FileResponse:
    row = db.fetchone(
        """SELECT f.* FROM submission_files f JOIN submissions s
             ON s.submission_id = f.submission_id
           WHERE f.file_id = ? AND s.created_by = ?""",
        (file_id, actor),
    )
    if not row:
        raise HTTPException(404, "File not found")
    return FileResponse(
        store.root / row["storage_key"],
        media_type=row["media_type"],
        filename=row["file_name"],
        content_disposition_type="inline",
    )


def insert_file(
    db: Database,
    store: LocalStorage,
    submission_id: str,
    file_name: str,
    media_type: str,
    page_number: int,
    checksum: str,
    content: bytes,
) -> tuple[dict[str, Any], bool]:
    existing = db.fetchone(
        "SELECT * FROM submission_files WHERE submission_id = ? AND checksum = ?",
        (submission_id, checksum),
    )
    if existing:
        return existing, False
    file_id = str(uuid4())
    storage_key = store.save_file(file_id, content)
    quality_warnings = store.image_quality_warnings(content, media_type)
    image_quality_status = (
        "not_applicable"
        if media_type == "application/pdf"
        else (quality_warnings[0] if quality_warnings else "acceptable")
    )
    db.execute(
        """INSERT INTO submission_files
           (file_id, submission_id, page_number, file_name, media_type, checksum,
            storage_key, upload_status, image_quality_status, quality_warnings_json,
            created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)""",
        (
            file_id,
            submission_id,
            page_number,
            file_name,
            media_type,
            checksum,
            storage_key,
            image_quality_status,
            json.dumps(quality_warnings),
            utcnow(),
        ),
    )
    return db.fetchone(
        "SELECT * FROM submission_files WHERE file_id = ?", (file_id,)
    ), True


@router.post("/submissions/{submission_id}/files", status_code=201)
async def upload_file(
    submission_id: str,
    response: Response,
    actor: Annotated[str, Depends(teacher)],
    db: Annotated[Database, Depends(database)],
    store: Annotated[LocalStorage, Depends(storage)],
    config: Annotated[Settings, Depends(settings)],
    file: Annotated[UploadFile, File()],
    page_number: Annotated[int, Form(ge=1, le=10_000)],
    checksum: Annotated[str, Form(pattern=r"^[a-fA-F0-9]{64}$")],
) -> dict[str, Any]:
    owned_submission(db, submission_id, actor)
    media_type = file.content_type or ""
    if media_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(415, "Unsupported media type")
    content = await file.read(config.max_file_bytes + 1)
    if len(content) > config.max_file_bytes:
        raise HTTPException(413, "File too large")
    if store.checksum(content) != checksum.lower():
        raise HTTPException(422, "File checksum mismatch")
    row, created = insert_file(
        db,
        store,
        submission_id,
        file.filename or "upload",
        media_type,
        page_number,
        checksum,
        content,
    )
    if not created:
        response.status_code = 200
    result = {
        key: row[key]
        for key in (
            "file_id",
            "page_number",
            "file_name",
            "media_type",
            "checksum",
            "upload_status",
            "image_quality_status",
        )
    }
    result["quality_warnings"] = json.loads(row["quality_warnings_json"])
    return result


@router.post("/submissions/{submission_id}/uploads", status_code=201)
def create_upload(
    submission_id: str,
    payload: UploadCreate,
    actor: Annotated[str, Depends(teacher)],
    db: Annotated[Database, Depends(database)],
) -> dict[str, Any]:
    owned_submission(db, submission_id, actor)
    upload_id = str(uuid4())
    db.execute(
        """INSERT INTO upload_sessions
           (upload_id, submission_id, file_name, media_type, page_number,
            total_parts, checksum, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'uploading', ?)""",
        (
            upload_id,
            submission_id,
            payload.file_name,
            payload.media_type,
            payload.page_number,
            payload.total_parts,
            payload.checksum.lower(),
            utcnow(),
        ),
    )
    return {
        "upload_id": upload_id,
        "missing_parts": list(range(1, payload.total_parts + 1)),
    }


def owned_upload(db: Database, upload_id: str, actor: str) -> dict[str, Any]:
    row = db.fetchone(
        """SELECT u.* FROM upload_sessions u JOIN submissions s
             ON s.submission_id = u.submission_id
           WHERE u.upload_id = ? AND s.created_by = ?""",
        (upload_id, actor),
    )
    if not row:
        raise HTTPException(404, "Upload not found")
    return row


@router.get("/uploads/{upload_id}")
def upload_status(
    upload_id: str,
    actor: Annotated[str, Depends(teacher)],
    db: Annotated[Database, Depends(database)],
) -> dict[str, Any]:
    upload = owned_upload(db, upload_id, actor)
    received = {
        row["part_number"]
        for row in db.fetchall(
            "SELECT part_number FROM upload_parts WHERE upload_id = ?", (upload_id,)
        )
    }
    return {
        "upload_id": upload_id,
        "status": upload["status"],
        "missing_parts": [
            number
            for number in range(1, upload["total_parts"] + 1)
            if number not in received
        ],
    }


@router.put("/uploads/{upload_id}/parts/{part_number}", status_code=204)
async def upload_part(
    upload_id: str,
    part_number: int,
    request: Request,
    part_checksum: Annotated[str | None, Header(alias="X-Part-Checksum")],
    actor: Annotated[str, Depends(teacher)],
    db: Annotated[Database, Depends(database)],
    store: Annotated[LocalStorage, Depends(storage)],
    config: Annotated[Settings, Depends(settings)],
) -> Response:
    upload = owned_upload(db, upload_id, actor)
    if upload["status"] != "uploading":
        raise HTTPException(409, "Upload is not active")
    if part_number < 1 or part_number > upload["total_parts"]:
        raise HTTPException(422, "Invalid part number")
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > config.max_file_bytes:
            raise HTTPException(413, "Upload part is too large")
        chunks.append(chunk)
    content = b"".join(chunks)
    if not part_checksum or store.checksum(content) != part_checksum.lower():
        raise HTTPException(422, "Part checksum mismatch")
    store.save_part(upload_id, part_number, content)
    db.execute(
        """INSERT INTO upload_parts(upload_id, part_number, checksum, size)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(upload_id, part_number) DO UPDATE SET
             checksum = excluded.checksum, size = excluded.size""",
        (upload_id, part_number, part_checksum.lower(), len(content)),
    )
    return Response(status_code=204)


@router.post("/uploads/{upload_id}/complete", status_code=201)
def complete_upload(
    upload_id: str,
    response: Response,
    actor: Annotated[str, Depends(teacher)],
    db: Annotated[Database, Depends(database)],
    store: Annotated[LocalStorage, Depends(storage)],
    config: Annotated[Settings, Depends(settings)],
) -> dict[str, Any]:
    upload = owned_upload(db, upload_id, actor)
    status = upload_status(upload_id, actor, db)
    if status["missing_parts"]:
        raise HTTPException(409, "Upload has missing parts")
    sizes = db.fetchone(
        "SELECT COALESCE(SUM(size), 0) AS total_size FROM upload_parts WHERE upload_id = ?",
        (upload_id,),
    )
    if sizes and sizes["total_size"] > config.max_file_bytes:
        raise HTTPException(413, "Completed file is too large")
    content = store.combine_parts(upload_id, upload["total_parts"])
    if store.checksum(content) != upload["checksum"]:
        raise HTTPException(422, "File checksum mismatch")
    row, created = insert_file(
        db,
        store,
        upload["submission_id"],
        upload["file_name"],
        upload["media_type"],
        upload["page_number"],
        upload["checksum"],
        content,
    )
    db.execute(
        "UPDATE upload_sessions SET status = 'completed' WHERE upload_id = ?",
        (upload_id,),
    )
    store.remove_parts(upload_id)
    if not created:
        response.status_code = 200
    return {"file_id": row["file_id"], "checksum": row["checksum"]}


@router.post("/submissions/{submission_id}/process", status_code=202)
def process_submission(
    submission_id: str,
    background: BackgroundTasks,
    actor: Annotated[str, Depends(teacher)],
    key: Annotated[str, Depends(idempotency_key)],
    db: Annotated[Database, Depends(database)],
    runner: Annotated[Pipeline, Depends(pipeline)],
) -> dict[str, str]:
    submission = owned_submission(db, submission_id, actor)
    existing = db.fetchone(
        """SELECT status FROM ocr_jobs
           WHERE submission_id = ? AND idempotency_key = ?""",
        (submission_id, key),
    )
    if existing:
        background.add_task(runner.process, submission_id, key)
        return {"submission_id": submission_id, "status": submission["status"]}
    if submission["processing_mode"] != "full_manual":
        files = db.fetchone(
            "SELECT file_id FROM submission_files WHERE submission_id = ? LIMIT 1",
            (submission_id,),
        )
        if not files:
            raise HTTPException(409, "At least one file is required")
    db.execute(
        "UPDATE submissions SET status = 'processing' WHERE submission_id = ?",
        (submission_id,),
    )
    background.add_task(runner.process, submission_id, key)
    return {"submission_id": submission_id, "status": "processing"}


@router.post("/submissions/{submission_id}/mapping-jobs", status_code=202)
def rerun_mapping(
    submission_id: str,
    background: BackgroundTasks,
    actor: Annotated[str, Depends(teacher)],
    key: Annotated[str, Depends(idempotency_key)],
    db: Annotated[Database, Depends(database)],
    runner: Annotated[Pipeline, Depends(pipeline)],
) -> dict[str, str]:
    owned_submission(db, submission_id, actor)
    completed = db.fetchone(
        "SELECT ocr_job_id FROM ocr_jobs WHERE submission_id = ? AND status = 'completed'",
        (submission_id,),
    )
    if not completed:
        raise HTTPException(409, "A completed OCR job is required")
    background.add_task(runner.rerun_mapping, submission_id, key)
    return {"submission_id": submission_id, "status": "processing"}


@router.patch("/submissions/{submission_id}/ocr-blocks/{block_id}")
def edit_ocr_content(
    submission_id: str,
    block_id: str,
    payload: OCRContentUpdate,
    actor: Annotated[str, Depends(teacher)],
    db: Annotated[Database, Depends(database)],
) -> dict[str, Any]:
    submission = owned_submission(db, submission_id, actor)
    block = db.fetchone(
        """SELECT b.* FROM ocr_blocks b JOIN ocr_jobs j ON j.ocr_job_id = b.ocr_job_id
           WHERE b.block_id = ? AND j.submission_id = ?""",
        (block_id, submission_id),
    )
    if not block:
        raise HTTPException(404, "OCR block not found")
    timestamp = utcnow()
    with db.connect() as connection:
        connection.execute(
            "UPDATE ocr_blocks SET content = ? WHERE block_id = ?",
            (payload.content, block_id),
        )
        if submission["status"] == "approved":
            connection.execute(
                """UPDATE submissions SET status = 'awaiting_review'
                   WHERE submission_id = ?""",
                (submission_id,),
            )
        connection.execute(
            """INSERT INTO review_audit_logs
               (audit_id, submission_id, action, previous_value_json, new_value_json,
                actor_id, occurred_at)
               VALUES (?, ?, 'ocr_content_edited', ?, ?, ?, ?)""",
            (
                str(uuid4()),
                submission_id,
                json.dumps(
                    {"block_id": block_id, "content": block["content"]},
                    ensure_ascii=False,
                ),
                json.dumps(
                    {"block_id": block_id, "content": payload.content},
                    ensure_ascii=False,
                ),
                actor,
                timestamp,
            ),
        )
    return {"block_id": block_id, "content": payload.content}


@router.post("/submissions/{submission_id}/manual")
def switch_to_manual(
    submission_id: str,
    actor: Annotated[str, Depends(teacher)],
    db: Annotated[Database, Depends(database)],
) -> dict[str, Any]:
    submission = owned_submission(db, submission_id, actor)
    if submission["status"] == "approved":
        raise HTTPException(
            409, "Create a new review version instead of changing approved mode"
        )
    timestamp = utcnow()
    with db.connect() as connection:
        connection.execute(
            """UPDATE ocr_jobs SET status = 'cancelled', completed_at = ?
               WHERE submission_id = ? AND status IN ('queued', 'processing', 'retrying')""",
            (timestamp, submission_id),
        )
        connection.execute(
            """UPDATE mapping_jobs SET status = 'cancelled', completed_at = ?
               WHERE submission_id = ? AND status IN ('queued', 'processing', 'retrying')""",
            (timestamp, submission_id),
        )
        connection.execute(
            """UPDATE submissions SET processing_mode = 'full_manual',
               fallback_reason = 'teacher_selected_manual', status = 'awaiting_review'
               WHERE submission_id = ?""",
            (submission_id,),
        )
        connection.execute(
            """INSERT INTO review_audit_logs
               (audit_id, submission_id, action, previous_value_json, new_value_json,
                actor_id, occurred_at)
               VALUES (?, ?, 'switched_to_manual', ?, ?, ?, ?)""",
            (
                str(uuid4()),
                submission_id,
                json.dumps(
                    {
                        "processing_mode": submission["processing_mode"],
                        "status": submission["status"],
                    }
                ),
                json.dumps(
                    {
                        "processing_mode": "full_manual",
                        "fallback_reason": "teacher_selected_manual",
                    }
                ),
                actor,
                timestamp,
            ),
        )
    return {
        "submission_id": submission_id,
        "processing_mode": "full_manual",
        "fallback_reason": "teacher_selected_manual",
        "status": "awaiting_review",
    }


@router.put("/submissions/{submission_id}/reviews/{rubric_item_id}")
def update_review(
    submission_id: str,
    rubric_item_id: str,
    payload: ReviewUpdate,
    actor: Annotated[str, Depends(teacher)],
    db: Annotated[Database, Depends(database)],
) -> dict[str, Any]:
    submission = owned_submission(db, submission_id, actor)
    if submission["status"] not in {"awaiting_review", "approved"}:
        raise HTTPException(409, "Submission is not ready for review")
    rubric = db.fetchone(
        "SELECT 1 FROM rubric_items WHERE submission_id = ? AND rubric_item_id = ?",
        (submission_id, rubric_item_id),
    )
    if not rubric:
        raise HTTPException(404, "Rubric item not found")
    if payload.evidence_block_ids:
        placeholders = ",".join("?" for _ in payload.evidence_block_ids)
        rows = db.fetchall(
            f"""SELECT b.block_id FROM ocr_blocks b JOIN ocr_jobs j
                  ON j.ocr_job_id = b.ocr_job_id
                WHERE j.submission_id = ? AND b.block_id IN ({placeholders})""",
            (submission_id, *payload.evidence_block_ids),
        )
        if {row["block_id"] for row in rows} != set(payload.evidence_block_ids):
            raise HTTPException(422, "Unknown evidence block")
    previous = db.fetchone(
        "SELECT * FROM reviews WHERE submission_id = ? AND rubric_item_id = ?",
        (submission_id, rubric_item_id),
    )
    timestamp = utcnow()
    evidence_json = json.dumps(payload.evidence_block_ids)
    with db.connect() as connection:
        connection.execute(
            """INSERT INTO reviews
               (submission_id, rubric_item_id, status, evidence_block_ids_json,
                updated_by, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(submission_id, rubric_item_id) DO UPDATE SET
                 status = excluded.status,
                 evidence_block_ids_json = excluded.evidence_block_ids_json,
                 updated_by = excluded.updated_by,
                 updated_at = excluded.updated_at""",
            (
                submission_id,
                rubric_item_id,
                payload.status,
                evidence_json,
                actor,
                timestamp,
            ),
        )
        connection.execute(
            """INSERT INTO review_audit_logs
               (audit_id, submission_id, rubric_item_id, action, previous_value_json,
                new_value_json, actor_id, occurred_at)
               VALUES (?, ?, ?, 'review_updated', ?, ?, ?, ?)""",
            (
                str(uuid4()),
                submission_id,
                rubric_item_id,
                json.dumps(previous, ensure_ascii=False) if previous else None,
                json.dumps(payload.model_dump(), ensure_ascii=False),
                actor,
                timestamp,
            ),
        )
    return {
        "rubric_item_id": rubric_item_id,
        "status": payload.status,
        "evidence_block_ids": payload.evidence_block_ids,
    }


@router.post("/submissions/{submission_id}/approve", status_code=201)
def approve(
    submission_id: str,
    response: Response,
    actor: Annotated[str, Depends(teacher)],
    key: Annotated[str, Depends(idempotency_key)],
    db: Annotated[Database, Depends(database)],
) -> dict[str, Any]:
    submission = owned_submission(db, submission_id, actor)
    if submission["status"] not in {"awaiting_review", "approved"}:
        raise HTTPException(409, "Submission is not ready for approval")
    if submission["processing_mode"] == "ai_assisted":
        completed_mapping = db.fetchone(
            """SELECT 1 FROM mapping_jobs
               WHERE submission_id = ? AND status = 'completed' LIMIT 1""",
            (submission_id,),
        )
        if not completed_mapping:
            raise HTTPException(409, "A completed mapping job is required")
    if submission["processing_mode"] == "partial_fallback":
        completed_ocr = db.fetchone(
            """SELECT 1 FROM ocr_jobs
               WHERE submission_id = ? AND status = 'completed' LIMIT 1""",
            (submission_id,),
        )
        if not completed_ocr:
            raise HTTPException(409, "A completed OCR job is required")
    existing = db.fetchone(
        """SELECT version FROM approval_requests
           WHERE submission_id = ? AND idempotency_key = ?""",
        (submission_id, key),
    )
    if existing:
        response.status_code = 200
        return approval_response(db, submission_id, existing["version"])
    rubric_items = db.fetchall(
        "SELECT rubric_item_id FROM rubric_items WHERE submission_id = ?",
        (submission_id,),
    )
    reviews = db.fetchall(
        "SELECT * FROM reviews WHERE submission_id = ?", (submission_id,)
    )
    if {row["rubric_item_id"] for row in reviews} != {
        row["rubric_item_id"] for row in rubric_items
    }:
        raise HTTPException(409, "Every rubric item must have a review status")
    version = int(submission["version"]) + 1
    timestamp = utcnow()
    method = {
        "ai_assisted": "ai_reviewed",
        "partial_fallback": "manual_after_ocr",
        "full_manual": "full_manual",
    }[submission["processing_mode"]]
    latest_mapping = db.fetchone(
        """SELECT mapping_job_id FROM mapping_jobs
           WHERE submission_id = ? AND status = 'completed'
           ORDER BY created_at DESC LIMIT 1""",
        (submission_id,),
    )
    with db.connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        locked_existing = connection.execute(
            """SELECT version FROM approval_requests
               WHERE submission_id = ? AND idempotency_key = ?""",
            (submission_id, key),
        ).fetchone()
        if locked_existing:
            response.status_code = 200
            return approval_response(
                db, submission_id, locked_existing["version"], connection
            )
        locked_submission = connection.execute(
            "SELECT version FROM submissions WHERE submission_id = ?",
            (submission_id,),
        ).fetchone()
        version = int(locked_submission["version"]) + 1
        for review in reviews:
            evidence_ids = json.loads(review["evidence_block_ids_json"])
            ocr_confidence = None
            if evidence_ids:
                placeholders = ",".join("?" for _ in evidence_ids)
                evidence_rows = connection.execute(
                    f"""SELECT block_id, page_number, reading_order, content, content_type,
                               bounding_box_json, ocr_confidence
                        FROM ocr_blocks WHERE block_id IN ({placeholders})""",
                    evidence_ids,
                ).fetchall()
                confidence_rows = [
                    row for row in evidence_rows if row["ocr_confidence"] is not None
                ]
                if confidence_rows:
                    ocr_confidence = sum(
                        row["ocr_confidence"] for row in confidence_rows
                    ) / len(confidence_rows)
                evidence_snapshot = [
                    {
                        **dict(row),
                        "bounding_box": json.loads(row["bounding_box_json"]),
                    }
                    for row in evidence_rows
                ]
                for snapshot in evidence_snapshot:
                    snapshot.pop("bounding_box_json", None)
            else:
                evidence_snapshot = []
            mapping_confidence = None
            if latest_mapping and method == "ai_reviewed":
                draft = connection.execute(
                    """SELECT mapping_confidence FROM draft_mappings
                       WHERE mapping_job_id = ? AND rubric_item_id = ?""",
                    (latest_mapping["mapping_job_id"], review["rubric_item_id"]),
                ).fetchone()
                if draft:
                    mapping_confidence = draft[0]
            connection.execute(
                """INSERT INTO approved_mappings
                   (approved_mapping_id, submission_id, rubric_item_id, status,
                    evidence_block_ids_json, evidence_snapshot_json, ocr_confidence, mapping_confidence,
                    mapping_method, approved_by, approved_at, version)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid4()),
                    submission_id,
                    review["rubric_item_id"],
                    review["status"],
                    review["evidence_block_ids_json"],
                    json.dumps(evidence_snapshot, ensure_ascii=False),
                    ocr_confidence,
                    mapping_confidence,
                    method,
                    actor,
                    timestamp,
                    version,
                ),
            )
        connection.execute(
            """INSERT INTO approval_requests(submission_id, idempotency_key, version)
               VALUES (?, ?, ?)""",
            (submission_id, key, version),
        )
        connection.execute(
            """UPDATE submissions SET status = 'approved', version = ?
               WHERE submission_id = ?""",
            (version, submission_id),
        )
        connection.execute(
            """INSERT INTO review_audit_logs
               (audit_id, submission_id, action, new_value_json, actor_id, occurred_at)
               VALUES (?, ?, 'submission_approved', ?, ?, ?)""",
            (
                str(uuid4()),
                submission_id,
                json.dumps({"version": version}),
                actor,
                timestamp,
            ),
        )
    return approval_response(db, submission_id, version)


def approval_response(
    db: Database,
    submission_id: str,
    version: int,
    connection: sqlite3.Connection | None = None,
) -> dict[str, Any]:
    sql = """SELECT approved_mapping_id, rubric_item_id, status,
                    evidence_block_ids_json, evidence_snapshot_json,
                    ocr_confidence, mapping_confidence,
                    mapping_method, approved_by, approved_at, version
             FROM approved_mappings WHERE submission_id = ? AND version = ?
             ORDER BY rubric_item_id"""
    if connection is None:
        rows = db.fetchall(sql, (submission_id, version))
    else:
        rows = [
            dict(row)
            for row in connection.execute(sql, (submission_id, version)).fetchall()
        ]
    items = decode_rows(
        rows,
        "evidence_block_ids_json",
        "evidence_snapshot_json",
    )
    return {"submission_id": submission_id, "version": version, "items": items}


@router.get("/submissions/{submission_id}/audit")
def audit(
    submission_id: str,
    actor: Annotated[str, Depends(teacher)],
    db: Annotated[Database, Depends(database)],
) -> list[dict[str, Any]]:
    owned_submission(db, submission_id, actor)
    return decode_rows(
        db.fetchall(
            """SELECT audit_id, rubric_item_id, action, previous_value_json,
                      new_value_json, actor_id, occurred_at
               FROM review_audit_logs WHERE submission_id = ? ORDER BY occurred_at""",
            (submission_id,),
        ),
        "previous_value_json",
        "new_value_json",
    )
