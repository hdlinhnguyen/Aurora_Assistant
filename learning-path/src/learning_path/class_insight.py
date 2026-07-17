"""Teacher Control & Class Insight — spec mục 4.7 + 13.

Nguyên tắc: gom nhóm theo root-cause gap và hình thức can thiệp, KHÔNG theo tổng
điểm; học sinh thiếu evidence không nằm trong mẫu số kết luận và không bị mặc định
xếp đầu danh sách cần kèm — các em được ưu tiên chẩn đoán thêm.
"""

from __future__ import annotations

from collections import defaultdict

import networkx as nx

from learning_path.adapters import CurriculumGraph
from learning_path.diagnosis import Diagnosis
from learning_path.ranking import RootCauseRanking
from learning_path.schemas import (
    ClassLearningInsight,
    ClassWideGap,
    InterventionGroup,
    InterventionKind,
    LearningPathRequest,
    PrioritizedStudent,
    StudentTopicKnowledgeState,
)

RETEACH_THRESHOLD = 0.40
SMALL_GROUP_THRESHOLD = 0.15


def _intervention(rate: float) -> InterventionKind:
    if rate >= RETEACH_THRESHOLD:
        return "reteach_class"
    if rate >= SMALL_GROUP_THRESHOLD:
        return "small_group"
    return "individual"


def _mastery_band(mastery: float) -> str:
    if mastery < 0.3:
        return "thap"
    if mastery < 0.6:
        return "vua"
    return "cao"


def _target_relevance(g: nx.DiGraph, topic_id: str, targets: list[str]) -> float:
    best: int | None = None
    for t in targets:
        if t not in g:
            continue
        try:
            d = nx.shortest_path_length(g, topic_id, t)
        except nx.NetworkXNoPath:
            continue
        best = d if best is None else min(best, d)
    return 1.0 / (1.0 + best) if best is not None else 0.0


def compute_class_insight(
    request: LearningPathRequest,
    diagnoses: dict[str, Diagnosis],
    rankings: dict[str, RootCauseRanking],
    states_by_student: dict[str, dict[str, StudentTopicKnowledgeState]],
    curriculum: CurriculumGraph,
) -> ClassLearningInsight:
    g = curriculum.to_networkx()
    min_conf = request.minimum_confidence_threshold

    # ---- gap toàn lớp theo topic (mục 13.1) ----
    all_topics = sorted({t for states in states_by_student.values() for t in states})
    class_wide_gaps: list[ClassWideGap] = []
    intervention_by_topic: dict[str, InterventionKind] = {}
    for tid in all_topics:
        confident = {
            sid: s[tid]
            for sid, s in states_by_student.items()
            if tid in s and s[tid].confidence_score >= min_conf
        }
        gap_students = sorted(
            sid for sid, st in confident.items() if st.mastery_status == "confirmed_gap"
        )
        denominator = len(confident)
        rate = len(gap_students) / denominator if denominator else 0.0
        severity = (
            sum(1 - confident[sid].mastery_probability for sid in gap_students) / len(gap_students)
            if gap_students
            else 0.0
        )
        avg_conf = (
            sum(confident[sid].confidence_score for sid in gap_students) / len(gap_students)
            if gap_students
            else 0.0
        )
        score = rate * severity * _target_relevance(g, tid, request.target_topic_ids) * avg_conf
        kind = _intervention(rate)
        intervention_by_topic[tid] = kind
        class_wide_gaps.append(
            ClassWideGap(
                topic_id=tid,
                confirmed_gap_rate=rate,
                class_gap_score=score,
                gap_student_ids=gap_students,
                denominator=denominator,
                recommended_intervention=kind,
            )
        )
    class_wide_gaps.sort(key=lambda c: -c.class_gap_score)
    suggested_reteach = [
        c.topic_id for c in class_wide_gaps if c.recommended_intervention == "reteach_class"
    ]

    # ---- gom nhóm + ưu tiên theo root cause của từng học sinh (mục 13, 13.2) ----
    groups: dict[str, InterventionGroup] = {}
    prioritized: list[PrioritizedStudent] = []
    insufficient: list[str] = []
    primary_target = request.target_topic_ids[0] if request.target_topic_ids else ""

    for sid in request.student_ids:
        ranking = rankings.get(sid)
        states = states_by_student.get(sid, {})
        if ranking is None or not ranking.candidates:
            has_conclusive = any(
                s.confidence_score >= min_conf and s.mastery_status != "unknown"
                for s in states.values()
            )
            if not has_conclusive or (ranking is not None and ranking.needs_diagnosis):
                insufficient.append(sid)  # ưu tiên chẩn đoán, không vào danh sách kèm
            continue

        root = ranking.candidates[0]  # primary_intervention_group duy nhất tại một thời điểm
        root_state = states.get(root.topic_id)
        band = _mastery_band(root_state.mastery_probability if root_state else 0.3)
        kind = intervention_by_topic.get(root.topic_id, "individual")
        key = f"{root.topic_id}|{band}|{primary_target}|{kind}"
        group = groups.setdefault(
            key,
            InterventionGroup(
                group_key=key,
                root_cause_topic_id=root.topic_id,
                mastery_band=band,
                target_topic_id=primary_target,
                recommended_intervention=kind,
            ),
        )
        group.student_ids.append(sid)

        # help_priority (mục 13.2): gap_score của root đã gói deficit × confidence
        # × relevance × downstream_impact; intervention_need v1 = 1.
        prioritized.append(
            PrioritizedStudent(
                student_id=sid,
                help_priority=root.gap_score,
                reason=f"Gốc rễ “{curriculum.topics[root.topic_id].name}”: {root.reason}",
            )
        )

    prioritized.sort(key=lambda p: (-p.help_priority, p.student_id))

    # ---- phân bố mastery lớp (mục 13.3) ----
    distribution: dict[str, int] = defaultdict(int)
    for sid in request.student_ids:
        confident_states = [
            s
            for s in states_by_student.get(sid, {}).values()
            if s.confidence_score >= min_conf
        ]
        if not confident_states:
            distribution["thieu-du-lieu"] += 1
            continue
        mean = sum(s.mastery_probability for s in confident_states) / len(confident_states)
        if mean >= 0.8:
            distribution["manh"] += 1
        elif mean >= 0.5:
            distribution["trung-binh"] += 1
        else:
            distribution["can-ho-tro"] += 1

    return ClassLearningInsight(
        class_id=request.class_id,
        target_topic_ids=request.target_topic_ids,
        class_mastery_distribution=dict(distribution),
        class_wide_gaps=class_wide_gaps,
        suggested_reteach_topics=suggested_reteach,
        intervention_groups=sorted(groups.values(), key=lambda gr: gr.group_key),
        prioritized_students=prioritized,
        insufficient_evidence_students=sorted(insufficient),
    )
