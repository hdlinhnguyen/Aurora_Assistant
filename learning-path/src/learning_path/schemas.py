"""Pydantic models — hợp đồng dữ liệu theo spec 2026-07-17-personalized-learning-path-design.md.

Tên trường giữ nguyên snake_case đúng như spec (mục 5, 8, 11, 13.3) để đội đối chiếu
spec ↔ code trong vài giây. Model được bổ sung dần theo từng module (TDD).
"""

from __future__ import annotations

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
