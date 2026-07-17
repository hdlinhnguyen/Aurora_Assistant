"""E2E StateGraph — luồng mục 14 của spec: evidence → BKT → chẩn đoán → lộ trình
→ insight lớp → interrupt chờ giáo viên duyệt → resume → Approved.

Kịch bản Minh trên graph thật (38 node): sai số hữu tỉ L7 + sai phép tính phân số L6
+ sai quy đồng L5, vững nền L4 → root cause l5-quy-dong-phan-so, lộ trình topo từ đó.
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from langgraph.types import Command

from learning_path.adapters import CurriculumGraph, load_chac_goc_graph
from learning_path.graph import build_pipeline
from learning_path.schemas import (
    LearningPathRequest,
    PrerequisiteEdge,
    RawPaperEvidence,
    Topic,
)

GRAPH_JSON = Path(__file__).resolve().parents[2] / "knowledge-graph" / "data" / "graph.json"
NOW = datetime(2026, 7, 17, 12, 0, tzinfo=timezone.utc)


def paper_batch(sid: str, topic_id: str, *, correct: bool, n: int = 8) -> list[RawPaperEvidence]:
    return [
        RawPaperEvidence(
            evidence_id=f"{sid}:{topic_id}:{i}",
            student_id=sid,
            assessment_attempt_id=f"kt-{sid}",
            question_id=f"cau-{topic_id}-{i}",
            rubric_item_id=f"r-{topic_id}-{i}",
            topic_id=topic_id,
            points_earned=4.0 if correct else 0.0,
            points_possible=4.0,
            teacher_confirmed=True,
            occurred_at=NOW - timedelta(minutes=n - i),
        )
        for i in range(n)
    ]


def run_until_interrupt(pipeline, payload, thread_id):
    config = {"configurable": {"thread_id": thread_id}}
    result = pipeline.invoke(payload, config)
    return result, config


# ---- kịch bản Minh trên graph thật ----


@pytest.fixture(scope="module")
def minh_run():
    curriculum = load_chac_goc_graph(GRAPH_JSON)
    pipeline = build_pipeline(curriculum)
    evidence = (
        paper_batch("minh", "l7-phep-tinh-so-huu-ti", correct=False)
        + paper_batch("minh", "l6-phep-tinh-phan-so", correct=False)
        + paper_batch("minh", "l5-quy-dong-phan-so", correct=False)
        + paper_batch("minh", "l4-tinh-chat-phan-so", correct=True)
        + paper_batch("minh", "l4-khai-niem-phan-so", correct=True)
    )
    request = LearningPathRequest(
        class_id="7A",
        student_ids=["minh"],
        target_topic_ids=["l7-phep-tinh-so-huu-ti"],
        teacher_id="co-lan",
    )
    payload = {"request": request, "raw_paper": evidence, "raw_quiz": [], "as_of": NOW}
    result, config = run_until_interrupt(build := pipeline, payload, "minh-thread")
    return pipeline, result, config


def test_pipeline_pauses_at_teacher_approval(minh_run):
    _, result, _ = minh_run
    assert "__interrupt__" in result


def test_root_cause_diagnosed_as_l5_quy_dong(minh_run):
    _, result, _ = minh_run
    path = result["paths"]["minh"]
    assert "l5-quy-dong-phan-so" in path.diagnosis_summary


def test_draft_path_topo_order_starts_at_root_cause(minh_run):
    _, result, _ = minh_run
    path = result["paths"]["minh"]
    ids = [s.topic_id for s in path.ordered_steps]
    assert ids[0] == "l5-quy-dong-phan-so"
    assert ids.index("l6-phep-tinh-phan-so") < ids.index("l7-phep-tinh-so-huu-ti")
    assert path.status == "Draft"


def test_resume_with_approval_marks_paths_approved(minh_run):
    pipeline, _, config = minh_run
    final = pipeline.invoke(Command(resume={"approve": True}), config)
    assert final["paths"]["minh"].status == "Approved"
    assert "__interrupt__" not in final


# ---- e2e lớp học trên graph tổng hợp ----


def topic(tid: str) -> Topic:
    return Topic(
        topic_id=tid, subject_id="toan", grade_level=7, name=tid, estimated_learning_time=30
    )


@pytest.fixture(scope="module")
def class_run():
    curriculum = CurriculumGraph(
        topics={t: topic(t) for t in ["a", "b", "t"]},
        edges=[
            PrerequisiteEdge(prerequisite_topic_id="a", dependent_topic_id="b"),
            PrerequisiteEdge(prerequisite_topic_id="b", dependent_topic_id="t"),
        ],
    )
    pipeline = build_pipeline(curriculum)

    evidence: list[RawPaperEvidence] = []
    gap_ids = [f"g{i}" for i in range(7)]
    strong_ids = [f"s{i}" for i in range(6)]
    for sid in gap_ids:
        evidence += paper_batch(sid, "a", correct=True)
        evidence += paper_batch(sid, "b", correct=False)
        evidence += paper_batch(sid, "t", correct=False)
    for sid in strong_ids:
        for t in ["a", "b", "t"]:
            evidence += paper_batch(sid, t, correct=True)
    evidence += paper_batch("u1", "b", correct=False, n=1)  # quá ít evidence → uncertain

    request = LearningPathRequest(
        class_id="7A",
        student_ids=gap_ids + strong_ids + ["u1", "e1"],
        target_topic_ids=["t"],
        teacher_id="co-lan",
    )
    payload = {"request": request, "raw_paper": evidence, "raw_quiz": [], "as_of": NOW}
    result, config = run_until_interrupt(pipeline, payload, "class-thread")
    return pipeline, result, config


def test_class_wide_gap_suggests_reteach(class_run):
    _, result, _ = class_run
    insight = result["class_insight"]
    assert "b" in insight.suggested_reteach_topics
    gap_b = next(g for g in insight.class_wide_gaps if g.topic_id == "b")
    assert gap_b.denominator == 13  # u1 + e1 không vào mẫu số
    assert gap_b.confirmed_gap_rate == pytest.approx(7 / 13)


def test_gapped_students_get_paths_uncertain_students_do_not(class_run):
    _, result, _ = class_run
    assert set(result["paths"]) == {f"g{i}" for i in range(7)}
    insight = result["class_insight"]
    assert "u1" in insight.insufficient_evidence_students
    assert "e1" in insight.insufficient_evidence_students


def test_class_approval_approves_all_paths(class_run):
    pipeline, _, config = class_run
    final = pipeline.invoke(Command(resume={"approve": True}), config)
    assert all(p.status == "Approved" for p in final["paths"].values())
