from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from learning_path.adapters import CurriculumGraph
from learning_path.api import create_app
from learning_path.schemas import PrerequisiteEdge, Topic


NOW = datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)


def curriculum(cyclic: bool = False) -> CurriculumGraph:
    edges = [
        PrerequisiteEdge(prerequisite_topic_id="a", dependent_topic_id="b"),
        PrerequisiteEdge(prerequisite_topic_id="b", dependent_topic_id="t"),
    ]
    if cyclic:
        edges.append(PrerequisiteEdge(prerequisite_topic_id="t", dependent_topic_id="a"))
    return CurriculumGraph(
        topics={
            topic_id: Topic(
                topic_id=topic_id,
                subject_id="toan",
                grade_level=7,
                name=topic_id,
                estimated_learning_time=30,
            )
            for topic_id in ["a", "b", "t"]
        },
        edges=edges,
    )


def paper(topic_id: str, index: int, correct: bool) -> dict:
    return {
        "evidence_id": f"minh:{topic_id}:{index}",
        "student_id": "minh",
        "assessment_attempt_id": "kt1",
        "question_id": f"q{index}",
        "rubric_item_id": f"r{index}",
        "topic_id": topic_id,
        "points_earned": 1 if correct else 0,
        "points_possible": 1,
        "teacher_confirmed": True,
        "occurred_at": (NOW - timedelta(minutes=index)).isoformat(),
    }


def body(raw_paper: list[dict]) -> dict:
    return {
        "request": {
            "class_id": "7A",
            "student_ids": ["minh"],
            "teacher_id": "co-lan",
        },
        "raw_quiz": [],
        "raw_paper": raw_paper,
        "as_of": NOW.isoformat(),
    }


def test_suggestions_endpoint_returns_ranked_preview():
    evidence = (
        [paper("a", index, True) for index in range(8)]
        + [paper("b", index, False) for index in range(8)]
        + [paper("t", index, False) for index in range(8)]
    )
    response = TestClient(create_app(curriculum())).post(
        "/learning-path/suggestions", json=body(evidence)
    )

    assert response.status_code == 200
    result = response.json()
    assert result["algorithm_version"] == "learning-path-suggestions-v1"
    assert result["suggested_topics"][0]["topic_id"] == "t"
    assert result["suggested_students"][0]["student_id"] == "minh"
    assert result["preview_paths"]["minh"]["status"] == "Draft"


def test_suggestions_endpoint_keeps_empty_evidence_unclassified():
    response = TestClient(create_app(curriculum())).post(
        "/learning-path/suggestions", json=body([])
    )

    assert response.status_code == 200
    result = response.json()
    assert result["suggested_topics"] == []
    assert result["suggested_students"] == []
    assert result["insufficient_evidence_students"] == ["minh"]


def test_suggestions_endpoint_rejects_cyclic_graph():
    response = TestClient(create_app(curriculum(cyclic=True))).post(
        "/learning-path/suggestions", json=body([])
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "graph_validation_error"
