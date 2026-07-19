"""Evidence Ingestion & Calibration — spec mục 4.1 + 5.

evidence_weight = source_reliability * evaluation_reliability * difficulty_informativeness
                * hint_factor * attempt_factor * recency_factor

Các hệ số là giá trị khởi tạo minh họa của spec, phải hiệu chỉnh bằng dữ liệu thực tế
— vì vậy tất cả nằm trong CalibrationConfig thay vì hằng số rải rác.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from pydantic import BaseModel

from learning_path.schemas import (
    CalibratedMasteryEvidence,
    RawPaperEvidence,
    RawQuizEvidence,
)


class CalibrationConfig(BaseModel):
    source_reliability_paper: float = 1.00
    source_reliability_quiz: float = 0.85
    evaluation_reliability: float = 1.00
    difficulty_easy: float = 0.75
    difficulty_medium: float = 1.00
    difficulty_hard: float = 1.10
    difficulty_very_hard: float = 1.15
    hint_factor: float = 0.70  # đã dùng gợi ý
    attempt_decay: float = 0.60  # diminishing return theo từng lần lặp cùng question_id
    recency_half_life_days: float = 180.0  # trọng số giảm nửa sau ~1 học kỳ


DEFAULT_CALIBRATION = CalibrationConfig()


def _recency_factor(occurred_at: datetime, as_of: datetime, half_life_days: float) -> float:
    days = max(0.0, (as_of - occurred_at).total_seconds() / 86400.0)
    return 0.5 ** (days / half_life_days)


def calibrate_quiz(
    e: RawQuizEvidence, *, as_of: datetime, config: CalibrationConfig = DEFAULT_CALIBRATION
) -> CalibratedMasteryEvidence:
    difficulty = e.difficulty.strip().lower()
    difficulty_factor = {
        "easy": config.difficulty_easy,
        "nb": config.difficulty_easy,
        "nhận biết": config.difficulty_easy,
        "medium": config.difficulty_medium,
        "th": config.difficulty_medium,
        "thông hiểu": config.difficulty_medium,
        "hard": config.difficulty_hard,
        "vd": config.difficulty_hard,
        "vận dụng": config.difficulty_hard,
        "very_hard": config.difficulty_very_hard,
        "vdc": config.difficulty_very_hard,
        "vận dụng cao": config.difficulty_very_hard,
    }.get(difficulty, config.difficulty_medium)
    attempt_factor = config.attempt_decay ** (e.attempt_number - 1)
    weight = (
        config.source_reliability_quiz
        * config.evaluation_reliability
        * difficulty_factor
        * (config.hint_factor if e.hints_used > 0 else 1.0)
        * attempt_factor
        * e.inference_weight
        * _recency_factor(e.occurred_at, as_of, config.recency_half_life_days)
    )
    return CalibratedMasteryEvidence(
        evidence_id=e.evidence_id,
        student_id=e.student_id,
        topic_id=e.topic_id,
        source="quiz",
        observation_value=e.score,
        evidence_weight=weight,
        occurred_at=e.occurred_at,
        question_id=e.question_id,
        difficulty=difficulty,
        lineage=f"quiz:{e.session_id}:{e.question_id}",
        status="confirmed",  # quiz chấm tự động là chính thức (spec mục 3.3)
    )


def calibrate_paper(
    e: RawPaperEvidence, *, as_of: datetime, config: CalibrationConfig = DEFAULT_CALIBRATION
) -> CalibratedMasteryEvidence:
    weight = (
        config.source_reliability_paper
        * config.evaluation_reliability
        * _recency_factor(e.occurred_at, as_of, config.recency_half_life_days)
    )
    return CalibratedMasteryEvidence(
        evidence_id=e.evidence_id,
        student_id=e.student_id,
        topic_id=e.topic_id,
        source="paper",
        observation_value=e.points_earned / e.points_possible,
        evidence_weight=weight,
        occurred_at=e.occurred_at,
        assessment_attempt_id=e.assessment_attempt_id,
        question_id=e.question_id,
        rubric_item_id=e.rubric_item_id,
        teacher_confirmed=e.teacher_confirmed,
        lineage=f"paper:{e.assessment_attempt_id}:{e.rubric_item_id}",
        # Chỉ evidence giáo viên xác nhận mới cập nhật mastery chính thức (spec mục 3.2)
        status="confirmed" if e.teacher_confirmed else "provisional",
    )


class EvidenceStore:
    """Kho evidence trong bộ nhớ: dedup theo evidence_id, ingest idempotent, hỗ trợ supersede.

    `active_for` trả evidence confirmed, chưa superseded, theo thứ tự thời gian —
    đúng dạng đầu vào BKT yêu cầu (tôn trọng thứ tự, spec mục 7.3).
    """

    def __init__(self) -> None:
        self._by_id: dict[str, CalibratedMasteryEvidence] = {}
        self._superseded: set[str] = set()

    def ingest(self, evidences: list[CalibratedMasteryEvidence]) -> None:
        for e in evidences:
            self._by_id.setdefault(e.evidence_id, e)

    def supersede(self, evidence_id: str) -> None:
        self._superseded.add(evidence_id)

    def active_for(self, student_id: str, topic_id: str) -> list[CalibratedMasteryEvidence]:
        found = [
            e
            for e in self._by_id.values()
            if e.student_id == student_id
            and e.topic_id == topic_id
            and e.status == "confirmed"
            and e.evidence_id not in self._superseded
        ]
        return sorted(found, key=lambda e: e.occurred_at)

    def active_by_topic(self, student_id: str) -> dict[str, list[CalibratedMasteryEvidence]]:
        grouped: dict[str, list[CalibratedMasteryEvidence]] = defaultdict(list)
        for e in self._by_id.values():
            if (
                e.student_id == student_id
                and e.status == "confirmed"
                and e.evidence_id not in self._superseded
            ):
                grouped[e.topic_id].append(e)
        return {t: sorted(es, key=lambda e: e.occurred_at) for t, es in grouped.items()}
