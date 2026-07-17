"""Root-Cause Ranker — spec mục 4.5 + 9.

Root-cause candidate = topic `confirmed_gap` là "điểm đứt sớm nhất có bằng chứng
trong một nhánh prerequisite": không tổ tiên nào của nó (trong subgraph) cũng đang
`confirmed_gap`. Topic `uncertain` trên đường tới mục tiêu không được kết luận —
đưa sang danh sách cần chẩn đoán thêm (Diagnostic Assessment Planner, mục 4.4).
"""

from __future__ import annotations

import networkx as nx
from pydantic import BaseModel, Field

from learning_path.adapters import CurriculumGraph
from learning_path.diagnosis import Diagnosis


class RootCauseCandidate(BaseModel):
    topic_id: str
    gap_score: float
    reason: str


class RootCauseRanking(BaseModel):
    candidates: list[RootCauseCandidate] = Field(default_factory=list)  # giảm dần theo gap_score
    needs_diagnosis: list[str] = Field(default_factory=list)  # uncertain trên đường tới mục tiêu


def rank_root_causes(diagnosis: Diagnosis, curriculum: CurriculumGraph) -> RootCauseRanking:
    if diagnosis.error is not None:
        return RootCauseRanking()

    g = curriculum.to_networkx()
    subgraph = set(diagnosis.subgraph_topic_ids)

    needs_diagnosis = sorted(
        tid for tid in subgraph if diagnosis.statuses.get(tid) == "uncertain"
    )

    candidates: list[RootCauseCandidate] = []
    for tid in subgraph:
        if diagnosis.statuses.get(tid) != "confirmed_gap":
            continue
        gapped_ancestors = [
            a
            for a in nx.ancestors(g, tid)
            if a in subgraph and diagnosis.statuses.get(a) == "confirmed_gap"
        ]
        if gapped_ancestors:
            continue  # còn điểm đứt sớm hơn trên nhánh này
        solid = [
            a
            for a in g.predecessors(tid)
            if a in subgraph and diagnosis.statuses.get(a) == "mastered"
        ]
        candidates.append(
            RootCauseCandidate(
                topic_id=tid,
                gap_score=diagnosis.gap_scores.get(tid, 0.0),
                reason=(
                    "Điểm đứt sớm nhất có bằng chứng: không tiên quyết nào đang hổng"
                    + (f"; tiên quyết đã vững: {', '.join(sorted(solid))}" if solid else "")
                ),
            )
        )

    candidates.sort(key=lambda c: c.gap_score, reverse=True)
    return RootCauseRanking(candidates=candidates, needs_diagnosis=needs_diagnosis)
