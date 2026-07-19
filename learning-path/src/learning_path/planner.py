"""Personalized Path Planner — spec mục 4.6 + 10.

Remediation subgraph = root-cause gaps + topic trung gian chưa vững trên đường tới
mục tiêu + mục tiêu + topic bắt buộc của giáo viên; topic đã mastered giữ trong
dependency graph để giải thích nhưng không thành bước học; topic `unknown` không
bị kéo vào lộ trình (không mặc định là gap — mục 9/15).

Thiếu thời gian → greedy knapsack theo learning_value/learning_cost, luôn bảo toàn
prerequisite closure (không bao giờ chọn bước mà tiên quyết chưa vững bị hoãn).
Thứ tự bước = topological sort, tie-break: gap_score cao → mở khóa nhiều → rẻ hơn.
"""

from __future__ import annotations

from datetime import datetime

import networkx as nx

from learning_path.adapters import CurriculumGraph
from learning_path.diagnosis import Diagnosis
from learning_path.ranking import RootCauseRanking
from learning_path.schemas import (
    LearningPathRequest,
    PathStep,
    PersonalizedLearningPath,
    StudentTopicKnowledgeState,
)

_REMEDIATION = ("confirmed_gap", "learning")
_DIAGNOSTIC = ("unknown", "uncertain")


def _candidate_steps(
    request: LearningPathRequest,
    diagnosis: Diagnosis,
    ranking: RootCauseRanking,
    g: nx.DiGraph,
) -> set[str]:
    roots = {c.topic_id for c in ranking.candidates}
    targets = set(request.target_topic_ids)

    on_path: set[str] = set()
    for root in roots:
        reach = nx.descendants(g, root) | {root}
        for t in targets:
            back = nx.ancestors(g, t) | {t}
            on_path |= reach & back

    candidates = {tid for tid in on_path if diagnosis.statuses.get(tid) in _REMEDIATION}
    # Unknown/uncertain topics cannot be diagnosed as gaps yet, but they still
    # need an assessment step. Without this branch a new student gets an empty
    # path because root-cause ranking intentionally contains confirmed gaps only.
    if not candidates:
        candidates |= {
            tid
            for tid in diagnosis.subgraph_topic_ids
            if diagnosis.statuses.get(tid) in _DIAGNOSTIC
        }
    candidates |= {
        tid
        for tid in request.required_topic_ids
        if tid in g and diagnosis.statuses.get(tid) != "mastered"
    }
    candidates -= set(request.excluded_topic_ids)
    return candidates


def _learning_value(
    tid: str,
    request: LearningPathRequest,
    states: dict[str, StudentTopicKnowledgeState],
    g: nx.DiGraph,
    candidates: set[str],
) -> float:
    """learning_value = expected_mastery_gain * target_relevance * downstream_impact (mục 10)."""
    mastery = states[tid].mastery_probability if tid in states else 0.3
    gain = max(0.0, request.target_mastery_threshold - mastery)
    best: int | None = None
    for t in request.target_topic_ids:
        if t not in g:
            continue
        try:
            d = nx.shortest_path_length(g, tid, t)
        except nx.NetworkXNoPath:
            continue
        best = d if best is None else min(best, d)
    relevance = 1.0 / (1.0 + best) if best is not None else 0.5  # topic bắt buộc ngoài nhánh
    impact = 1.0 + len(nx.descendants(g, tid) & candidates)
    return gain * relevance * impact


def _select_within_budget(
    candidates: set[str],
    budget: int | None,
    curriculum: CurriculumGraph,
    request: LearningPathRequest,
    states: dict[str, StudentTopicKnowledgeState],
    diagnosis: Diagnosis,
    g: nx.DiGraph,
) -> tuple[set[str], set[str]]:
    """Greedy knapsack bảo toàn closure: chọn theo value/cost, mỗi lần chọn kèm
    toàn bộ tiên quyết chưa vững chưa được chọn của node đó."""
    cost = {tid: curriculum.topics[tid].estimated_learning_time for tid in candidates}
    if budget is None or sum(cost.values()) <= budget:
        return candidates, set()

    ratio = {
        tid: _learning_value(tid, request, states, g, candidates) / max(cost[tid], 1)
        for tid in candidates
    }
    selected: set[str] = set()
    spent = 0
    for tid in sorted(candidates, key=lambda t: (-ratio[t], t)):
        if tid in selected:
            continue
        closure = (nx.ancestors(g, tid) & candidates | {tid}) - selected
        closure_cost = sum(cost[c] for c in closure)
        if spent + closure_cost <= budget:
            selected |= closure
            spent += closure_cost
    return selected, candidates - selected


def _topo_order(
    steps: set[str], diagnosis: Diagnosis, curriculum: CurriculumGraph, g: nx.DiGraph
) -> list[str]:
    """Kahn trên subgraph các bước; khi nhiều bước cùng sẵn sàng: gap_score cao hơn
    → mở khóa nhiều hơn → chi phí thấp hơn → id (tất định)."""
    sub = g.subgraph(steps)
    in_deg = {n: sub.in_degree(n) for n in steps}
    ready = [n for n, d in in_deg.items() if d == 0]
    order: list[str] = []

    def _priority(n: str) -> tuple:
        return (
            -diagnosis.gap_scores.get(n, 0.0),
            -sub.out_degree(n),
            curriculum.topics[n].estimated_learning_time,
            n,
        )

    while ready:
        ready.sort(key=_priority)
        n = ready.pop(0)
        order.append(n)
        for m in sub.successors(n):
            in_deg[m] -= 1
            if in_deg[m] == 0:
                ready.append(m)
    return order


def plan_path(
    request: LearningPathRequest,
    diagnosis: Diagnosis,
    ranking: RootCauseRanking,
    curriculum: CurriculumGraph,
    states: dict[str, StudentTopicKnowledgeState],
    *,
    student_id: str,
    generated_at: datetime,
    version: int = 1,
) -> PersonalizedLearningPath:
    g = curriculum.to_networkx()
    roots = {c.topic_id for c in ranking.candidates}
    targets = set(request.target_topic_ids)

    candidates = _candidate_steps(request, diagnosis, ranking, g)
    selected, deferred = _select_within_budget(
        candidates, request.estimated_minutes_per_student, curriculum, request, states, diagnosis, g
    )

    def _step(tid: str, order: int) -> PathStep:
        state = states.get(tid)
        topic = curriculum.topics[tid]
        topic_status = diagnosis.statuses.get(tid, "unknown")
        if topic_status == "unknown":
            reason = "Chưa có bằng chứng — làm bước chẩn đoán trước khi kết luận hổng kiến thức"
        elif topic_status == "uncertain":
            reason = "Bằng chứng chưa đủ tin cậy — cần câu hỏi chẩn đoán bổ sung"
        elif tid in roots:
            reason = "Gốc rễ lỗ hổng: tiên quyết đều vững, cần lấp trước tiên"
        elif tid in targets:
            reason = "Topic mục tiêu của giáo viên"
        elif tid in request.required_topic_ids:
            reason = "Giáo viên yêu cầu bắt buộc"
        else:
            reason = "Trung gian trên đường từ gốc rễ tới mục tiêu, chưa vững"
        return PathStep(
            topic_id=tid,
            order=order,
            current_mastery=state.mastery_probability if state else 0.3,
            current_confidence=state.confidence_score if state else 0.0,
            target_mastery=request.target_mastery_threshold,
            minimum_confidence=request.minimum_confidence_threshold,
            gap_score=diagnosis.gap_scores.get(tid, 0.0),
            estimated_minutes=topic.estimated_learning_time,
            inclusion_reason=reason,
            completion_condition=(
                f"confidence_score >= {request.minimum_confidence_threshold}"
                if topic_status in _DIAGNOSTIC
                else (
                    f"mastery_probability >= {request.target_mastery_threshold}"
                    f" AND confidence_score >= {request.minimum_confidence_threshold}"
                )
            ),
            status="pending" if topic.content_available else "content_unavailable",
        )

    ordered = [_step(tid, i + 1) for i, tid in enumerate(_topo_order(selected, diagnosis, curriculum, g))]
    n = len(ordered)
    deferred_steps = [
        _step(tid, n + i + 1) for i, tid in enumerate(_topo_order(deferred, diagnosis, curriculum, g))
    ]

    blocked = sorted(
        t for t in targets if t in deferred or (nx.ancestors(g, t) & deferred)
    )

    summary_bits = [
        f"Gốc rễ: {', '.join(sorted(roots))}" if roots else "Không phát hiện gốc rễ hổng",
    ]
    if ranking.needs_diagnosis:
        summary_bits.append(f"Cần chẩn đoán thêm: {', '.join(ranking.needs_diagnosis)}")

    return PersonalizedLearningPath(
        path_id=f"path:{request.class_id}:{student_id}:v{version}",
        student_id=student_id,
        class_id=request.class_id,
        target_topic_ids=request.target_topic_ids,
        teacher_constraints=request.model_dump(
            include={
                "deadline",
                "estimated_minutes_per_student",
                "required_topic_ids",
                "excluded_topic_ids",
                "target_mastery_threshold",
                "minimum_confidence_threshold",
            },
            mode="json",
        ),
        diagnosis_summary="; ".join(summary_bits),
        ordered_steps=ordered,
        deferred_steps=deferred_steps,
        total_estimated_minutes=sum(s.estimated_minutes for s in ordered),
        minimum_required_minutes=sum(
            curriculum.topics[t].estimated_learning_time for t in candidates
        ),
        blocked_target_topics=blocked,
        generated_at=generated_at,
        next_review_checkpoint=request.review_checkpoint,
        version=version,
    )
