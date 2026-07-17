from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
)


TopicId = Annotated[str, StringConstraints(max_length=200)]


class Question(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    content: str
    subject_id: str
    grade_level: int
    question_type: str


class Topic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    subject_id: str
    grade_level: int


class RubricItem(BaseModel):
    id: str
    content: str
    position: int
    topic_ids: list[str]


class TaggingContext(BaseModel):
    question: Question
    rubric_items: list[RubricItem]
    available_topics: list[Topic]
    direct_topic_ids: list[str]
    effective_topics: list[Topic]
    version: int
    updated_by: str | None = None
    updated_at: datetime


class UpdateTopicsRequest(BaseModel):
    topic_ids: list[TopicId] = Field(default_factory=list, max_length=200)
    expected_version: int = Field(ge=1)
    updated_by: str = Field(min_length=1, max_length=120)

    @field_validator("topic_ids")
    @classmethod
    def normalize_topic_ids(cls, value: list[str]) -> list[str]:
        normalized = [topic_id.strip() for topic_id in value]
        if any(not topic_id for topic_id in normalized):
            raise ValueError("topic_ids must not contain blank values")
        return sorted(set(normalized))

    @field_validator("updated_by")
    @classmethod
    def normalize_updated_by(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("updated_by must not be blank")
        return normalized


class EffectiveQuestionTopicSet(BaseModel):
    question_id: str
    subject_id: str
    topic_ids: list[str]
    version: int
    updated_at: datetime
