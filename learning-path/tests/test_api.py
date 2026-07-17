"""FastAPI mỏng — cầu nối HTTP cho team TypeScript: tạo lộ trình → chờ duyệt → approve."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from learning_path.adapters import CurriculumGraph
from learning_path.api import create_app
from learning_path.schemas import PrerequisiteEdge, Topic

NOW = datetime(2026, 7, 17, 12, 0, tzinfo=timezone.utc)


@pytest.fixture(scope="module")
def client():
    curriculum = CurriculumGraph(
        topics={
            t: Topic(
                topic_id=t, subject_id="toan", grade_level=7, name=t, estimated_learning_time=30
            )
            for t in ["a", "b", "t"]
        },
        edges=[
            PrerequisiteEdge(prerequisite_topic_id="a", dependent_topic_id="b"),
            PrerequisiteEdge(prerequisite_topic_id="b", dependent_topic_id="t"),
        ],
    )
    return TestClient(create_app(curriculum))


def paper(sid: str, tid: str, i: int, correct: bool) -> dict:
    return {
        "evidence_id": f"{sid}:{tid}:{i}",
        "student_id": sid,
        "assessment_attempt_id": f"kt-{sid}",
        "question_id": f"cau-{i}",
        "rubric_item_id": f"r-{i}",
        "topic_id": tid,
        "points_earned": 4.0 if correct else 0.0,
        "points_possible": 4.0,
        "teacher_confirmed": True,
        "occurred_at": (NOW - timedelta(minutes=10 - i)).isoformat(),
    }


def create_body() -> dict:
    evidence = (
        [paper("minh", "a", i, True) for i in range(8)]
        + [paper("minh", "b", i, False) for i in range(8)]
        + [paper("minh", "t", i, False) for i in range(8)]
    )
    return {
        "request": {
            "class_id": "7A",
            "student_ids": ["minh"],
            "target_topic_ids": ["t"],
            "teacher_id": "co-lan",
        },
        "raw_paper": evidence,
        "raw_quiz": [],
        "as_of": NOW.isoformat(),
    }


def test_create_returns_draft_awaiting_approval(client):
    res = client.post("/learning-path", json=create_body())
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "awaiting_approval"
    assert body["thread_id"]
    assert body["paths"]["minh"]["status"] == "Draft"
    assert body["paths"]["minh"]["ordered_steps"][0]["topic_id"] == "b"


def test_approve_finalizes_paths(client):
    thread_id = client.post("/learning-path", json=create_body()).json()["thread_id"]
    res = client.post(f"/learning-path/{thread_id}/approve", json={"approve": True})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "finalized"
    assert body["paths"]["minh"]["status"] == "Approved"


def test_unknown_thread_returns_404(client):
    res = client.post("/learning-path/khong-ton-tai/approve", json={"approve": True})
    assert res.status_code == 404
