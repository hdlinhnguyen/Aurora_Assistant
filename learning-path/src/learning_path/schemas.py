"""Pydantic models — hợp đồng dữ liệu theo spec 2026-07-17-personalized-learning-path-design.md.

Tên trường giữ nguyên snake_case đúng như spec (mục 5, 8, 11, 13.3) để đội đối chiếu
spec ↔ code trong vài giây. Model được bổ sung dần theo từng module (TDD).
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Topic(BaseModel):
    """Spec mục 8.3. `content_available` là mở rộng của adapter Chắc Gốc:
    node mờ (`mo: true`) chưa có câu hỏi/lời giảng → mục 15 `content_unavailable`."""

    topic_id: str
    subject_id: str
    grade_level: int = Field(ge=1, le=12)
    name: str
    estimated_learning_time: int = Field(gt=0)  # phút
    content_available: bool = True


class PrerequisiteEdge(BaseModel):
    """Spec mục 8.3 — chiều: prerequisite → dependent (học A trước mới học được B)."""

    prerequisite_topic_id: str
    dependent_topic_id: str


class RawQuizEvidence(BaseModel):
    """Evidence thô từ quiz trên hệ thống (spec mục 3.3). `score` ∈ [0,1] cho phép đúng một phần."""

    evidence_id: str
    student_id: str
    session_id: str
    question_id: str
    topic_id: str
    score: float = Field(ge=0, le=1)
    attempt_number: int = Field(default=1, ge=1)
    hints_used: int = Field(default=0, ge=0)
    grading_method: str = "auto"
    occurred_at: datetime


class RawPaperEvidence(BaseModel):
    """Evidence thô từ bài kiểm tra giấy đã qua OCR + rubric mapping (spec mục 3.2)."""

    evidence_id: str
    student_id: str
    assessment_attempt_id: str
    question_id: str
    rubric_item_id: str
    topic_id: str
    points_earned: float = Field(ge=0)
    points_possible: float = Field(gt=0)
    teacher_confirmed: bool
    occurred_at: datetime


class CalibratedMasteryEvidence(BaseModel):
    """Spec mục 5 — evidence đã chuẩn hóa, đầu vào duy nhất của BKT."""

    evidence_id: str
    student_id: str
    topic_id: str
    source: Literal["paper", "quiz"]
    observation_value: float = Field(ge=0, le=1)
    evidence_weight: float = Field(ge=0, le=1)
    occurred_at: datetime
    assessment_attempt_id: str | None = None
    question_id: str | None = None
    rubric_item_id: str | None = None
    teacher_confirmed: bool = False
    lineage: str = ""
    status: Literal["confirmed", "provisional", "superseded"] = "confirmed"


MasteryStatus = Literal["unknown", "uncertain", "learning", "confirmed_gap", "mastered"]


class StudentTopicKnowledgeState(BaseModel):
    """Spec mục 8.1 — trạng thái kiến thức chính thức của một cặp student-topic.

    `consistency` được phơi ra ngoài (ngoài danh sách trường của spec) vì
    Root-Cause Ranker và test cần soi từng thành phần của confidence.
    """

    student_id: str
    topic_id: str
    mastery_probability: float = Field(ge=0, le=1)
    confidence_score: float = Field(ge=0, le=1)
    consistency: float = Field(ge=0, le=1)
    evidence_count: int = Field(ge=0)
    effective_evidence: float = Field(ge=0)
    last_evidence_at: datetime | None = None
    mastery_status: MasteryStatus
    evidence_summary: dict[str, float] = Field(default_factory=dict)
    source_breakdown: dict[str, int] = Field(default_factory=dict)
    version: int = 1
