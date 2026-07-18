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
    # YCCĐ nguyên văn (Thông tư 32/2018) — nền cho hint first-principles, không bịa nội dung
    learning_outcomes: list[str] = Field(default_factory=list)


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


class LearningPathRequest(BaseModel):
    """Spec mục 8.2 — giáo viên đặt mục tiêu và ràng buộc; hệ thống tự tạo trong phạm vi đó."""

    class_id: str
    student_ids: list[str]
    target_topic_ids: list[str]
    teacher_id: str
    deadline: datetime | None = None
    estimated_minutes_per_student: int | None = None
    required_topic_ids: list[str] = Field(default_factory=list)
    excluded_topic_ids: list[str] = Field(default_factory=list)
    target_mastery_threshold: float = Field(default=0.80, ge=0, le=1)
    minimum_confidence_threshold: float = Field(default=0.40, ge=0, le=1)
    review_checkpoint: datetime | None = None


PathStepStatus = Literal["pending", "in_progress", "done", "content_unavailable"]
PathStatus = Literal["Draft", "Approved", "Active", "Paused", "Completed", "Superseded"]


class PathStep(BaseModel):
    """Spec mục 11 — một bước học: topic + mức hiện tại/cần đạt + lý do + điều kiện hoàn thành."""

    topic_id: str
    order: int
    current_mastery: float = Field(ge=0, le=1)
    current_confidence: float = Field(ge=0, le=1)
    target_mastery: float = Field(ge=0, le=1)
    minimum_confidence: float = Field(ge=0, le=1)
    gap_score: float = Field(ge=0)
    estimated_minutes: int = Field(ge=0)
    inclusion_reason: str
    completion_condition: str
    status: PathStepStatus = "pending"
    teacher_locked: bool = False


class PersonalizedLearningPath(BaseModel):
    """Spec mục 11 + trường trả về của ngoại lệ 'không đủ thời gian' (mục 15)."""

    path_id: str
    student_id: str
    class_id: str
    target_topic_ids: list[str]
    teacher_constraints: dict[str, object] = Field(default_factory=dict)
    diagnosis_summary: str = ""
    ordered_steps: list[PathStep] = Field(default_factory=list)
    deferred_steps: list[PathStep] = Field(default_factory=list)
    total_estimated_minutes: int = 0
    minimum_required_minutes: int = 0
    blocked_target_topics: list[str] = Field(default_factory=list)
    generated_at: datetime
    next_review_checkpoint: datetime | None = None
    status: PathStatus = "Draft"
    version: int = 1


InterventionKind = Literal["reteach_class", "small_group", "individual"]


class ClassWideGap(BaseModel):
    """Spec mục 13.1 — học sinh thiếu evidence không nằm trong mẫu số kết luận."""

    topic_id: str
    confirmed_gap_rate: float = Field(ge=0, le=1)
    class_gap_score: float = Field(ge=0)
    gap_student_ids: list[str] = Field(default_factory=list)
    denominator: int = Field(ge=0)
    recommended_intervention: InterventionKind


class InterventionGroup(BaseModel):
    """Spec mục 13 — nhóm theo root-cause + band + target + hình thức can thiệp."""

    group_key: str
    root_cause_topic_id: str
    mastery_band: str
    target_topic_id: str
    recommended_intervention: InterventionKind
    student_ids: list[str] = Field(default_factory=list)


class PrioritizedStudent(BaseModel):
    student_id: str
    help_priority: float = Field(ge=0)
    reason: str


class ClassLearningInsight(BaseModel):
    """Spec mục 13.3 — đầu ra dashboard giáo viên."""

    class_id: str
    target_topic_ids: list[str]
    class_mastery_distribution: dict[str, int] = Field(default_factory=dict)
    class_wide_gaps: list[ClassWideGap] = Field(default_factory=list)
    suggested_reteach_topics: list[str] = Field(default_factory=list)
    intervention_groups: list[InterventionGroup] = Field(default_factory=list)
    prioritized_students: list[PrioritizedStudent] = Field(default_factory=list)
    insufficient_evidence_students: list[str] = Field(default_factory=list)
    path_approval_summary: dict[str, int] = Field(default_factory=dict)
    changes_since_last_checkpoint: list[str] = Field(default_factory=list)


class SuggestedTopic(BaseModel):
    topic_id: str
    suggestion_score: float = Field(ge=0)
    confirmed_gap_rate: float = Field(ge=0, le=1)
    gap_student_ids: list[str] = Field(default_factory=list)


class SuggestedStudent(BaseModel):
    student_id: str
    help_priority: float = Field(ge=0)
    root_cause_topic_id: str
    reason: str
    blocked_target_count: int = Field(ge=0)


class LearningPathSuggestionRequest(BaseModel):
    class_id: str
    student_ids: list[str]
    teacher_id: str
    target_mastery_threshold: float = Field(default=0.80, ge=0, le=1)
    minimum_confidence_threshold: float = Field(default=0.40, ge=0, le=1)
    max_topics: int = Field(default=3, ge=1, le=3)
    max_students: int = Field(default=5, ge=1, le=5)


class LearningPathSuggestionResponse(BaseModel):
    class_id: str
    suggested_topics: list[SuggestedTopic] = Field(default_factory=list)
    suggested_students: list[SuggestedStudent] = Field(default_factory=list)
    insufficient_evidence_students: list[str] = Field(default_factory=list)
    preview_paths: dict[str, PersonalizedLearningPath] = Field(default_factory=dict)
    algorithm_version: str = "learning-path-suggestions-v1"
