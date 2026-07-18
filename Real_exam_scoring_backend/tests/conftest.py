from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from starlette.testclient import TestClient

from app.config import Settings
from app.main import create_app


TEACHER_HEADERS = {"X-Teacher-Id": "teacher-1", "X-Role": "teacher"}


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    settings = Settings(
        database_path=tmp_path / "ocr.db",
        data_dir=tmp_path / "data",
        provider_mode="demo",
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture()
def submission_payload() -> dict:
    return {
        "class_id": "class-7A",
        "student_id": "student-01",
        "assessment_template_id": "math-midterm-v1",
        "question": {
            "question_id": "q1",
            "content": "Tính 1/2 + 1/4",
        },
        "rubric_items": [
            {
                "rubric_item_id": "r1",
                "description": "Quy đồng mẫu số",
                "topic_tags": ["fraction", "common_denominator"],
            },
            {
                "rubric_item_id": "r2",
                "description": "Tính kết quả 3/4",
                "topic_tags": ["fraction", "addition"],
            },
        ],
        "processing_mode": "ai_assisted",
    }


def create_submission(
    client: TestClient, payload: dict, key: str = "submission-1"
) -> dict:
    response = client.post(
        "/api/submissions",
        json=payload,
        headers={**TEACHER_HEADERS, "Idempotency-Key": key},
    )
    assert response.status_code == 201, response.text
    return response.json()


def upload_demo_file(
    client: TestClient, submission_id: str, content: bytes = b"handwriting"
) -> dict:
    response = client.post(
        f"/api/submissions/{submission_id}/files",
        headers=TEACHER_HEADERS,
        data={"page_number": "1", "checksum": hashlib.sha256(content).hexdigest()},
        files={"file": ("answer.png", content, "image/png")},
    )
    assert response.status_code == 201, response.text
    return response.json()
