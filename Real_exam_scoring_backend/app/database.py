from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS submissions (
    submission_id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    assessment_template_id TEXT NOT NULL,
    question_id TEXT NOT NULL,
    question_content TEXT NOT NULL,
    processing_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    fallback_reason TEXT,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 0,
    idempotency_key TEXT NOT NULL,
    UNIQUE(created_by, idempotency_key)
);
CREATE TABLE IF NOT EXISTS rubric_items (
    submission_id TEXT NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
    rubric_item_id TEXT NOT NULL,
    description TEXT NOT NULL,
    topic_tags_json TEXT NOT NULL,
    max_points REAL NOT NULL DEFAULT 0,
    position INTEGER NOT NULL,
    PRIMARY KEY(submission_id, rubric_item_id)
);
CREATE TABLE IF NOT EXISTS submission_files (
    file_id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    media_type TEXT NOT NULL,
    checksum TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    upload_status TEXT NOT NULL,
    image_quality_status TEXT NOT NULL,
    quality_warnings_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    UNIQUE(submission_id, checksum)
);
CREATE TABLE IF NOT EXISTS upload_sessions (
    upload_id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    media_type TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    total_parts INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS upload_parts (
    upload_id TEXT NOT NULL REFERENCES upload_sessions(upload_id) ON DELETE CASCADE,
    part_number INTEGER NOT NULL,
    checksum TEXT NOT NULL,
    size INTEGER NOT NULL,
    PRIMARY KEY(upload_id, part_number)
);
CREATE TABLE IF NOT EXISTS ocr_jobs (
    ocr_job_id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    provider_request_id TEXT,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    raw_response_location TEXT,
    failure_code TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE(submission_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS ocr_blocks (
    block_id TEXT PRIMARY KEY,
    ocr_job_id TEXT NOT NULL REFERENCES ocr_jobs(ocr_job_id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    reading_order INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL,
    bounding_box_json TEXT NOT NULL,
    ocr_confidence REAL
);
CREATE TABLE IF NOT EXISTS mapping_jobs (
    mapping_job_id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
    ocr_job_id TEXT NOT NULL REFERENCES ocr_jobs(ocr_job_id),
    model_name TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    status TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    failure_code TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    UNIQUE(submission_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS draft_mappings (
    mapping_job_id TEXT NOT NULL REFERENCES mapping_jobs(mapping_job_id) ON DELETE CASCADE,
    rubric_item_id TEXT NOT NULL,
    evidence_block_ids_json TEXT NOT NULL,
    mapping_confidence REAL NOT NULL,
    PRIMARY KEY(mapping_job_id, rubric_item_id)
);
CREATE TABLE IF NOT EXISTS reviews (
    submission_id TEXT NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
    rubric_item_id TEXT NOT NULL,
    status TEXT NOT NULL,
    evidence_block_ids_json TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(submission_id, rubric_item_id)
);
CREATE TABLE IF NOT EXISTS approval_requests (
    submission_id TEXT NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    version INTEGER NOT NULL,
    PRIMARY KEY(submission_id, idempotency_key)
);
CREATE TABLE IF NOT EXISTS approved_mappings (
    approved_mapping_id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
    rubric_item_id TEXT NOT NULL,
    status TEXT NOT NULL,
    evidence_block_ids_json TEXT NOT NULL,
    evidence_snapshot_json TEXT NOT NULL,
    ocr_confidence REAL,
    mapping_confidence REAL,
    mapping_method TEXT NOT NULL,
    approved_by TEXT NOT NULL,
    approved_at TEXT NOT NULL,
    version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS review_audit_logs (
    audit_id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES submissions(submission_id) ON DELETE CASCADE,
    rubric_item_id TEXT,
    action TEXT NOT NULL,
    previous_value_json TEXT,
    new_value_json TEXT,
    actor_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_submission ON submission_files(submission_id);
CREATE INDEX IF NOT EXISTS idx_ocr_jobs_submission ON ocr_jobs(submission_id);
CREATE INDEX IF NOT EXISTS idx_mapping_jobs_submission ON mapping_jobs(submission_id);
CREATE INDEX IF NOT EXISTS idx_audit_submission ON review_audit_logs(submission_id, occurred_at);
"""


class Database:
    def __init__(self, path: Path):
        self.path = Path(path)

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript(SCHEMA)
            file_columns = {
                row["name"]
                for row in connection.execute(
                    "PRAGMA table_info(submission_files)"
                ).fetchall()
            }
            if "quality_warnings_json" not in file_columns:
                connection.execute(
                    """ALTER TABLE submission_files
                       ADD COLUMN quality_warnings_json TEXT NOT NULL DEFAULT '[]'"""
                )
            approval_columns = {
                row["name"]
                for row in connection.execute(
                    "PRAGMA table_info(approved_mappings)"
                ).fetchall()
            }
            if "evidence_snapshot_json" not in approval_columns:
                connection.execute(
                    """ALTER TABLE approved_mappings
                       ADD COLUMN evidence_snapshot_json TEXT NOT NULL DEFAULT '[]'"""
                )
            rubric_columns = {
                row["name"]
                for row in connection.execute(
                    "PRAGMA table_info(rubric_items)"
                ).fetchall()
            }
            if "max_points" not in rubric_columns:
                connection.execute(
                    """ALTER TABLE rubric_items
                       ADD COLUMN max_points REAL NOT NULL DEFAULT 0"""
                )

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=30)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def fetchone(
        self, sql: str, parameters: tuple[Any, ...] = ()
    ) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(sql, parameters).fetchone()
            return dict(row) if row else None

    def fetchall(
        self, sql: str, parameters: tuple[Any, ...] = ()
    ) -> list[dict[str, Any]]:
        with self.connect() as connection:
            return [dict(row) for row in connection.execute(sql, parameters).fetchall()]

    def execute(self, sql: str, parameters: tuple[Any, ...] = ()) -> None:
        with self.connect() as connection:
            connection.execute(sql, parameters)
