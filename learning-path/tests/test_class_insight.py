"""Teacher Control & Class Insight — spec mục 13 + checklist mục 16.

Gom nhóm theo root-cause (không theo tổng điểm), gap toàn lớp với mẫu số chỉ gồm
học sinh đủ confidence, ngưỡng 40%/15%, help_priority có giải thích.
"""

from learning_path.adapters import CurriculumGraph
from learning_path.class_insight import compute_class_insight
from learning_path.diagnosis import diagnose
from learning_path.ranking import rank_root_causes
from learning_path.schemas import (
    LearningPathRequest,
    PrerequisiteEdge,
    StudentTopicKnowledgeState,
    Topic,
)


def topic(tid: str) -> Topic:
    return Topic(
        topic_id=tid, subject_id="toan", grade_level=7, name=tid, estimated_learning_time=30
    )


GRAPH = CurriculumGraph(
    topics={t: topic(t) for t in ["a", "b", "t"]},
    edges=[
        PrerequisiteEdge(prerequisite_topic_id="a", dependent_topic_id="b"),
        PrerequisiteEdge(prerequisite_topic_id="b", dependent_topic_id="t"),
    ],
)


def st(sid: str, tid: str, mastery: float, confidence: float, status: str):
    return StudentTopicKnowledgeState(
        student_id=sid,
        topic_id=tid,
        mastery_probability=mastery,
        confidence_score=confidence,
        consistency=1.0,
        evidence_count=4 if confidence >= 0.4 else 1,
        effective_evidence=3.0 if confidence >= 0.4 else 0.5,
        mastery_status=status,  # type: ignore[arg-type]
    )


def gap_student(sid: str) -> dict[str, StudentTopicKnowledgeState]:
    return {
        "a": st(sid, "a", 0.9, 0.8, "mastered"),
        "b": st(sid, "b", 0.2, 0.8, "confirmed_gap"),
        "t": st(sid, "t", 0.2, 0.8, "confirmed_gap"),
    }


def strong_student(sid: str) -> dict[str, StudentTopicKnowledgeState]:
    return {t: st(sid, t, 0.9, 0.8, "mastered") for t in ["a", "b", "t"]}


def uncertain_student(sid: str) -> dict[str, StudentTopicKnowledgeState]:
    return {t: st(sid, t, 0.4, 0.2, "uncertain") for t in ["a", "b", "t"]}


def build_insight(states_by_student):
    request = LearningPathRequest(
        class_id="7A",
        student_ids=list(states_by_student),
        target_topic_ids=["t"],
        teacher_id="co-lan",
    )
    diagnoses = {
        sid: diagnose(GRAPH, states, ["t"]) for sid, states in states_by_student.items()
    }
    rankings = {sid: rank_root_causes(d, GRAPH) for sid, d in diagnoses.items()}
    return compute_class_insight(request, diagnoses, rankings, states_by_student, GRAPH)


GAPPED = {f"g{i}": gap_student(f"g{i}") for i in range(5)}
STRONG = {f"s{i}": strong_student(f"s{i}") for i in range(3)}
CLASS_10 = GAPPED | STRONG | {"u1": uncertain_student("u1"), "e1": {}}


# ---- gap toàn lớp (mục 13.1) ----


def test_gap_rate_excludes_students_without_sufficient_confidence():
    insight = build_insight(CLASS_10)
    gap_b = next(g for g in insight.class_wide_gaps if g.topic_id == "b")
    # mẫu số = 8 (5 hổng + 3 vững); u1 (confidence thấp) và e1 (không evidence) bị loại
    assert gap_b.denominator == 8
    assert gap_b.confirmed_gap_rate == 5 / 8


def test_over_40_percent_suggests_reteach_class():
    insight = build_insight(CLASS_10)
    assert "b" in insight.suggested_reteach_topics
    gap_b = next(g for g in insight.class_wide_gaps if g.topic_id == "b")
    assert gap_b.recommended_intervention == "reteach_class"


def test_15_to_40_percent_suggests_small_group():
    two_gap = {f"g{i}": gap_student(f"g{i}") for i in range(2)}
    six_strong = {f"s{i}": strong_student(f"s{i}") for i in range(6)}
    insight = build_insight(two_gap | six_strong)
    gap_b = next(g for g in insight.class_wide_gaps if g.topic_id == "b")
    assert gap_b.confirmed_gap_rate == 0.25
    assert gap_b.recommended_intervention == "small_group"


def test_under_15_percent_suggests_individual():
    one_gap = {"g0": gap_student("g0")}
    seven_strong = {f"s{i}": strong_student(f"s{i}") for i in range(7)}
    insight = build_insight(one_gap | seven_strong)
    gap_b = next(g for g in insight.class_wide_gaps if g.topic_id == "b")
    assert gap_b.confirmed_gap_rate == 0.125
    assert gap_b.recommended_intervention == "individual"


# ---- gom nhóm can thiệp (mục 13) ----


def test_students_grouped_by_root_cause_not_total_score():
    insight = build_insight(CLASS_10)
    groups = [g for g in insight.intervention_groups if g.root_cause_topic_id == "b"]
    assert len(groups) == 1
    assert sorted(groups[0].student_ids) == ["g0", "g1", "g2", "g3", "g4"]


def test_one_primary_group_per_student():
    insight = build_insight(CLASS_10)
    seen: list[str] = []
    for g in insight.intervention_groups:
        seen.extend(g.student_ids)
    assert len(seen) == len(set(seen))


# ---- ưu tiên hỗ trợ (mục 13.2) ----


def test_gap_students_prioritized_with_positive_score():
    insight = build_insight(CLASS_10)
    ids = [p.student_id for p in insight.prioritized_students]
    assert set(ids) >= {"g0", "g1", "g2", "g3", "g4"}
    scores = [p.help_priority for p in insight.prioritized_students]
    assert scores == sorted(scores, reverse=True)


def test_low_confidence_students_routed_to_diagnosis_not_help_list():
    insight = build_insight(CLASS_10)
    assert "u1" in insight.insufficient_evidence_students
    assert "e1" in insight.insufficient_evidence_students
    assert "u1" not in [p.student_id for p in insight.prioritized_students]


# ---- phân bố mastery lớp (mục 13.3) ----


def test_class_mastery_distribution_bands():
    insight = build_insight(CLASS_10)
    assert insight.class_mastery_distribution == {
        "manh": 3,
        "can-ho-tro": 5,
        "thieu-du-lieu": 2,
    }
