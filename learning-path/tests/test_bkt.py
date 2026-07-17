"""Weighted/soft-evidence BKT + confidence score — spec mục 6-7 + checklist mục 16."""

from datetime import datetime, timedelta, timezone

import pytest

from learning_path.bkt import BKTParams, ConfidenceConfig, knowledge_state
from learning_path.schemas import CalibratedMasteryEvidence

NOW = datetime(2026, 7, 17, 12, 0, tzinfo=timezone.utc)
PARAMS = BKTParams()  # p_l0=0.3, p_t=0.1, p_s=0.1, p_g=0.2
CONF = ConfidenceConfig()


def ev(i: int, value: float, weight: float = 1.0) -> CalibratedMasteryEvidence:
    return CalibratedMasteryEvidence(
        evidence_id=f"e{i}",
        student_id="minh",
        topic_id="l5-quy-dong-phan-so",
        source="quiz",
        observation_value=value,
        evidence_weight=weight,
        occurred_at=NOW + timedelta(minutes=i),
    )


def state(evidences):
    return knowledge_state("minh", "l5-quy-dong-phan-so", evidences, params=PARAMS, config=CONF)


# ---- mastery_probability ----


def test_no_evidence_keeps_prior_and_is_unknown():
    s = state([])
    assert s.mastery_probability == pytest.approx(PARAMS.p_l0)
    assert s.mastery_status == "unknown"
    assert s.confidence_score == 0.0


def test_all_correct_raises_mastery_toward_1():
    s = state([ev(i, 1.0) for i in range(6)])
    assert s.mastery_probability > 0.85


def test_all_wrong_drops_mastery_toward_0():
    s = state([ev(i, 0.0) for i in range(6)])
    assert s.mastery_probability < 0.15


def test_partial_credit_moves_less_than_full_credit():
    full = state([ev(0, 1.0)]).mastery_probability
    half = state([ev(0, 0.5)]).mastery_probability
    assert abs(half - PARAMS.p_l0) < abs(full - PARAMS.p_l0)


def test_zero_weight_evidence_changes_nothing():
    s = state([ev(0, 1.0, weight=0.0)])
    assert s.mastery_probability == pytest.approx(PARAMS.p_l0)
    assert s.effective_evidence == 0.0


def test_low_weight_evidence_moves_less_than_full_weight():
    full = state([ev(0, 1.0, weight=1.0)]).mastery_probability
    damped = state([ev(0, 1.0, weight=0.3)]).mastery_probability
    assert damped < full


# ---- confidence_score (mục 7) ----


def test_single_evidence_gives_low_sufficiency_hence_uncertain():
    s = state([ev(0, 1.0)])
    assert s.confidence_score < CONF.confidence_threshold
    assert s.mastery_status == "uncertain"


def test_mid_mastery_gives_low_posterior_certainty():
    # xen kẽ đúng/sai → mastery quanh 0.5 → certainty thấp
    mixed = state([ev(i, 1.0 if i % 2 == 0 else 0.0) for i in range(8)])
    consistent = state([ev(i, 1.0) for i in range(8)])
    assert mixed.confidence_score < consistent.confidence_score


def test_improving_student_more_consistent_than_erratic():
    improving = state([ev(0, 0.0), ev(1, 0.0), ev(2, 1.0), ev(3, 1.0), ev(4, 1.0)])
    erratic = state([ev(0, 1.0), ev(1, 0.0), ev(2, 1.0), ev(3, 0.0), ev(4, 1.0)])
    assert improving.consistency > erratic.consistency


# ---- phân loại mastery_status (ngưỡng mục 7.4) ----


def test_many_correct_evidences_classify_mastered():
    s = state([ev(i, 1.0) for i in range(8)])
    assert s.mastery_status == "mastered"


def test_many_wrong_evidences_classify_confirmed_gap():
    s = state([ev(i, 0.0) for i in range(8)])
    assert s.mastery_status == "confirmed_gap"


# ---- các trường thống kê của StudentTopicKnowledgeState (mục 8.1) ----


def test_state_bookkeeping_fields():
    s = state([ev(0, 1.0, weight=0.85), ev(1, 0.0, weight=0.5)])
    assert s.evidence_count == 2
    assert s.effective_evidence == pytest.approx(1.35)
    assert s.last_evidence_at == NOW + timedelta(minutes=1)
    assert s.source_breakdown == {"quiz": 2}
