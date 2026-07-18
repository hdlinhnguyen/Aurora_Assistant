from concurrent.futures import ThreadPoolExecutor
import gc
from pathlib import Path
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from question_tagging_backend.app.database import Database
from question_tagging_backend.app.schemas import UpdateTopicsRequest
from question_tagging_backend.app.service import VersionConflict


def get_context(client: TestClient, question_id: str) -> dict:
    response = client.get(f"/api/questions/{question_id}/tagging-context")
    assert response.status_code == 200
    return response.json()


@pytest.mark.filterwarnings("error::ResourceWarning")
@pytest.mark.filterwarnings("error::pytest.PytestUnraisableExceptionWarning")
def test_database_initialize_closes_connection(tmp_path: Path) -> None:
    database = Database(tmp_path / "lifecycle.db")
    database.initialize()
    gc.collect()


def test_health_and_question_list(client: TestClient) -> None:
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}

    questions = client.get("/api/questions")
    assert questions.status_code == 200
    assert {item["id"] for item in questions.json()} == {"q-essay-1", "q-mcq-1"}


def test_context_contains_question_topics_rubrics_and_version(client: TestClient) -> None:
    context = get_context(client, "q-essay-1")

    assert context["question"]["question_type"] == "essay"
    assert context["version"] == 1
    assert [item["id"] for item in context["rubric_items"]] == ["r-essay-1", "r-essay-2"]
    assert {item["id"] for item in context["available_topics"]} == {
        "topic-equations",
        "topic-fractions",
        "topic-polynomials",
    }
    assert context["direct_topic_ids"] == []
    assert context["effective_topics"] == []


def test_question_can_receive_multiple_topics_and_empty_set(client: TestClient) -> None:
    response = client.put(
        "/api/questions/q-mcq-1/topics",
        json={
            "topic_ids": ["topic-equations", "topic-fractions", "topic-equations"],
            "expected_version": 1,
            "updated_by": "teacher-a",
        },
    )

    assert response.status_code == 200
    context = response.json()
    assert context["direct_topic_ids"] == ["topic-equations", "topic-fractions"]
    assert [item["id"] for item in context["effective_topics"]] == [
        "topic-equations",
        "topic-fractions",
    ]
    assert context["version"] == 2

    cleared = client.put(
        "/api/questions/q-mcq-1/topics",
        json={
            "topic_ids": [],
            "expected_version": 2,
            "updated_by": "teacher-a",
        },
    )
    assert cleared.status_code == 200
    assert cleared.json()["direct_topic_ids"] == []
    assert cleared.json()["effective_topics"] == []
    assert cleared.json()["version"] == 3


def test_topic_from_other_grade_in_same_subject_is_allowed(client: TestClient) -> None:
    response = client.put(
        "/api/questions/q-mcq-1/topics",
        json={
            "topic_ids": ["topic-polynomials"],
            "expected_version": 1,
            "updated_by": "teacher-a",
        },
    )

    assert response.status_code == 200
    assert response.json()["direct_topic_ids"] == ["topic-polynomials"]


def test_topic_from_other_subject_is_rejected_without_changing_version(
    client: TestClient,
) -> None:
    response = client.put(
        "/api/questions/q-mcq-1/topics",
        json={
            "topic_ids": ["topic-motion"],
            "expected_version": 1,
            "updated_by": "teacher-a",
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "topic_subject_mismatch"
    assert get_context(client, "q-mcq-1")["version"] == 1


def test_unknown_topic_is_rejected(client: TestClient) -> None:
    response = client.put(
        "/api/questions/q-mcq-1/topics",
        json={
            "topic_ids": ["topic-missing"],
            "expected_version": 1,
            "updated_by": "teacher-a",
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "topic_not_found"


def test_blank_teacher_identity_is_rejected(client: TestClient) -> None:
    response = client.put(
        "/api/questions/q-mcq-1/topics",
        json={
            "topic_ids": ["topic-equations"],
            "expected_version": 1,
            "updated_by": "   ",
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request_validation_error"
    assert get_context(client, "q-mcq-1")["version"] == 1


def test_topic_list_has_a_controlled_size_limit() -> None:
    with pytest.raises(ValidationError):
        UpdateTopicsRequest(
            topic_ids=[f"topic-{index}" for index in range(201)],
            expected_version=1,
            updated_by="teacher-a",
        )


def test_blank_topic_id_is_rejected_instead_of_clearing_tags(
    client: TestClient,
) -> None:
    initial = client.put(
        "/api/questions/q-mcq-1/topics",
        json={
            "topic_ids": ["topic-equations"],
            "expected_version": 1,
            "updated_by": "teacher-a",
        },
    )
    assert initial.status_code == 200

    response = client.put(
        "/api/questions/q-mcq-1/topics",
        json={
            "topic_ids": ["   "],
            "expected_version": 2,
            "updated_by": "teacher-a",
        },
    )

    assert response.status_code == 422
    context = get_context(client, "q-mcq-1")
    assert context["direct_topic_ids"] == ["topic-equations"]
    assert context["version"] == 2


def test_essay_effective_topics_are_deduplicated_union_of_both_sources(
    client: TestClient,
) -> None:
    direct = client.put(
        "/api/questions/q-essay-1/topics",
        json={
            "topic_ids": ["topic-fractions"],
            "expected_version": 1,
            "updated_by": "teacher-a",
        },
    )
    assert direct.status_code == 200

    first_rubric = client.put(
        "/api/questions/q-essay-1/rubric-items/r-essay-1/topics",
        json={
            "topic_ids": ["topic-fractions", "topic-equations"],
            "expected_version": 2,
            "updated_by": "teacher-a",
        },
    )
    assert first_rubric.status_code == 200

    second_rubric = client.put(
        "/api/questions/q-essay-1/rubric-items/r-essay-2/topics",
        json={
            "topic_ids": ["topic-polynomials", "topic-equations"],
            "expected_version": 3,
            "updated_by": "teacher-b",
        },
    )
    assert second_rubric.status_code == 200
    assert [item["id"] for item in second_rubric.json()["effective_topics"]] == [
        "topic-equations",
        "topic-fractions",
        "topic-polynomials",
    ]

    effective = client.get("/api/questions/q-essay-1/effective-topics")
    assert effective.status_code == 200
    assert effective.json()["topic_ids"] == [
        "topic-equations",
        "topic-fractions",
        "topic-polynomials",
    ]
    assert effective.json()["version"] == 4


def test_removing_rubric_tag_keeps_same_direct_question_tag(client: TestClient) -> None:
    direct = client.put(
        "/api/questions/q-essay-1/topics",
        json={
            "topic_ids": ["topic-fractions"],
            "expected_version": 1,
            "updated_by": "teacher-a",
        },
    )
    assert direct.status_code == 200
    rubric = client.put(
        "/api/questions/q-essay-1/rubric-items/r-essay-1/topics",
        json={
            "topic_ids": ["topic-fractions"],
            "expected_version": 2,
            "updated_by": "teacher-a",
        },
    )
    assert rubric.status_code == 200

    cleared = client.put(
        "/api/questions/q-essay-1/rubric-items/r-essay-1/topics",
        json={
            "topic_ids": [],
            "expected_version": 3,
            "updated_by": "teacher-a",
        },
    )

    assert cleared.status_code == 200
    assert [item["id"] for item in cleared.json()["effective_topics"]] == [
        "topic-fractions"
    ]


def test_removing_topic_from_its_last_rubric_removes_it_from_effective_set(
    client: TestClient,
) -> None:
    added = client.put(
        "/api/questions/q-essay-1/rubric-items/r-essay-1/topics",
        json={
            "topic_ids": ["topic-equations"],
            "expected_version": 1,
            "updated_by": "teacher-a",
        },
    )
    assert added.status_code == 200

    cleared = client.put(
        "/api/questions/q-essay-1/rubric-items/r-essay-1/topics",
        json={
            "topic_ids": [],
            "expected_version": 2,
            "updated_by": "teacher-a",
        },
    )

    assert cleared.status_code == 200
    assert cleared.json()["effective_topics"] == []


def test_rubric_item_must_belong_to_question(client: TestClient) -> None:
    response = client.put(
        "/api/questions/q-mcq-1/rubric-items/r-essay-1/topics",
        json={
            "topic_ids": ["topic-equations"],
            "expected_version": 1,
            "updated_by": "teacher-a",
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "rubric_item_mismatch"


def test_stale_version_returns_latest_context_without_overwriting(
    client: TestClient,
) -> None:
    first = client.put(
        "/api/questions/q-mcq-1/topics",
        json={
            "topic_ids": ["topic-equations"],
            "expected_version": 1,
            "updated_by": "teacher-a",
        },
    )
    assert first.status_code == 200

    stale = client.put(
        "/api/questions/q-mcq-1/topics",
        json={
            "topic_ids": ["topic-fractions"],
            "expected_version": 1,
            "updated_by": "teacher-b",
        },
    )

    assert stale.status_code == 409
    payload = stale.json()
    assert payload["error"]["code"] == "version_conflict"
    assert payload["latest_context"]["version"] == 2
    assert payload["latest_context"]["direct_topic_ids"] == ["topic-equations"]
    assert get_context(client, "q-mcq-1")["direct_topic_ids"] == ["topic-equations"]


def test_two_concurrent_writers_cannot_both_commit(client: TestClient) -> None:
    service = client.app.state.tagging_service
    barrier = Barrier(2)

    def write(topic_id: str) -> str:
        barrier.wait()
        try:
            service.set_question_topics(
                "q-mcq-1",
                UpdateTopicsRequest(
                    topic_ids=[topic_id],
                    expected_version=1,
                    updated_by=topic_id,
                ),
            )
            return "committed"
        except VersionConflict:
            return "conflict"

    with ThreadPoolExecutor(max_workers=2) as executor:
        outcomes = list(
            executor.map(write, ["topic-equations", "topic-fractions"])
        )

    assert sorted(outcomes) == ["committed", "conflict"]
    context = get_context(client, "q-mcq-1")
    assert context["version"] == 2
    assert len(context["direct_topic_ids"]) == 1


def test_missing_question_returns_not_found(client: TestClient) -> None:
    response = client.get("/api/questions/q-missing/tagging-context")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "question_not_found"


def test_demo_html_is_served(client: TestClient) -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert "Question Tagging Demo" in response.text
    assert 'id="question-select"' in response.text
    assert 'id="effective-topics"' in response.text
