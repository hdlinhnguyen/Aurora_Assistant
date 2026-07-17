from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ProcessingMode = Literal["ai_assisted", "partial_fallback", "full_manual"]
ReviewStatus = Literal["correct", "incorrect", "unanswered"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class QuestionInput(StrictModel):
    question_id: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=20_000)


class RubricItemInput(StrictModel):
    rubric_item_id: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10_000)
    topic_tags: list[str] = Field(default_factory=list, max_length=100)
    max_points: float = Field(default=0, ge=0, le=1000)


class SubmissionCreate(StrictModel):
    class_id: str = Field(min_length=1, max_length=200)
    student_id: str = Field(min_length=1, max_length=200)
    assessment_template_id: str = Field(min_length=1, max_length=200)
    question: QuestionInput
    rubric_items: list[RubricItemInput] = Field(min_length=1, max_length=200)
    processing_mode: Literal["ai_assisted", "full_manual"] = "full_manual"

    @field_validator("rubric_items")
    @classmethod
    def rubric_ids_are_unique(
        cls, value: list[RubricItemInput]
    ) -> list[RubricItemInput]:
        ids = [item.rubric_item_id for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError("rubric_item_id values must be unique")
        return value


class UploadCreate(StrictModel):
    file_name: str = Field(min_length=1, max_length=255)
    media_type: Literal["image/png", "image/jpeg", "image/webp", "application/pdf"]
    page_number: int = Field(ge=1, le=10_000)
    total_parts: int = Field(ge=1, le=10_000)
    checksum: str = Field(pattern=r"^[a-fA-F0-9]{64}$")


class ReviewUpdate(StrictModel):
    status: ReviewStatus
    evidence_block_ids: list[str] = Field(default_factory=list, max_length=500)


class OCRContentUpdate(StrictModel):
    content: str = Field(min_length=1, max_length=50_000)
