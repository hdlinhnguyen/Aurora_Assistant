"""Personalized Path Planner — spec mục 4.6, 10, 11, 15 + checklist mục 16."""

from datetime import datetime, timezone
from pathlib import Path

from learning_path.adapters import CurriculumGraph, load_chac_goc_graph
from learning_path.diagnosis import diagnose
from learning_path.planner import plan_path
from learning_path.ranking import rank_root_causes
from learning_path.schemas import (
    LearningPathRequest,
    PrerequisiteEdge,
    StudentTopicKnowledgeState,
    Topic,
)

GRAPH_JSON = Path(__file__).resolve().parents[2] / "knowledge-graph" / "data" / "graph.json"
NOW = datetime(2026, 7, 17, 12, 0, tzinfo=timezone.utc)


def topic(tid: str, minutes: int = 30, available: bool = True) -> Topic:
    return Topic(
        topic_id=tid,
        subject_id="toan",
        grade_level=7,
        name=tid,
        estimated_learning_time=minutes,
        content_available=available,
    )


def graph(topics: list[Topic], edges: list[tuple[str, str]]) -> CurriculumGraph:
    return CurriculumGraph(
        topics={t.topic_id: t for t in topics},
        edges=[PrerequisiteEdge(prerequisite_topic_id=a, dependent_topic_id=b) for a, b in edges],
    )


def st(tid: str, mastery: float, status: str) -> StudentTopicKnowledgeState:
    return StudentTopicKnowledgeState(
        student_id="minh",
        topic_id=tid,
        mastery_probability=mastery,
        confidence_score=0.8,
        consistency=1.0,
        evidence_count=4,
        effective_evidence=3.0,
        mastery_status=status,  # type: ignore[arg-type]
    )


def request(**overrides) -> LearningPathRequest:
    base = dict(
        class_id="7A",
        student_ids=["minh"],
        target_topic_ids=["t"],
        teacher_id="co-lan",
    )
    return LearningPathRequest(**(base | overrides))


CHAIN = graph(
    [topic("a"), topic("b"), topic("c"), topic("t")],
    [("a", "b"), ("b", "c"), ("c", "t")],
)
CHAIN_STATES = {
    "a": st("a", 0.9, "mastered"),
    "b": st("b", 0.2, "confirmed_gap"),
    "c": st("c", 0.3, "confirmed_gap"),
    "t": st("t", 0.2, "confirmed_gap"),
}


def plan(curriculum, states, req, student_id="minh"):
    d = diagnose(curriculum, states, req.target_topic_ids)
    r = rank_root_causes(d, curriculum)
    return plan_path(
        req, d, r, curriculum, states, student_id=student_id, generated_at=NOW
    )


# ---- lộ trình cơ bản (mục 10, 11) ----


def test_steps_are_unmastered_topics_in_topo_order():
    p = plan(CHAIN, CHAIN_STATES, request())
    assert [s.topic_id for s in p.ordered_steps] == ["b", "c", "t"]
    assert [s.order for s in p.ordered_steps] == [1, 2, 3]


def test_mastered_topic_not_a_step_but_total_minutes_counted():
    p = plan(CHAIN, CHAIN_STATES, request())
    assert "a" not in [s.topic_id for s in p.ordered_steps]
    assert p.total_estimated_minutes == 90


def test_completion_condition_uses_request_thresholds():
    p = plan(CHAIN, CHAIN_STATES, request(target_mastery_threshold=0.85))
    step = p.ordered_steps[0]
    assert "0.85" in step.completion_condition
    assert step.target_mastery == 0.85


def test_path_starts_as_draft_version_1():
    p = plan(CHAIN, CHAIN_STATES, request())
    assert p.status == "Draft"
    assert p.version == 1
    assert p.student_id == "minh"


# ---- ràng buộc giáo viên (mục 8.2, 12) ----


def test_excluded_topic_removed_from_steps():
    p = plan(CHAIN, CHAIN_STATES, request(excluded_topic_ids=["c"]))
    assert "c" not in [s.topic_id for s in p.ordered_steps]


def test_required_topic_added_even_off_gap_path():
    g = graph(
        [topic("a"), topic("b"), topic("c"), topic("t"), topic("x")],
        [("a", "b"), ("b", "c"), ("c", "t")],
    )
    states = CHAIN_STATES | {"x": st("x", 0.4, "learning")}
    p = plan(g, states, request(required_topic_ids=["x"]))
    assert "x" in [s.topic_id for s in p.ordered_steps]


# ---- giới hạn thời gian → knapsack + deferred (mục 10, 15) ----


def test_time_budget_defers_steps_but_preserves_prerequisite_closure():
    p = plan(CHAIN, CHAIN_STATES, request(estimated_minutes_per_student=60))
    selected = [s.topic_id for s in p.ordered_steps]
    deferred = [s.topic_id for s in p.deferred_steps]
    assert len(selected) == 2 and len(deferred) == 1
    # không bao giờ chọn node mà tiên quyết chưa vững của nó bị hoãn
    assert "b" in selected  # root cause luôn được giữ
    if "c" in selected:
        assert "b" in selected
    if "t" in selected:
        assert {"b", "c"} <= set(selected)


def test_insufficient_budget_reports_minimum_and_blocked_targets():
    p = plan(CHAIN, CHAIN_STATES, request(estimated_minutes_per_student=60))
    assert p.minimum_required_minutes == 90
    assert p.blocked_target_topics == ["t"]


def test_no_budget_keeps_all_steps():
    p = plan(CHAIN, CHAIN_STATES, request())
    assert p.deferred_steps == []
    assert p.blocked_target_topics == []


# ---- content_unavailable (mục 15) ----


def test_dim_topic_kept_with_content_unavailable_status():
    g = graph(
        [topic("a"), topic("b", available=False), topic("t")],
        [("a", "b"), ("b", "t")],
    )
    states = {
        "a": st("a", 0.9, "mastered"),
        "b": st("b", 0.2, "confirmed_gap"),
        "t": st("t", 0.2, "confirmed_gap"),
    }
    p = plan(g, states, request())
    step_b = next(s for s in p.ordered_steps if s.topic_id == "b")
    assert step_b.status == "content_unavailable"


# ---- kịch bản Minh trên graph thật ----


def test_minh_path_starts_at_l5_root_cause_in_topo_order():
    curriculum = load_chac_goc_graph(GRAPH_JSON)
    states = {
        "l7-phep-tinh-so-huu-ti": st("l7-phep-tinh-so-huu-ti", 0.2, "confirmed_gap"),
        "l6-phep-tinh-phan-so": st("l6-phep-tinh-phan-so", 0.25, "confirmed_gap"),
        "l5-quy-dong-phan-so": st("l5-quy-dong-phan-so", 0.1, "confirmed_gap"),
        "l4-tinh-chat-phan-so": st("l4-tinh-chat-phan-so", 0.9, "mastered"),
        "l4-khai-niem-phan-so": st("l4-khai-niem-phan-so", 0.9, "mastered"),
    }
    p = plan(curriculum, states, request(target_topic_ids=["l7-phep-tinh-so-huu-ti"]))
    ids = [s.topic_id for s in p.ordered_steps]
    assert ids[0] == "l5-quy-dong-phan-so"
    assert ids.index("l6-phep-tinh-phan-so") < ids.index("l7-phep-tinh-so-huu-ti")
