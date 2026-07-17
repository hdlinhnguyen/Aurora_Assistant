from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


Score = Annotated[Decimal, Field(gt=0, max_digits=7, decimal_places=2)]


def score_text(value: Decimal | str) -> str:
    return str(Decimal(value).quantize(Decimal("0.01")))


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ExamCreate(StrictModel):
    title: str = Field(min_length=1, max_length=300)
    subject_id: str = Field(min_length=1, max_length=100)
    grade_level: int = Field(ge=1, le=12)
    duration_minutes: int = Field(gt=0, le=600)
    instructions: str = Field(default="", max_length=10_000)
    total_points: Score = Decimal("10.00")


class ExamPatch(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    duration_minutes: int | None = Field(default=None, gt=0, le=600)
    instructions: str | None = Field(default=None, max_length=10_000)
    total_points: Score | None = None
    expected_version: int = Field(ge=1)


class Choice(StrictModel):
    choice_id: str = Field(min_length=1, max_length=40)
    content: str = Field(min_length=1, max_length=2_000)


class AddBankQuestion(StrictModel):
    question_id: str = Field(min_length=1, max_length=200)
    points: Score
    expected_version: int = Field(ge=1)


class ManualQuestionCreate(StrictModel):
    question_type: Literal["single_choice", "essay"]
    content: str = Field(min_length=1, max_length=20_000)
    points: Score
    topic_ids: list[str] = Field(min_length=1, max_length=50)
    choices: list[Choice] = Field(default_factory=list, max_length=20)
    correct_choice_id: str | None = None
    expected_version: int = Field(ge=1)

    @field_validator("topic_ids")
    @classmethod
    def unique_topics(cls, value: list[str]) -> list[str]:
        if any(not item.strip() for item in value):
            raise ValueError("Topic IDs must not be blank")
        return list(dict.fromkeys(item.strip() for item in value))

    @model_validator(mode="after")
    def valid_answer_shape(self):
        if self.question_type == "essay":
            if self.choices or self.correct_choice_id is not None:
                raise ValueError("Essay questions cannot have choices")
            return self
        ids = [choice.choice_id for choice in self.choices]
        if len(ids) < 2 or len(ids) != len(set(ids)):
            raise ValueError("Single-choice questions need unique choices")
        if self.correct_choice_id not in ids:
            raise ValueError("Correct choice must exist")
        return self


class QuestionPatch(StrictModel):
    content: str | None = Field(default=None, min_length=1, max_length=20_000)
    points: Score | None = None
    topic_ids: list[str] | None = Field(default=None, min_length=1, max_length=50)
    choices: list[Choice] | None = Field(default=None, min_length=2, max_length=20)
    correct_choice_id: str | None = None
    expected_version: int = Field(ge=1)


class ReorderQuestions(StrictModel):
    exam_question_ids: list[str] = Field(min_length=1, max_length=200)
    expected_version: int = Field(ge=1)


class RubricItemCreate(StrictModel):
    description: str = Field(min_length=1, max_length=10_000)
    points: Score
    topic_ids: list[str] = Field(min_length=1, max_length=50)
    expected_version: int = Field(ge=1)


class RubricItemPatch(StrictModel):
    description: str | None = Field(default=None, min_length=1, max_length=10_000)
    points: Score | None = None
    topic_ids: list[str] | None = Field(default=None, min_length=1, max_length=50)
    expected_version: int = Field(ge=1)


class ReorderRubricItems(StrictModel):
    rubric_item_ids: list[str] = Field(min_length=1, max_length=200)
    expected_version: int = Field(ge=1)


class VersionRequest(StrictModel):
    expected_version: int = Field(ge=1)


class FirstSubmissionEvent(StrictModel):
    total_submissions: int = Field(gt=0, le=100_000)


class GradingCompletedEvent(StrictModel):
    total_submissions: int = Field(gt=0, le=100_000)
    graded_submissions: int = Field(ge=0, le=100_000)
    scored_submissions: int = Field(ge=0, le=100_000)


class DocxExportCreate(StrictModel):
    style: Literal["standard", "compact"] = "standard"
    include_answer_key: bool = True
    include_rubric: bool = True
    expected_version: int = Field(ge=1)
