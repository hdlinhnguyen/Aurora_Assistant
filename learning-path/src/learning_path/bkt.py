"""Core Mastery Module — weighted/soft-evidence BKT + confidence score (spec mục 4.2, 6, 7).

Mô hình Corbett–Anderson chuẩn, mở rộng hai chiều theo spec:
- Soft evidence: observation_value o ∈ [0,1] nội suy likelihood giữa "đúng" và "sai"
  (P(obs|L) = o·(1-s) + (1-o)·s) thay vì ép về nhị phân.
- Evidence weight w ∈ [0,1]: posterior = (1-w)·prior + w·posterior_đầy_đủ — evidence
  yếu (dùng gợi ý, làm lại, đã cũ) kéo mastery ít hơn; w=0 không đổi gì.

BKT chỉ ước lượng mastery — không tạo lộ trình (spec mục 6, 18).
"""

from __future__ import annotations

import math

from pydantic import BaseModel

from learning_path.schemas import (
    CalibratedMasteryEvidence,
    MasteryStatus,
    StudentTopicKnowledgeState,
)


class BKTParams(BaseModel):
    """Tham số mặc định theo môn/khối (spec mục 6) — v1 dùng một bộ chung, cấu hình được."""

    p_l0: float = 0.3  # biết trước khi có evidence
    # p_t tạo "sàn" mastery ≈ p_t (sai liên tục vẫn không tụt dưới sàn vì mỗi lượt
    # luyện là một cơ hội học). 0.2 làm sàn quá cao (~0.22) khiến confirmed_gap
    # gần như bất khả; 0.1 giữ được ngữ nghĩa "hổng rõ ràng" cho chuỗi sai sạch.
    p_t: float = 0.1  # học được sau một cơ hội luyện tập
    p_s: float = 0.1  # slip: sai dù đã biết
    p_g: float = 0.2  # guess: đúng dù chưa biết


class ConfidenceConfig(BaseModel):
    """Ngưỡng mục 7 — phải cấu hình được theo môn và khối."""

    k: float = 5.0  # số evidence hiệu dụng để sufficiency cao
    certainty_weight: float = 0.7
    consistency_weight: float = 0.3
    mastered_threshold: float = 0.80
    gap_threshold: float = 0.60
    # Spec minh họa 0.70, nhưng với certainty entropy chuẩn hóa thì 0.70 bất khả
    # ngay cả khi 8/8 câu sai sạch (tối đa thực tế ~0.45–0.65): sufficiency 8 câu
    # ≈ 0.80 và certainty tại sàn mastery ~0.5 đã chặn trần. 0.40 là giá trị
    # hiệu chỉnh để ca kinh điển (≥6 evidence sạch) vượt ngưỡng — đúng tinh thần
    # "ngưỡng phải cấu hình được theo môn và khối" (spec mục 7.4).
    confidence_threshold: float = 0.40


def _predicted_correct(p_l: float, params: BKTParams) -> float:
    return p_l * (1 - params.p_s) + (1 - p_l) * params.p_g


def _update_once(p_l: float, obs: float, weight: float, params: BKTParams) -> float:
    like_known = obs * (1 - params.p_s) + (1 - obs) * params.p_s
    like_unknown = obs * params.p_g + (1 - obs) * (1 - params.p_g)
    denom = p_l * like_known + (1 - p_l) * like_unknown
    posterior = p_l * like_known / denom if denom > 0 else p_l
    posterior = posterior + (1 - posterior) * params.p_t  # cơ hội học sau lượt luyện
    return (1 - weight) * p_l + weight * posterior


def _entropy_certainty(p: float) -> float:
    """posterior_certainty = 1 - H(p)/log2 (mục 7.2): p giữa chừng → certainty thấp."""
    if p <= 0.0 or p >= 1.0:
        return 1.0
    h = -p * math.log(p) - (1 - p) * math.log(1 - p)
    return 1.0 - h / math.log(2)


def classify(
    mastery: float, confidence: float, evidence_count: int, config: ConfidenceConfig
) -> MasteryStatus:
    """Ngưỡng mục 7.4 + trạng thái `unknown` khi chưa có evidence nào (mục 15)."""
    if evidence_count == 0:
        return "unknown"
    if confidence < config.confidence_threshold:
        return "uncertain"
    if mastery >= config.mastered_threshold:
        return "mastered"
    if mastery < config.gap_threshold:
        return "confirmed_gap"
    return "learning"


def knowledge_state(
    student_id: str,
    topic_id: str,
    evidences: list[CalibratedMasteryEvidence],
    *,
    params: BKTParams,
    config: ConfidenceConfig,
) -> StudentTopicKnowledgeState:
    """Chạy BKT trên chuỗi evidence (đã sắp theo thời gian) → trạng thái mục 8.1."""
    ordered = sorted(evidences, key=lambda e: e.occurred_at)

    p_l = params.p_l0
    weighted_error = 0.0
    total_weight = 0.0
    for e in ordered:
        # consistency (mục 7.3): sai số dự đoán TRƯỚC khi cập nhật, theo thứ tự thời gian
        # — mô hình đã thích nghi thì học sinh đang tiến bộ không bị phạt.
        predicted = _predicted_correct(p_l, params)
        weighted_error += e.evidence_weight * abs(predicted - e.observation_value)
        total_weight += e.evidence_weight
        p_l = _update_once(p_l, e.observation_value, e.evidence_weight, params)

    unique_questions = {e.question_id or e.evidence_id for e in ordered}
    sources = {e.source for e in ordered}
    known_difficulties = {
        (e.difficulty or "").strip().lower()
        for e in ordered
        if (e.difficulty or "").strip().lower() not in ("", "unknown")
    }
    diversity_limited = len(unique_questions) < 3
    if sources == {"quiz"} and known_difficulties and len(known_difficulties) < 2:
        diversity_limited = True
    # Repetition may raise the posterior, but cannot by itself create full
    # mastery. Keep it below the mastered threshold until evidence covers
    # enough independent questions (and, for quizzes, difficulty bands).
    if diversity_limited:
        p_l = min(p_l, max(params.p_l0, config.mastered_threshold - 0.01))

    consistency = 1.0 - (weighted_error / total_weight) if total_weight > 0 else 1.0

    effective = total_weight
    sufficiency = 1.0 - math.exp(-effective / config.k)  # mục 7.1
    certainty = _entropy_certainty(p_l)  # mục 7.2
    confidence = sufficiency * (
        config.certainty_weight * certainty + config.consistency_weight * consistency
    )  # mục 7.4

    source_breakdown: dict[str, int] = {}
    for e in ordered:
        source_breakdown[e.source] = source_breakdown.get(e.source, 0) + 1

    return StudentTopicKnowledgeState(
        student_id=student_id,
        topic_id=topic_id,
        mastery_probability=p_l,
        confidence_score=confidence,
        consistency=consistency,
        evidence_count=len(ordered),
        effective_evidence=effective,
        last_evidence_at=ordered[-1].occurred_at if ordered else None,
        mastery_status=classify(p_l, confidence, len(ordered), config),
        evidence_summary={
            "mean_observation": (
                sum(e.observation_value for e in ordered) / len(ordered) if ordered else 0.0
            ),
            "evidence_sufficiency": sufficiency,
            "posterior_certainty": certainty,
            "unique_question_count": float(len(unique_questions)),
            "difficulty_band_count": float(len(known_difficulties)),
            "diversity_limited": 1.0 if diversity_limited else 0.0,
        },
        source_breakdown=source_breakdown,
    )


def propagate_mastery(
    student_id: str,
    states: dict[str, StudentTopicKnowledgeState],
    curriculum: CurriculumGraph,
    store: EvidenceStore,
    *,
    params: BKTParams,
    config: ConfidenceConfig,
) -> dict[str, StudentTopicKnowledgeState]:
    """Cơ chế cập nhật lan truyền Dynamic Alpha (mục 3.1 & 3.2 trong tài liệu kiến trúc).
    
    Duyệt ngược đồ thị theo thứ tự topological đảo để lan truyền mastery, confidence
    và virtual evidence từ dependent xuống prerequisite.
    """
    import math
    import networkx as nx

    # 1. Khởi tạo toàn bộ trạng thái cho các topic trong đồ thị nếu chưa tồn tại
    full_states = {}
    for tid in curriculum.topics:
        if tid in states:
            full_states[tid] = states[tid].model_copy()
        else:
            full_states[tid] = StudentTopicKnowledgeState(
                student_id=student_id,
                topic_id=tid,
                mastery_probability=params.p_l0,
                confidence_score=0.0,
                consistency=1.0,
                evidence_count=0,
                effective_evidence=0.0,
                mastery_status="unknown",
                evidence_summary={"evidence_sufficiency": 0.0, "posterior_certainty": 0.0},
                source_breakdown={},
            )

    # 2. Xây dựng đồ thị NetworkX
    g = curriculum.to_networkx()

    # 3. Duyệt ngược topological sort
    try:
        topo_order = list(nx.topological_sort(g))
        reverse_topo = reversed(topo_order)
    except nx.NetworkXUnfeasible:
        # Nếu có chu trình (không mong muốn), duyệt theo danh sách các topics
        reverse_topo = list(curriculum.topics.keys())

    # Dynamic inference is deliberately conservative: indirect evidence must
    # never be as strong as answering the prerequisite directly.
    alpha_0 = 0.40
    lambda_val = 0.4

    for tid_c in reverse_topo:
        state_c = full_states[tid_c]

        # Lấy danh sách tiên quyết trực tiếp của tid_c
        prereqs = list(g.predecessors(tid_c))
        if not prereqs:
            continue

        # Đếm số lượng câu trả lời đúng liên tiếp gần nhất (observation_value >= 0.8)
        evs_c = store.active_for(student_id, tid_c)
        n = 0
        for ev in reversed(evs_c):
            if ev.observation_value >= 0.8:
                n += 1
            else:
                break

        # Streak strengthens inference, while confidence and the authored edge
        # strength limit how much knowledge can travel across the graph.
        alpha_n = alpha_0 + (1 - alpha_0) * (1.0 - math.exp(-lambda_val * n))

        # Lan truyền cho từng tiên quyết
        for tid_p in prereqs:
            state_p = full_states[tid_p]

            edge_strength = float(g.edges[tid_p, tid_c].get("strength", 0.7))
            confidence_factor = 0.5 + 0.5 * state_c.confidence_score
            propagation_weight = min(1.0, edge_strength * confidence_factor * alpha_n)
            propagated_mastery = propagation_weight * state_c.mastery_probability
            if propagated_mastery > state_p.mastery_probability:
                state_p.mastery_probability = propagated_mastery

                # Lan truyền thông số tin cậy và số evidence ảo
                state_p.effective_evidence = max(
                    state_p.effective_evidence,
                    propagation_weight * state_c.effective_evidence,
                )
                state_p.confidence_score = max(
                    state_p.confidence_score,
                    propagation_weight * state_c.confidence_score,
                )
                inferred_count = (
                    max(1, math.ceil(propagation_weight * state_c.evidence_count))
                    if state_c.evidence_count > 0
                    else 0
                )
                state_p.evidence_count = max(state_p.evidence_count, inferred_count)
                if state_c.last_evidence_at is not None:
                    if (
                        state_p.last_evidence_at is None
                        or state_c.last_evidence_at > state_p.last_evidence_at
                    ):
                        state_p.last_evidence_at = state_c.last_evidence_at
                state_p.source_breakdown = dict(state_p.source_breakdown)
                state_p.source_breakdown["inferred_prerequisite"] = max(
                    state_p.source_breakdown.get("inferred_prerequisite", 0),
                    inferred_count,
                )
                state_p.evidence_summary = dict(state_p.evidence_summary)
                state_p.evidence_summary["inferred_from_dependent"] = 1.0

                # Phân loại lại trạng thái dựa trên các thông số lan truyền mới
                state_p.mastery_status = classify(
                    state_p.mastery_probability,
                    state_p.confidence_score,
                    state_p.evidence_count,
                    config,
                )
                # Positive evidence inferred from a dependent can support a
                # prerequisite, but it must never manufacture a confirmed gap.
                # Gap conclusions require direct or explicit negative evidence.
                if state_p.mastery_status == "confirmed_gap":
                    state_p.mastery_status = "uncertain"

    return full_states

