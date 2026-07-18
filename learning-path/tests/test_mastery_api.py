from fastapi.testclient import TestClient

from learning_path.adapters import CurriculumGraph
from learning_path.api import create_app
from learning_path.schemas import Topic


def _client() -> TestClient:
    curriculum = CurriculumGraph(
        topics={
            topic_id: Topic(
                topic_id=topic_id,
                subject_id="toan",
                grade_level=7,
                name=topic_id,
                estimated_learning_time=30,
            )
            for topic_id in ["topic-a", "topic-b"]
        },
        edges=[],
    )
    return TestClient(create_app(curriculum))


def _quiz(evidence_id: str, topic_id: str, score: float) -> dict:
    return {
        "evidence_id": evidence_id,
        "student_id": "student-1",
        "session_id": "session-1",
        "question_id": evidence_id,
        "topic_id": topic_id,
        "score": score,
        "attempt_number": 1,
        "hints_used": 0,
        "grading_method": "auto",
        "occurred_at": "2026-07-18T00:00:00Z",
    }


def _body(raw_quiz: list[dict]) -> dict:
    return {
        "student_id": "student-1",
        "topic_ids": ["topic-a", "topic-b"],
        "raw_quiz": raw_quiz,
        "raw_paper": [],
        "as_of": "2026-07-18T01:00:00Z",
    }


def test_calculate_mastery_returns_requested_topic_states() -> None:
    response = _client().post(
        "/mastery/calculate",
        json=_body([_quiz("e-1", "topic-a", 1.0)]),
    )

    assert response.status_code == 200
    payload = response.json()
    assert set(payload["states"]) == {"topic-a", "topic-b"}
    assert payload["states"]["topic-a"]["student_id"] == "student-1"
    assert payload["states"]["topic-a"]["evidence_count"] == 1
    assert payload["states"]["topic-b"]["mastery_status"] == "unknown"


def test_calculate_mastery_deduplicates_evidence_ids() -> None:
    duplicate = _quiz("same-id", "topic-a", 1.0)

    response = _client().post(
        "/mastery/calculate",
        json=_body([duplicate, duplicate]),
    )

    assert response.status_code == 200
    assert response.json()["states"]["topic-a"]["evidence_count"] == 1


def test_calculate_mastery_rejects_evidence_for_another_student() -> None:
    evidence = _quiz("e-other", "topic-a", 1.0)
    evidence["student_id"] = "student-2"

    response = _client().post("/mastery/calculate", json=_body([evidence]))

    assert response.status_code == 422
