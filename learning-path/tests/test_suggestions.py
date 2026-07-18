from datetime import datetime, timezone

from learning_path.adapters import CurriculumGraph
from learning_path.schemas import (
    LearningPathSuggestionRequest,
    PrerequisiteEdge,
    StudentTopicKnowledgeState,
    Topic,
)
from learning_path.suggestions import suggest_from_states


NOW = datetime(2026, 7, 18, 12, 0, tzinfo=timezone.utc)


def topic(topic_id: str) -> Topic:
    return Topic(
        topic_id=topic_id,
        subject_id="toan",
        grade_level=7,
        name=topic_id,
        estimated_learning_time=30,
    )


def state(
    student_id: str,
    topic_id: str,
    mastery: float,
    status: str = "confirmed_gap",
    confidence: float = 0.8,
) -> StudentTopicKnowledgeState:
    return StudentTopicKnowledgeState(
        student_id=student_id,
        topic_id=topic_id,
        mastery_probability=mastery,
        confidence_score=confidence,
        consistency=1.0,
        evidence_count=5,
        effective_evidence=4.0,
        mastery_status=status,  # type: ignore[arg-type]
    )


def curriculum() -> CurriculumGraph:
    return CurriculumGraph(
        topics={topic_id: topic(topic_id) for topic_id in ["a", "b", "c", "t", "x"]},
        edges=[
            PrerequisiteEdge(prerequisite_topic_id="a", dependent_topic_id="b"),
            PrerequisiteEdge(prerequisite_topic_id="b", dependent_topic_id="c"),
            PrerequisiteEdge(prerequisite_topic_id="c", dependent_topic_id="t"),
        ],
    )


def request(student_ids: list[str], **overrides) -> LearningPathSuggestionRequest:
    values = {
        "class_id": "7A",
        "student_ids": student_ids,
        "teacher_id": "co-lan",
    }
    values.update(overrides)
    return LearningPathSuggestionRequest(**values)


def test_prefers_dependent_target_and_keeps_ancestor_as_path_root():
    students = ["s1", "s2", "s3"]
    states = {
        sid: {
            "a": state(sid, "a", 0.9, "mastered"),
            "b": state(sid, "b", 0.2),
            "c": state(sid, "c", 0.25),
            "t": state(sid, "t", 0.3),
        }
        for sid in students
    }

    result = suggest_from_states(request(students), states, curriculum(), NOW)

    assert [item.topic_id for item in result.suggested_topics] == ["t"]
    assert [step.topic_id for step in result.preview_paths["s1"].ordered_steps] == [
        "b",
        "c",
        "t",
    ]


def test_limits_students_to_five_with_deterministic_priority_order():
    students = [f"s{i}" for i in range(1, 7)]
    states = {
        sid: {
            "a": state(sid, "a", 0.9, "mastered"),
            "b": state(sid, "b", 0.1 + index * 0.05),
            "c": state(sid, "c", 0.2 + index * 0.05),
            "t": state(sid, "t", 0.25 + index * 0.05),
        }
        for index, sid in enumerate(students)
    }

    result = suggest_from_states(request(students), states, curriculum(), NOW)

    assert [item.student_id for item in result.suggested_students] == [
        "s1",
        "s2",
        "s3",
        "s4",
        "s5",
    ]
    assert set(result.preview_paths) == {"s1", "s2", "s3", "s4", "s5"}


def test_uncertain_student_is_not_labeled_weak():
    states = {
        "weak": {
            "b": state("weak", "b", 0.2),
            "t": state("weak", "t", 0.3),
        },
        "unknown": {
            "b": state("unknown", "b", 0.4, "uncertain", confidence=0.2),
            "t": state("unknown", "t", 0.4, "uncertain", confidence=0.2),
        },
    }

    result = suggest_from_states(
        request(["weak", "unknown"]), states, curriculum(), NOW
    )

    assert [item.student_id for item in result.suggested_students] == ["weak"]
    assert result.insufficient_evidence_students == ["unknown"]
    assert "unknown" not in result.preview_paths
