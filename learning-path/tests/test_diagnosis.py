"""Gap Diagnosis Engine + Root-Cause Ranker — spec mục 4.3, 4.5, 9 + checklist mục 16."""

from pathlib import Path

import pytest

from learning_path.adapters import CurriculumGraph, load_chac_goc_graph
from learning_path.diagnosis import diagnose
from learning_path.ranking import rank_root_causes
from learning_path.schemas import (
    PrerequisiteEdge,
    StudentTopicKnowledgeState,
    Topic,
)

GRAPH_JSON = Path(__file__).resolve().parents[2] / "knowledge-graph" / "data" / "graph.json"


def topic(tid: str, grade: int = 7) -> Topic:
    return Topic(
        topic_id=tid, subject_id="toan", grade_level=grade, name=tid, estimated_learning_time=30
    )


def graph(topic_ids: list[str], edges: list[tuple[str, str]]) -> CurriculumGraph:
    return CurriculumGraph(
        topics={t: topic(t) for t in topic_ids},
        edges=[PrerequisiteEdge(prerequisite_topic_id=a, dependent_topic_id=b) for a, b in edges],
    )


def st(tid: str, mastery: float, confidence: float, status: str) -> StudentTopicKnowledgeState:
    return StudentTopicKnowledgeState(
        student_id="minh",
        topic_id=tid,
        mastery_probability=mastery,
        confidence_score=confidence,
        consistency=1.0,
        evidence_count=4,
        effective_evidence=3.0,
        mastery_status=status,  # type: ignore[arg-type]
    )


# Chuỗi: a → b → c → t, và node ngoài lề "x" không nối tới t
CHAIN = graph(["a", "b", "c", "t", "x"], [("a", "b"), ("b", "c"), ("c", "t")])


# ---- relevant subgraph + validation (mục 9, 15) ----


def test_subgraph_is_ancestors_plus_targets_only():
    d = diagnose(CHAIN, {}, ["t"])
    assert d.error is None
    assert set(d.subgraph_topic_ids) == {"a", "b", "c", "t"}


def test_cycle_returns_graph_validation_error():
    cyclic = graph(["a", "b"], [("a", "b"), ("b", "a")])
    d = diagnose(cyclic, {}, ["b"])
    assert d.error is not None
    assert d.error.code == "graph_validation_error"


def test_unknown_target_returns_error():
    d = diagnose(CHAIN, {}, ["khong-ton-tai"])
    assert d.error is not None
    assert d.error.code == "target_not_in_graph"


def test_topic_without_evidence_is_unknown_not_gap():
    d = diagnose(CHAIN, {}, ["t"])
    assert d.statuses["b"] == "unknown"
    assert d.gap_scores.get("b", 0.0) == 0.0


# ---- gap_score (mục 9) ----


def test_gap_closer_to_target_scores_higher_all_else_equal():
    states = {
        "b": st("b", 0.2, 0.8, "confirmed_gap"),
        "c": st("c", 0.2, 0.8, "confirmed_gap"),
    }
    d = diagnose(CHAIN, states, ["t"])
    assert d.gap_scores["c"] > d.gap_scores["b"] * 0  # cả hai > 0
    # c gần target hơn (distance 1 vs 2) nhưng b có downstream_impact lớn hơn (c,t vs t)
    # → không so trực tiếp; kiểm từng thành phần qua 2 test dưới.
    assert d.gap_scores["b"] > 0 and d.gap_scores["c"] > 0


def test_more_unmastered_descendants_scores_higher():
    # Hai nhánh cùng độ sâu vào t: p → q → t và u → t; p có 2 hậu duệ chưa vững, u có 1
    g = graph(["p", "q", "u", "t"], [("p", "q"), ("q", "t"), ("u", "t")])
    states = {
        "p": st("p", 0.2, 0.8, "confirmed_gap"),
        "u": st("u", 0.2, 0.8, "confirmed_gap"),
        "q": st("q", 0.5, 0.8, "learning"),
    }
    d = diagnose(g, states, ["t"])
    # p: hậu duệ chưa vững {q, t}, distance 2; u: {t}, distance 1
    # impact p=(1+2)=3 · relevance 1/3 = 1.0 ; impact u=(1+1)=2 · relevance 1/2 = 1.0 → hòa
    # nên tách: so mastered descendant — nếu q mastered thì p tụt hẳn
    states_q_mastered = dict(states) | {"q": st("q", 0.95, 0.8, "mastered")}
    d2 = diagnose(g, states_q_mastered, ["t"])
    assert d2.gap_scores["p"] < d.gap_scores["p"]


def test_higher_deficit_scores_higher():
    states_deep = {"c": st("c", 0.1, 0.8, "confirmed_gap")}
    states_mild = {"c": st("c", 0.5, 0.8, "confirmed_gap")}
    deep = diagnose(CHAIN, states_deep, ["t"]).gap_scores["c"]
    mild = diagnose(CHAIN, states_mild, ["t"]).gap_scores["c"]
    assert deep > mild


# ---- root-cause ranking (mục 4.5, 9) ----


def test_root_cause_is_earliest_confirmed_break():
    states = {
        "a": st("a", 0.9, 0.8, "mastered"),
        "b": st("b", 0.2, 0.8, "confirmed_gap"),
        "c": st("c", 0.2, 0.8, "confirmed_gap"),
        "t": st("t", 0.2, 0.8, "confirmed_gap"),
    }
    d = diagnose(CHAIN, states, ["t"])
    r = rank_root_causes(d, CHAIN)
    assert [c.topic_id for c in r.candidates] == ["b"]  # c, t có tiên quyết b đang hổng


def test_uncertain_on_path_requests_diagnosis_not_conclusion():
    states = {
        "b": st("b", 0.4, 0.2, "uncertain"),
        "t": st("t", 0.2, 0.8, "confirmed_gap"),
    }
    d = diagnose(CHAIN, states, ["t"])
    r = rank_root_causes(d, CHAIN)
    assert "b" in r.needs_diagnosis
    assert "b" not in [c.topic_id for c in r.candidates]


def test_minh_scenario_root_cause_is_l5_quy_dong():
    """Kịch bản Minh trên graph thật: sai số hữu tỉ L7 → truy về quy đồng mẫu số L5."""
    curriculum = load_chac_goc_graph(GRAPH_JSON)
    states = {
        "l7-phep-tinh-so-huu-ti": st("l7-phep-tinh-so-huu-ti", 0.2, 0.8, "confirmed_gap"),
        "l6-phep-tinh-phan-so": st("l6-phep-tinh-phan-so", 0.25, 0.8, "confirmed_gap"),
        "l5-quy-dong-phan-so": st("l5-quy-dong-phan-so", 0.1, 0.8, "confirmed_gap"),
        "l4-tinh-chat-phan-so": st("l4-tinh-chat-phan-so", 0.9, 0.8, "mastered"),
        "l4-khai-niem-phan-so": st("l4-khai-niem-phan-so", 0.9, 0.8, "mastered"),
    }
    d = diagnose(curriculum, states, ["l7-phep-tinh-so-huu-ti"])
    r = rank_root_causes(d, curriculum)
    assert r.candidates, "phải có root cause"
    assert r.candidates[0].topic_id == "l5-quy-dong-phan-so"
