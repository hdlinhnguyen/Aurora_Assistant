"""Gap Diagnosis Engine — spec mục 4.3 + 9.

Từ topic mục tiêu: reverse traversal lấy RelevantSubgraph = ancestors + targets,
kiểm DAG, phân loại từng topic theo trạng thái BKT, tính gap_score:

    gap_score = mastery_deficit * diagnostic_confidence * target_relevance
              * downstream_impact * recency_factor

Topic `unknown`/`uncertain` không bao giờ bị mặc định là gap (gap_score chỉ tính
cho topic có kết luận hổng bằng bằng chứng).
"""

from __future__ import annotations

from typing import Literal

import networkx as nx
from pydantic import BaseModel, Field

from learning_path.adapters import CurriculumGraph
from learning_path.schemas import MasteryStatus, StudentTopicKnowledgeState


class DiagnosisError(BaseModel):
    code: Literal["graph_validation_error", "target_not_in_graph"]
    detail: str


class Diagnosis(BaseModel):
    target_topic_ids: list[str]
    subgraph_topic_ids: list[str] = Field(default_factory=list)
    statuses: dict[str, MasteryStatus] = Field(default_factory=dict)
    gap_scores: dict[str, float] = Field(default_factory=dict)
    error: DiagnosisError | None = None


def _target_relevance(g: nx.DiGraph, topic_id: str, targets: list[str]) -> float:
    """1/(1+distance) — distance = đường đi ngắn nhất theo chiều tiên quyết tới target gần nhất."""
    best: int | None = None
    for t in targets:
        try:
            d = nx.shortest_path_length(g, topic_id, t)
        except nx.NetworkXNoPath:
            continue
        best = d if best is None else min(best, d)
    return 1.0 / (1.0 + best) if best is not None else 0.0


def diagnose(
    curriculum: CurriculumGraph,
    states: dict[str, StudentTopicKnowledgeState],
    target_topic_ids: list[str],
) -> Diagnosis:
    g = curriculum.to_networkx()

    missing = [t for t in target_topic_ids if t not in curriculum.topics]
    if missing:
        return Diagnosis(
            target_topic_ids=target_topic_ids,
            error=DiagnosisError(
                code="target_not_in_graph", detail=f"Topic không tồn tại: {', '.join(missing)}"
            ),
        )

    if not nx.is_directed_acyclic_graph(g):
        cycle = nx.find_cycle(g)
        return Diagnosis(
            target_topic_ids=target_topic_ids,
            error=DiagnosisError(
                code="graph_validation_error",
                detail=f"Knowledge Graph có chu trình: {cycle}",
            ),
        )

    # RelevantSubgraph = ancestors(targets) + targets (mục 9)
    subgraph: set[str] = set(target_topic_ids)
    for t in target_topic_ids:
        subgraph |= nx.ancestors(g, t)

    statuses: dict[str, MasteryStatus] = {
        tid: (states[tid].mastery_status if tid in states else "unknown") for tid in subgraph
    }

    gap_scores: dict[str, float] = {}
    for tid in subgraph:
        state = states.get(tid)
        if state is None or statuses[tid] not in ("confirmed_gap", "learning"):
            gap_scores[tid] = 0.0  # unknown/uncertain/mastered: không mặc định là gap
            continue
        mastery_deficit = 1.0 - state.mastery_probability
        diagnostic_confidence = state.confidence_score
        relevance = _target_relevance(g, tid, target_topic_ids)
        unmastered_descendants = sum(
            1
            for d in nx.descendants(g, tid)
            if d in subgraph and statuses.get(d) != "mastered"
        )
        # Spec: downstream_impact = số topic chưa vững phụ thuộc. Dùng (1 + count) để
        # gap ở chính node mục tiêu (0 hậu duệ) không bị nhân về 0 — giữ nguyên thứ tự.
        downstream_impact = 1.0 + unmastered_descendants
        recency_factor = 1.0  # v1: độ tươi đã nằm trong evidence_weight (recency decay)
        gap_scores[tid] = (
            mastery_deficit * diagnostic_confidence * relevance * downstream_impact * recency_factor
        )

    return Diagnosis(
        target_topic_ids=target_topic_ids,
        subgraph_topic_ids=sorted(subgraph),
        statuses=statuses,
        gap_scores=gap_scores,
    )
