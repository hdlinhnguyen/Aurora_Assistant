"""API vòng đời đầy đủ — mục 2 kế hoạch v1.1:

1. POST /learning-path/{thread_id}/evidence — nộp evidence mới → re-plan cùng thread,
   path version tăng, lộ trình phản ánh mastery mới (spec mục 14, 15 "evidence bị sửa").
2. POST /hints — expose thang gợi ý 3 bậc.
3. SqliteSaver — phiên duyệt sống qua "restart" (app mới, cùng file DB).
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from langgraph.checkpoint.sqlite import SqliteSaver

from learning_path.adapters import CurriculumGraph
from learning_path.api import create_app
from learning_path.schemas import PrerequisiteEdge, Topic

NOW = datetime(2026, 7, 17, 12, 0, tzinfo=timezone.utc)
LATER = NOW + timedelta(days=1)


def curriculum() -> CurriculumGraph:
    return CurriculumGraph(
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


@pytest.fixture()
def client():
    return TestClient(create_app(curriculum()))


def paper(sid: str, tid: str, i: int, correct: bool, tag: str = "kt1", at: datetime = NOW) -> dict:
    return {
        "evidence_id": f"{tag}:{sid}:{tid}:{i}",
        "student_id": sid,
        "assessment_attempt_id": tag,
        "question_id": f"cau-{i}",
        "rubric_item_id": f"r-{i}",
        "topic_id": tid,
        "points_earned": 4.0 if correct else 0.0,
        "points_possible": 4.0,
        "teacher_confirmed": True,
        "occurred_at": (at - timedelta(minutes=10 - i)).isoformat(),
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


# ---- POST /learning-path/{thread_id}/evidence ----


def test_new_evidence_replans_same_thread_with_bumped_version(client):
    created = client.post("/learning-path", json=create_body()).json()
    assert [s["topic_id"] for s in created["paths"]["minh"]["ordered_steps"]] == ["b", "t"]

    # Minh luyện xong b: 8 câu đúng → b mastered → root cause dời sang t
    new_evidence = [paper("minh", "b", i, True, tag="luyen-tap", at=LATER) for i in range(8)]
    res = client.post(
        f"/learning-path/{created['thread_id']}/evidence",
        json={"raw_paper": new_evidence, "raw_quiz": [], "as_of": LATER.isoformat()},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "awaiting_approval"  # bản mới cần duyệt lại
    path = body["paths"]["minh"]
    assert path["version"] == 2
    assert path["status"] == "Draft"
    assert [s["topic_id"] for s in path["ordered_steps"]] == ["t"]


def test_evidence_on_unknown_thread_404(client):
    res = client.post(
        "/learning-path/khong-ton-tai/evidence",
        json={"raw_paper": [], "raw_quiz": [], "as_of": NOW.isoformat()},
    )
    assert res.status_code == 404


# ---- POST /hints ----


def test_hint_level_1_via_api(client):
    res = client.post("/hints", json={"topic_id": "b", "press_count": 1})
    assert res.status_code == 200
    body = res.json()
    assert body["level"] == 1
    assert "?" in body["text"]
    assert not body["exhausted"]


def test_hint_beyond_cap_escalates_via_api(client):
    res = client.post("/hints", json={"topic_id": "b", "press_count": 4})
    body = res.json()
    assert body["exhausted"]
    assert body["escalation"]["recommended_topic_ids"] == ["a"]


def test_hint_unknown_topic_404(client):
    res = client.post("/hints", json={"topic_id": "khong-ton-tai", "press_count": 1})
    assert res.status_code == 404


# ---- SqliteSaver: sống qua restart ----


def test_approval_survives_app_restart_with_sqlite(tmp_path):
    db = str(tmp_path / "lp.sqlite")

    def make_client() -> TestClient:
        import sqlite3

        conn = sqlite3.connect(db, check_same_thread=False)
        return TestClient(create_app(curriculum(), checkpointer=SqliteSaver(conn)))

    thread_id = make_client().post("/learning-path", json=create_body()).json()["thread_id"]

    # "restart": app + saver hoàn toàn mới, chỉ chung file DB
    res = make_client().post(f"/learning-path/{thread_id}/approve", json={"approve": True})
    assert res.status_code == 200
    assert res.json()["paths"]["minh"]["status"] == "Approved"
