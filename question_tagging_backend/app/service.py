from __future__ import annotations

import sqlite3
from datetime import UTC, datetime

from question_tagging_backend.app.database import Database
from question_tagging_backend.app.repositories import TaggingRepository
from question_tagging_backend.app.schemas import (
    EffectiveQuestionTopicSet,
    Question,
    RubricItem,
    TaggingContext,
    Topic,
    UpdateTopicsRequest,
)


class DomainError(Exception):
    def __init__(
        self, code: str, message: str, *, status_code: int, details: dict | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}


class VersionConflict(DomainError):
    def __init__(self, question_id: str, expected_version: int, current_version: int):
        super().__init__(
            "version_conflict",
            "Tagging data has changed. Reload the latest context before saving.",
            status_code=409,
            details={
                "expected_version": expected_version,
                "current_version": current_version,
            },
        )
        self.question_id = question_id


class TaggingService:
    def __init__(
        self, database: Database, repository: TaggingRepository | None = None
    ) -> None:
        self.database = database
        self.repository = repository or TaggingRepository()

    def list_questions(self) -> list[Question]:
        with self.database.read() as connection:
            return [
                Question.model_validate(dict(row))
                for row in self.repository.list_questions(connection)
            ]

    def get_context(self, question_id: str) -> TaggingContext:
        with self.database.read() as connection:
            return self._get_context(connection, question_id)

    def get_effective_topics(
        self, question_id: str
    ) -> EffectiveQuestionTopicSet:
        with self.database.read() as connection:
            question = self._require_question(connection, question_id)
            state = self._require_state(connection, question_id)
            topic_ids = self.repository.list_effective_topic_ids(
                connection, question_id, question["question_type"]
            )
            return EffectiveQuestionTopicSet(
                question_id=question_id,
                subject_id=question["subject_id"],
                topic_ids=topic_ids,
                version=state["version"],
                updated_at=state["updated_at"],
            )

    def set_question_topics(
        self, question_id: str, request: UpdateTopicsRequest
    ) -> TaggingContext:
        with self.database.transaction() as connection:
            question = self._require_question(connection, question_id)
            self._require_expected_version(
                connection, question_id, request.expected_version
            )
            self._validate_topics(connection, request.topic_ids, question["subject_id"])
            now = datetime.now(UTC).isoformat()
            self.repository.replace_question_topics(
                connection,
                question_id,
                request.topic_ids,
                request.updated_by,
                now,
            )
            self._advance_version(connection, question_id, request, now)
            return self._get_context(connection, question_id)

    def set_rubric_item_topics(
        self,
        question_id: str,
        rubric_item_id: str,
        request: UpdateTopicsRequest,
    ) -> TaggingContext:
        with self.database.transaction() as connection:
            question = self._require_question(connection, question_id)
            rubric_item = self.repository.get_rubric_item(connection, rubric_item_id)
            if rubric_item is None:
                raise DomainError(
                    "rubric_item_not_found",
                    f"Rubric item '{rubric_item_id}' does not exist.",
                    status_code=404,
                )
            if (
                rubric_item["question_id"] != question_id
                or question["question_type"] != "essay"
            ):
                raise DomainError(
                    "rubric_item_mismatch",
                    "Rubric item does not belong to the edited essay question.",
                    status_code=422,
                )
            self._require_expected_version(
                connection, question_id, request.expected_version
            )
            self._validate_topics(connection, request.topic_ids, question["subject_id"])
            now = datetime.now(UTC).isoformat()
            self.repository.replace_rubric_item_topics(
                connection,
                rubric_item_id,
                request.topic_ids,
                request.updated_by,
                now,
            )
            self._advance_version(connection, question_id, request, now)
            return self._get_context(connection, question_id)

    def _get_context(
        self, connection: sqlite3.Connection, question_id: str
    ) -> TaggingContext:
        question_row = self._require_question(connection, question_id)
        state = self._require_state(connection, question_id)
        rubric_rows = self.repository.list_rubric_items(connection, question_id)
        available_topic_rows = self.repository.list_topics_for_subject(
            connection, question_row["subject_id"]
        )
        effective_ids = self.repository.list_effective_topic_ids(
            connection, question_id, question_row["question_type"]
        )
        effective_rows = self.repository.get_topics(connection, effective_ids)

        return TaggingContext(
            question=Question.model_validate(dict(question_row)),
            rubric_items=[
                RubricItem(
                    id=row["id"],
                    content=row["content"],
                    position=row["position"],
                    topic_ids=self.repository.list_rubric_topic_ids(
                        connection, row["id"]
                    ),
                )
                for row in rubric_rows
            ],
            available_topics=[
                Topic.model_validate(dict(row)) for row in available_topic_rows
            ],
            direct_topic_ids=self.repository.list_direct_topic_ids(
                connection, question_id
            ),
            effective_topics=[
                Topic.model_validate(dict(row)) for row in effective_rows
            ],
            version=state["version"],
            updated_by=state["updated_by"],
            updated_at=state["updated_at"],
        )

    def _require_question(
        self, connection: sqlite3.Connection, question_id: str
    ) -> sqlite3.Row:
        question = self.repository.get_question(connection, question_id)
        if question is None:
            raise DomainError(
                "question_not_found",
                f"Question '{question_id}' does not exist.",
                status_code=404,
            )
        return question

    def _require_state(
        self, connection: sqlite3.Connection, question_id: str
    ) -> sqlite3.Row:
        state = self.repository.get_state(connection, question_id)
        if state is None:
            raise DomainError(
                "tagging_state_not_found",
                f"Question '{question_id}' has no tagging state.",
                status_code=500,
            )
        return state

    def _require_expected_version(
        self,
        connection: sqlite3.Connection,
        question_id: str,
        expected_version: int,
    ) -> None:
        state = self._require_state(connection, question_id)
        if state["version"] != expected_version:
            raise VersionConflict(question_id, expected_version, state["version"])

    def _validate_topics(
        self,
        connection: sqlite3.Connection,
        topic_ids: list[str],
        subject_id: str,
    ) -> None:
        topics = self.repository.get_topics(connection, topic_ids)
        found_ids = {row["id"] for row in topics}
        missing = sorted(set(topic_ids) - found_ids)
        if missing:
            raise DomainError(
                "topic_not_found",
                "One or more topics do not exist.",
                status_code=422,
                details={"topic_ids": missing},
            )
        mismatched = sorted(
            row["id"] for row in topics if row["subject_id"] != subject_id
        )
        if mismatched:
            raise DomainError(
                "topic_subject_mismatch",
                "Every topic must belong to the same subject as the question.",
                status_code=422,
                details={"topic_ids": mismatched, "expected_subject_id": subject_id},
            )

    def _advance_version(
        self,
        connection: sqlite3.Connection,
        question_id: str,
        request: UpdateTopicsRequest,
        updated_at: str,
    ) -> None:
        advanced = self.repository.advance_version(
            connection,
            question_id,
            request.expected_version,
            request.updated_by,
            updated_at,
        )
        if not advanced:
            state = self._require_state(connection, question_id)
            raise VersionConflict(
                question_id, request.expected_version, state["version"]
            )
