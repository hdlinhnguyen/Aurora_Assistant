"""Evidence Ingestion & Calibration — spec mục 4.1 + 5.

evidence_weight = source_reliability * evaluation_reliability * difficulty_informativeness
                * hint_factor * attempt_factor * recency_factor
"""

from datetime import datetime, timedelta, timezone

import pytest

from learning_path.evidence import (
    EvidenceStore,
    calibrate_paper,
    calibrate_quiz,
)
from learning_path.schemas import RawPaperEvidence, RawQuizEvidence

NOW = datetime(2026, 7, 17, 12, 0, tzinfo=timezone.utc)


def quiz(evidence_id="q1", *, score=1.0, hints_used=0, attempt_number=1, inference_weight=1.0, difficulty="medium", occurred_at=NOW):
    return RawQuizEvidence(
        evidence_id=evidence_id,
        student_id="minh",
        session_id="s1",
        question_id="cau-1",
        topic_id="l7-phep-tinh-so-huu-ti",
        score=score,
        attempt_number=attempt_number,
        hints_used=hints_used,
        grading_method="auto",
        inference_weight=inference_weight,
        difficulty=difficulty,
        occurred_at=occurred_at,
    )


def paper(evidence_id="p1", *, points_earned=4.0, points_possible=4.0, teacher_confirmed=True):
    return RawPaperEvidence(
        evidence_id=evidence_id,
        student_id="minh",
        assessment_attempt_id="a1",
        question_id="cau-giay-1",
        rubric_item_id="r1",
        topic_id="l5-quy-dong-phan-so",
        points_earned=points_earned,
        points_possible=points_possible,
        teacher_confirmed=teacher_confirmed,
        occurred_at=NOW,
    )


# ---- observation_value ----


def test_paper_observation_value_is_rubric_point_ratio():
    e = calibrate_paper(paper(points_earned=2.0, points_possible=4.0), as_of=NOW)
    assert e.observation_value == 0.5


def test_quiz_observation_value_passes_through_partial_credit():
    e = calibrate_quiz(quiz(score=0.5), as_of=NOW)
    assert e.observation_value == 0.5


# ---- evidence_weight (hệ số khởi tạo minh họa của spec mục 5) ----


def test_confirmed_paper_weight_is_1():
    e = calibrate_paper(paper(), as_of=NOW)
    assert e.evidence_weight == pytest.approx(1.0)


def test_auto_quiz_weight_is_085():
    e = calibrate_quiz(quiz(), as_of=NOW)
    assert e.evidence_weight == pytest.approx(0.85)


def test_hint_used_multiplies_070():
    e = calibrate_quiz(quiz(hints_used=1), as_of=NOW)
    assert e.evidence_weight == pytest.approx(0.85 * 0.70)


def test_attempts_decay_exponentially():
    e = calibrate_quiz(quiz(attempt_number=2), as_of=NOW)
    third = calibrate_quiz(quiz(attempt_number=3), as_of=NOW)
    assert e.evidence_weight == pytest.approx(0.85 * 0.60)
    assert third.evidence_weight == pytest.approx(0.85 * 0.60**2)


def test_indirect_distractor_evidence_uses_inference_weight():
    e = calibrate_quiz(quiz(score=0.0, inference_weight=0.35), as_of=NOW)
    assert e.evidence_weight == pytest.approx(0.85 * 0.35)


def test_difficulty_changes_informativeness_with_safe_bounds():
    easy = calibrate_quiz(quiz(difficulty="easy"), as_of=NOW)
    medium = calibrate_quiz(quiz(difficulty="medium"), as_of=NOW)
    hard = calibrate_quiz(quiz(difficulty="hard"), as_of=NOW)
    assert easy.evidence_weight < medium.evidence_weight < hard.evidence_weight <= 1


def test_older_evidence_weighs_less_monotonically():
    fresh = calibrate_quiz(quiz(occurred_at=NOW), as_of=NOW)
    old = calibrate_quiz(quiz(occurred_at=NOW - timedelta(days=90)), as_of=NOW)
    older = calibrate_quiz(quiz(occurred_at=NOW - timedelta(days=180)), as_of=NOW)
    assert fresh.evidence_weight > old.evidence_weight > older.evidence_weight


# ---- trạng thái provisional / confirmed (spec mục 3.2) ----


def test_unconfirmed_paper_is_provisional():
    e = calibrate_paper(paper(teacher_confirmed=False), as_of=NOW)
    assert e.status == "provisional"


def test_confirmed_paper_is_confirmed():
    e = calibrate_paper(paper(teacher_confirmed=True), as_of=NOW)
    assert e.status == "confirmed"


# ---- ingestion: dedup + idempotent + supersede (spec mục 4.1, 15) ----


def test_ingest_dedups_by_evidence_id():
    store = EvidenceStore()
    e = calibrate_quiz(quiz("q1"), as_of=NOW)
    store.ingest([e, e])
    store.ingest([e])
    assert len(store.active_for("minh", "l7-phep-tinh-so-huu-ti")) == 1


def test_supersede_removes_from_active_set():
    store = EvidenceStore()
    e1 = calibrate_quiz(quiz("q1"), as_of=NOW)
    e2 = calibrate_quiz(quiz("q2"), as_of=NOW)
    store.ingest([e1, e2])
    store.supersede("q1")
    active = store.active_for("minh", "l7-phep-tinh-so-huu-ti")
    assert [e.evidence_id for e in active] == ["q2"]


def test_active_evidence_sorted_by_time():
    store = EvidenceStore()
    late = calibrate_quiz(quiz("q-late", occurred_at=NOW), as_of=NOW)
    early = calibrate_quiz(quiz("q-early", occurred_at=NOW - timedelta(days=1)), as_of=NOW)
    store.ingest([late, early])
    active = store.active_for("minh", "l7-phep-tinh-so-huu-ti")
    assert [e.evidence_id for e in active] == ["q-early", "q-late"]
