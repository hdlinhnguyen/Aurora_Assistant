"""Deterministic BKT calculation contract for persisted mastery profiles."""

from __future__ import annotations

from datetime import datetime
from time import perf_counter

from pydantic import BaseModel, Field, model_validator

from learning_path.bkt import BKTParams, ConfidenceConfig, knowledge_state
from learning_path.evidence import EvidenceStore, calibrate_paper, calibrate_quiz
from learning_path.schemas import (
    RawPaperEvidence,
    RawQuizEvidence,
    StudentTopicKnowledgeState,
)
from learning_path.telemetry import mastery_metadata


class MasteryCalculationBody(BaseModel):
    student_id: str
    topic_ids: list[str]
    raw_quiz: list[RawQuizEvidence] = Field(default_factory=list)
    raw_paper: list[RawPaperEvidence] = Field(default_factory=list)
    as_of: datetime

    @model_validator(mode="after")
    def evidence_belongs_to_student(self) -> "MasteryCalculationBody":
        evidence = [*self.raw_quiz, *self.raw_paper]
        if any(item.student_id != self.student_id for item in evidence):
            raise ValueError("all evidence must belong to student_id")
        return self


class MasteryCalculationResponse(BaseModel):
    student_id: str
    calculated_at: datetime
    states: dict[str, StudentTopicKnowledgeState]
    decision_metadata: dict[str, object]


def calculate_mastery(body: MasteryCalculationBody) -> MasteryCalculationResponse:
    started = perf_counter()
    store = EvidenceStore()
    calibrated = [calibrate_quiz(item, as_of=body.as_of) for item in body.raw_quiz]
    calibrated.extend(calibrate_paper(item, as_of=body.as_of) for item in body.raw_paper)
    store.ingest(calibrated)

    params = BKTParams()
    config = ConfidenceConfig()
    states = {
        topic_id: knowledge_state(
            body.student_id,
            topic_id,
            store.active_for(body.student_id, topic_id),
            params=params,
            config=config,
        )
        for topic_id in dict.fromkeys(body.topic_ids)
    }
    return MasteryCalculationResponse(
        student_id=body.student_id,
        calculated_at=body.as_of,
        states=states,
        decision_metadata=mastery_metadata(
            len(states), len(calibrated), round((perf_counter() - started) * 1000),
        ),
    )
