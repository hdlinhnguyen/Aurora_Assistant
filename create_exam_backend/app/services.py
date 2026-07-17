from __future__ import annotations

from datetime import datetime, timezone
import json
from decimal import Decimal
from pathlib import Path
import re
import unicodedata
from typing import Any
from uuid import uuid4

from .database import Database
from .errors import DomainError
from .exporter import DocumentExporter
from .repositories import ExamRepository, QuestionBankRepository
from .schemas import (
    AddBankQuestion,
    DocxExportCreate,
    ExamCreate,
    ExamPatch,
    ManualQuestionCreate,
    ReorderQuestions,
    ReorderRubricItems,
    RubricItemCreate,
    RubricItemPatch,
    QuestionPatch,
    FirstSubmissionEvent,
    GradingCompletedEvent,
    VersionRequest,
    score_text,
)


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


class ExamService:
    def __init__(self, database: Database, export_dir: Path | None = None):
        self.database = database
        self.repository = ExamRepository()
        self.question_bank = QuestionBankRepository()
        self.export_dir = export_dir or Path("create_exam_backend/data/exports")
        self.exporter = DocumentExporter()

    def _audit(
        self,
        connection,
        exam_id: str,
        action: str,
        actor: str,
        new_value: dict[str, Any] | None = None,
    ) -> None:
        connection.execute(
            """INSERT INTO audit_logs
               (audit_id, exam_id, action, actor_id, previous_value_json,
                new_value_json, occurred_at)
               VALUES (?, ?, ?, ?, NULL, ?, ?)""",
            (
                str(uuid4()),
                exam_id,
                action,
                actor,
                json.dumps(new_value, ensure_ascii=False, sort_keys=True)
                if new_value is not None
                else None,
                utcnow(),
            ),
        )

    def create(self, actor: str, payload: ExamCreate) -> dict[str, Any]:
        now = utcnow()
        exam_id = str(uuid4())
        with self.database.transaction() as connection:
            connection.execute(
                "INSERT OR IGNORE INTO teachers VALUES (?, ?)",
                (actor, actor),
            )
            connection.execute(
                """INSERT INTO exams
                   (exam_id, title, subject_id, grade_level, duration_minutes,
                    instructions, total_points, status, version, created_by,
                    created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'drafting', 1, ?, ?, ?)""",
                (
                    exam_id,
                    payload.title.strip(),
                    payload.subject_id,
                    payload.grade_level,
                    payload.duration_minutes,
                    payload.instructions,
                    score_text(payload.total_points),
                    actor,
                    now,
                    now,
                ),
            )
            exam = self.repository.get_owned_exam(connection, exam_id, actor)
            assert exam is not None
            self._audit(
                connection,
                exam_id,
                "exam_created",
                actor,
                {"version": 1, "status": "drafting"},
            )
            return self.repository.detail(connection, exam)

    def get(self, actor: str, exam_id: str) -> dict[str, Any]:
        with self.database.connect() as connection:
            exam = self.repository.get_owned_exam(connection, exam_id, actor)
            if not exam:
                raise DomainError(404, "exam_not_found", "Exam not found")
            return self.repository.detail(connection, exam)

    def list(self, actor: str, status: str | None, search: str | None):
        sql = "SELECT * FROM exams WHERE created_by = ?"
        params: list[Any] = [actor]
        if status:
            sql += " AND status = ?"
            params.append(status)
        if search:
            sql += " AND lower(title) LIKE ?"
            params.append(f"%{search.lower()}%")
        sql += " ORDER BY updated_at DESC"
        with self.database.connect() as connection:
            return [
                self.repository.detail(connection, dict(row))
                for row in connection.execute(sql, params).fetchall()
            ]

    def audit(self, actor: str, exam_id: str) -> list[dict[str, Any]]:
        with self.database.connect() as connection:
            if not self.repository.get_owned_exam(connection, exam_id, actor):
                raise DomainError(404, "exam_not_found", "Exam not found")
            rows = [
                dict(row)
                for row in connection.execute(
                    """SELECT audit_id, action, actor_id, new_value_json,
                              occurred_at
                       FROM audit_logs WHERE exam_id = ? ORDER BY occurred_at""",
                    (exam_id,),
                )
            ]
        for row in rows:
            raw_new_value = row.pop("new_value_json")
            row["new_value"] = json.loads(raw_new_value) if raw_new_value else None
        return rows

    def delete_exam(self, actor: str, exam_id: str, expected_version: int) -> None:
        file_paths: list[Path] = []
        with self.database.transaction(immediate=True) as connection:
            exam = self._mutable(connection, actor, exam_id, expected_version)
            if exam["status"] != "drafting":
                raise DomainError(
                    409, "invalid_transition", "Only draft exams can be deleted"
                )
            file_paths = [
                Path(row["file_path"])
                for row in connection.execute(
                    "SELECT file_path FROM exports WHERE exam_id = ?", (exam_id,)
                )
            ]
            connection.execute("DELETE FROM exports WHERE exam_id = ?", (exam_id,))
            connection.execute(
                "DELETE FROM exam_snapshots WHERE exam_id = ?", (exam_id,)
            )
            connection.execute(
                "DELETE FROM grading_progress WHERE exam_id = ?", (exam_id,)
            )
            connection.execute(
                "DELETE FROM internal_events WHERE exam_id = ?", (exam_id,)
            )
            connection.execute("DELETE FROM audit_logs WHERE exam_id = ?", (exam_id,))
            connection.execute("DELETE FROM exams WHERE exam_id = ?", (exam_id,))
        export_root = self.export_dir.resolve()
        for path in file_paths:
            resolved = path.resolve()
            if resolved.is_relative_to(export_root):
                resolved.unlink(missing_ok=True)
                try:
                    resolved.parent.rmdir()
                except OSError:
                    pass

    def _mutable(
        self, connection, actor: str, exam_id: str, expected_version: int
    ) -> dict[str, Any]:
        exam = self.repository.get_owned_exam(connection, exam_id, actor)
        if not exam:
            raise DomainError(404, "exam_not_found", "Exam not found")
        if exam["first_submission_received_at"] or exam["status"] == "done":
            raise DomainError(409, "exam_locked", "Exam is locked")
        if exam["version"] != expected_version:
            raise DomainError(
                409,
                "version_conflict",
                "Exam was changed by another request",
                {"current_version": exam["version"]},
            )
        return exam

    def patch(self, actor: str, exam_id: str, payload: ExamPatch) -> dict[str, Any]:
        with self.database.transaction(immediate=True) as connection:
            self._mutable(connection, actor, exam_id, payload.expected_version)
            changes = payload.model_dump(
                exclude={"expected_version"}, exclude_none=True
            )
            if "total_points" in changes:
                changes["total_points"] = score_text(changes["total_points"])
            for field, value in changes.items():
                connection.execute(
                    f"UPDATE exams SET {field} = ? WHERE exam_id = ?",
                    (value, exam_id),
                )
            connection.execute(
                "UPDATE exams SET version = version + 1, updated_at = ? WHERE exam_id = ?",
                (utcnow(), exam_id),
            )
            current = self.repository.get_owned_exam(connection, exam_id, actor)
            assert current is not None
            return self.repository.detail(connection, current)

    def list_bank(
        self,
        subject_id: str | None,
        grade_level: int | None,
        question_type: str | None,
        topic_id: str | None,
        search: str | None,
    ) -> list[dict[str, Any]]:
        with self.database.connect() as connection:
            return self.question_bank.list_questions(
                connection,
                subject_id,
                grade_level,
                question_type,
                topic_id,
                search,
            )

    def get_bank_question(self, question_id: str) -> dict[str, Any]:
        with self.database.connect() as connection:
            question = self.question_bank.get_question(connection, question_id)
        if not question:
            raise DomainError(404, "question_not_found", "Question not found")
        return question

    def list_topics(
        self, subject_id: str | None, grade_level: int | None
    ) -> list[dict[str, Any]]:
        with self.database.connect() as connection:
            return self.question_bank.list_topics(connection, subject_id, grade_level)

    def _validate_topics(
        self, connection, exam: dict[str, Any], topic_ids: list[str]
    ) -> None:
        placeholders = ",".join("?" for _ in topic_ids)
        rows = connection.execute(
            f"""SELECT topic_id FROM topics
                WHERE topic_id IN ({placeholders})
                  AND subject_id = ? AND grade_level = ?""",
            (*topic_ids, exam["subject_id"], exam["grade_level"]),
        ).fetchall()
        if {row["topic_id"] for row in rows} != set(topic_ids):
            raise DomainError(
                422,
                "topic_not_allowed",
                "Topic must match the exam subject and grade",
            )

    def _bump(self, connection, exam_id: str) -> int:
        connection.execute(
            "UPDATE exams SET version = version + 1, updated_at = ? WHERE exam_id = ?",
            (utcnow(), exam_id),
        )
        return connection.execute(
            "SELECT version FROM exams WHERE exam_id = ?", (exam_id,)
        ).fetchone()["version"]

    def add_bank_question(
        self, actor: str, exam_id: str, payload: AddBankQuestion
    ) -> dict[str, Any]:
        with self.database.transaction(immediate=True) as connection:
            exam = self._mutable(connection, actor, exam_id, payload.expected_version)
            bank = connection.execute(
                "SELECT * FROM question_bank_questions WHERE question_id = ?",
                (payload.question_id,),
            ).fetchone()
            if not bank:
                raise DomainError(404, "question_not_found", "Question not found")
            if (
                bank["subject_id"] != exam["subject_id"]
                or bank["grade_level"] != exam["grade_level"]
            ):
                raise DomainError(
                    422, "question_not_allowed", "Question does not match exam"
                )
            question_id = str(uuid4())
            position = (
                connection.execute(
                    "SELECT COUNT(*) FROM exam_questions WHERE exam_id = ?",
                    (exam_id,),
                ).fetchone()[0]
                + 1
            )
            connection.execute(
                """INSERT INTO exam_questions VALUES
                   (?, ?, 'question_bank', ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    question_id,
                    exam_id,
                    bank["question_id"],
                    bank["question_type"],
                    bank["content"],
                    score_text(payload.points),
                    position,
                    bank["choices_json"],
                    bank["correct_choice_id"],
                    bank["topic_ids_json"],
                ),
            )
            for index, rubric in enumerate(json.loads(bank["rubric_json"]), start=1):
                connection.execute(
                    "INSERT INTO rubric_items VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        str(uuid4()),
                        question_id,
                        rubric["description"],
                        rubric["points"],
                        index,
                        json.dumps(rubric["topic_ids"]),
                    ),
                )
            version = self._bump(connection, exam_id)
            detail = self.repository.detail(
                connection,
                self.repository.get_owned_exam(connection, exam_id, actor),
            )
            result = next(
                q for q in detail["questions"] if q["exam_question_id"] == question_id
            )
            return {**result, "exam_version": version}

    def add_manual_question(
        self, actor: str, exam_id: str, payload: ManualQuestionCreate
    ) -> dict[str, Any]:
        with self.database.transaction(immediate=True) as connection:
            exam = self._mutable(connection, actor, exam_id, payload.expected_version)
            self._validate_topics(connection, exam, payload.topic_ids)
            question_id = str(uuid4())
            position = (
                connection.execute(
                    "SELECT COUNT(*) FROM exam_questions WHERE exam_id = ?",
                    (exam_id,),
                ).fetchone()[0]
                + 1
            )
            connection.execute(
                """INSERT INTO exam_questions VALUES
                   (?, ?, 'manual', NULL, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    question_id,
                    exam_id,
                    payload.question_type,
                    payload.content.strip(),
                    score_text(payload.points),
                    position,
                    json.dumps(
                        [choice.model_dump() for choice in payload.choices],
                        ensure_ascii=False,
                    ),
                    payload.correct_choice_id,
                    json.dumps(payload.topic_ids),
                ),
            )
            version = self._bump(connection, exam_id)
            detail = self.repository.detail(
                connection,
                self.repository.get_owned_exam(connection, exam_id, actor),
            )
            result = next(
                q for q in detail["questions"] if q["exam_question_id"] == question_id
            )
            return {**result, "exam_version": version}

    def reorder_questions(
        self, actor: str, exam_id: str, payload: ReorderQuestions
    ) -> dict[str, Any]:
        with self.database.transaction(immediate=True) as connection:
            self._mutable(connection, actor, exam_id, payload.expected_version)
            current = [
                row["exam_question_id"]
                for row in connection.execute(
                    "SELECT exam_question_id FROM exam_questions WHERE exam_id = ?",
                    (exam_id,),
                )
            ]
            requested = payload.exam_question_ids
            if len(requested) != len(set(requested)) or set(requested) != set(current):
                raise DomainError(
                    422,
                    "invalid_reorder",
                    "Reorder list must contain every question exactly once",
                )
            connection.execute(
                "UPDATE exam_questions SET position = -position WHERE exam_id = ?",
                (exam_id,),
            )
            for position, question_id in enumerate(requested, start=1):
                connection.execute(
                    "UPDATE exam_questions SET position = ? WHERE exam_question_id = ?",
                    (position, question_id),
                )
            self._bump(connection, exam_id)
            self._audit(
                connection,
                exam_id,
                "questions_reordered",
                actor,
                {"exam_question_ids": requested},
            )
            current_exam = self.repository.get_owned_exam(connection, exam_id, actor)
            assert current_exam is not None
            return self.repository.detail(connection, current_exam)

    def add_rubric(
        self,
        actor: str,
        exam_id: str,
        question_id: str,
        payload: RubricItemCreate,
    ) -> dict[str, Any]:
        with self.database.transaction(immediate=True) as connection:
            exam = self._mutable(connection, actor, exam_id, payload.expected_version)
            question = connection.execute(
                """SELECT * FROM exam_questions
                   WHERE exam_question_id = ? AND exam_id = ?""",
                (question_id, exam_id),
            ).fetchone()
            if not question:
                raise DomainError(404, "question_not_found", "Question not found")
            if question["question_type"] != "essay":
                raise DomainError(
                    409, "rubric_not_allowed", "Only essays can have rubrics"
                )
            self._validate_topics(connection, exam, payload.topic_ids)
            rubric_id = str(uuid4())
            position = (
                connection.execute(
                    "SELECT COUNT(*) FROM rubric_items WHERE exam_question_id = ?",
                    (question_id,),
                ).fetchone()[0]
                + 1
            )
            connection.execute(
                "INSERT INTO rubric_items VALUES (?, ?, ?, ?, ?, ?)",
                (
                    rubric_id,
                    question_id,
                    payload.description.strip(),
                    score_text(payload.points),
                    position,
                    json.dumps(payload.topic_ids),
                ),
            )
            version = self._bump(connection, exam_id)
            return {
                "rubric_item_id": rubric_id,
                "exam_question_id": question_id,
                "description": payload.description.strip(),
                "points": score_text(payload.points),
                "position": position,
                "topic_ids": payload.topic_ids,
                "exam_version": version,
            }

    def patch_question(
        self,
        actor: str,
        exam_id: str,
        question_id: str,
        payload: QuestionPatch,
    ) -> dict[str, Any]:
        with self.database.transaction(immediate=True) as connection:
            exam = self._mutable(connection, actor, exam_id, payload.expected_version)
            row = connection.execute(
                "SELECT * FROM exam_questions WHERE exam_id = ? AND exam_question_id = ?",
                (exam_id, question_id),
            ).fetchone()
            if not row:
                raise DomainError(404, "question_not_found", "Question not found")
            changes = payload.model_dump(
                exclude={"expected_version"}, exclude_none=True
            )
            if "topic_ids" in changes:
                if row["source_type"] == "question_bank":
                    raise DomainError(
                        409,
                        "bank_topics_immutable",
                        "Bank question topics cannot be edited",
                    )
                self._validate_topics(connection, exam, changes["topic_ids"])
                changes["topic_ids_json"] = json.dumps(changes.pop("topic_ids"))
            if "points" in changes:
                changes["points"] = score_text(changes["points"])
            if "choices" in changes:
                choices = [
                    item.model_dump() if hasattr(item, "model_dump") else item
                    for item in changes.pop("choices")
                ]
                changes["choices_json"] = json.dumps(choices, ensure_ascii=False)
            if row["question_type"] == "essay" and (
                "choices" in payload.model_fields_set
                or "correct_choice_id" in payload.model_fields_set
            ):
                raise DomainError(
                    422,
                    "essay_choices_not_allowed",
                    "Essay questions cannot have choices or a correct choice",
                )
            if row["question_type"] == "single_choice":
                final_choices = json.loads(
                    changes.get("choices_json", row["choices_json"])
                )
                final_correct = changes.get(
                    "correct_choice_id", row["correct_choice_id"]
                )
                choice_ids = [choice["choice_id"] for choice in final_choices]
                if (
                    len(choice_ids) < 2
                    or len(choice_ids) != len(set(choice_ids))
                    or final_correct not in choice_ids
                ):
                    raise DomainError(
                        422,
                        "invalid_choice_set",
                        "Single-choice answers are invalid",
                    )
            for field, value in changes.items():
                connection.execute(
                    f"UPDATE exam_questions SET {field} = ? WHERE exam_question_id = ?",
                    (value, question_id),
                )
            version = self._bump(connection, exam_id)
            detail = self.repository.detail(
                connection,
                self.repository.get_owned_exam(connection, exam_id, actor),
            )
            question = next(
                item
                for item in detail["questions"]
                if item["exam_question_id"] == question_id
            )
            return {**question, "exam_version": version}

    def delete_question(
        self,
        actor: str,
        exam_id: str,
        question_id: str,
        expected_version: int,
    ) -> None:
        with self.database.transaction(immediate=True) as connection:
            self._mutable(connection, actor, exam_id, expected_version)
            deleted = connection.execute(
                "DELETE FROM exam_questions WHERE exam_id = ? AND exam_question_id = ?",
                (exam_id, question_id),
            ).rowcount
            if not deleted:
                raise DomainError(404, "question_not_found", "Question not found")
            rows = connection.execute(
                "SELECT exam_question_id FROM exam_questions WHERE exam_id = ? ORDER BY position",
                (exam_id,),
            ).fetchall()
            connection.execute(
                "UPDATE exam_questions SET position = -position WHERE exam_id = ?",
                (exam_id,),
            )
            for index, row in enumerate(rows, start=1):
                connection.execute(
                    "UPDATE exam_questions SET position = ? WHERE exam_question_id = ?",
                    (index, row["exam_question_id"]),
                )
            self._bump(connection, exam_id)

    def reorder_rubrics(
        self,
        actor: str,
        exam_id: str,
        question_id: str,
        payload: ReorderRubricItems,
    ) -> dict[str, Any]:
        with self.database.transaction(immediate=True) as connection:
            self._mutable(connection, actor, exam_id, payload.expected_version)
            current = [
                row["rubric_item_id"]
                for row in connection.execute(
                    """SELECT rubric_item_id FROM rubric_items
                       WHERE exam_question_id = ?""",
                    (question_id,),
                )
            ]
            requested = payload.rubric_item_ids
            if len(requested) != len(set(requested)) or set(requested) != set(current):
                raise DomainError(
                    422,
                    "invalid_reorder",
                    "Reorder list must contain every rubric item exactly once",
                )
            connection.execute(
                "UPDATE rubric_items SET position = -position WHERE exam_question_id = ?",
                (question_id,),
            )
            for index, rubric_id in enumerate(requested, start=1):
                connection.execute(
                    "UPDATE rubric_items SET position = ? WHERE rubric_item_id = ?",
                    (index, rubric_id),
                )
            version = self._bump(connection, exam_id)
            detail = self.repository.detail(
                connection,
                self.repository.get_owned_exam(connection, exam_id, actor),
            )
            question = next(
                item
                for item in detail["questions"]
                if item["exam_question_id"] == question_id
            )
            return {**question, "exam_version": version}

    def delete_rubric(
        self,
        actor: str,
        exam_id: str,
        question_id: str,
        rubric_id: str,
        expected_version: int,
    ) -> None:
        with self.database.transaction(immediate=True) as connection:
            self._mutable(connection, actor, exam_id, expected_version)
            deleted = connection.execute(
                """DELETE FROM rubric_items
                   WHERE rubric_item_id = ? AND exam_question_id = ?
                     AND EXISTS (
                       SELECT 1 FROM exam_questions
                       WHERE exam_question_id = ? AND exam_id = ?
                     )""",
                (rubric_id, question_id, question_id, exam_id),
            ).rowcount
            if not deleted:
                raise DomainError(404, "rubric_not_found", "Rubric not found")
            rows = connection.execute(
                """SELECT rubric_item_id FROM rubric_items
                   WHERE exam_question_id = ? ORDER BY position""",
                (question_id,),
            ).fetchall()
            connection.execute(
                "UPDATE rubric_items SET position = -position WHERE exam_question_id = ?",
                (question_id,),
            )
            for index, row in enumerate(rows, start=1):
                connection.execute(
                    "UPDATE rubric_items SET position = ? WHERE rubric_item_id = ?",
                    (index, row["rubric_item_id"]),
                )
            self._bump(connection, exam_id)

    def patch_rubric(
        self,
        actor: str,
        exam_id: str,
        question_id: str,
        rubric_id: str,
        payload: RubricItemPatch,
    ) -> dict[str, Any]:
        with self.database.transaction(immediate=True) as connection:
            exam = self._mutable(connection, actor, exam_id, payload.expected_version)
            row = connection.execute(
                """SELECT r.* FROM rubric_items r
                   JOIN exam_questions q
                     ON q.exam_question_id = r.exam_question_id
                   WHERE r.rubric_item_id = ? AND r.exam_question_id = ?
                     AND q.exam_id = ?""",
                (rubric_id, question_id, exam_id),
            ).fetchone()
            if not row:
                raise DomainError(404, "rubric_not_found", "Rubric not found")
            changes = payload.model_dump(
                exclude={"expected_version"}, exclude_none=True
            )
            if "topic_ids" in changes:
                self._validate_topics(connection, exam, changes["topic_ids"])
                changes["topic_ids_json"] = json.dumps(changes.pop("topic_ids"))
            if "points" in changes:
                changes["points"] = score_text(changes["points"])
            for field, value in changes.items():
                connection.execute(
                    f"UPDATE rubric_items SET {field} = ? WHERE rubric_item_id = ?",
                    (value, rubric_id),
                )
            version = self._bump(connection, exam_id)
            updated = dict(
                connection.execute(
                    "SELECT * FROM rubric_items WHERE rubric_item_id = ?",
                    (rubric_id,),
                ).fetchone()
            )
            updated["topic_ids"] = json.loads(updated.pop("topic_ids_json"))
            return {**updated, "exam_version": version}

    def _validation_errors(self, detail: dict[str, Any]) -> list[dict[str, Any]]:
        errors: list[dict[str, Any]] = []
        questions = detail["questions"]
        if not questions:
            errors.append(
                {
                    "code": "exam_empty",
                    "message": "Đề phải có ít nhất một câu.",
                    "field": "questions",
                }
            )
        actual = sum(
            (Decimal(question["points"]) for question in questions),
            Decimal("0"),
        )
        expected = Decimal(detail["total_points"])
        if actual != expected:
            errors.append(
                {
                    "code": "score_mismatch",
                    "message": "Tổng điểm các câu phải bằng thang điểm của đề.",
                    "field": "total_points",
                    "expected": score_text(expected),
                    "actual": score_text(actual),
                }
            )
        for question in questions:
            if not question["topic_ids"]:
                errors.append(
                    {
                        "code": "topic_required",
                        "message": "Câu hỏi phải có topic.",
                        "field": "topic_ids",
                        "exam_question_id": question["exam_question_id"],
                    }
                )
            if question["question_type"] == "single_choice":
                choice_ids = [choice["choice_id"] for choice in question["choices"]]
                if (
                    len(choice_ids) < 2
                    or len(choice_ids) != len(set(choice_ids))
                    or question["correct_choice_id"] not in choice_ids
                ):
                    errors.append(
                        {
                            "code": "invalid_choice_set",
                            "message": "Câu trắc nghiệm chưa có đáp án hợp lệ.",
                            "field": "choices",
                            "exam_question_id": question["exam_question_id"],
                        }
                    )
            else:
                rubrics = question["rubric_items"]
                if not rubrics:
                    errors.append(
                        {
                            "code": "rubric_incomplete",
                            "message": "Câu tự luận phải có barem.",
                            "field": "rubric_items",
                            "exam_question_id": question["exam_question_id"],
                        }
                    )
                elif sum(
                    (Decimal(item["points"]) for item in rubrics), Decimal("0")
                ) != Decimal(question["points"]):
                    errors.append(
                        {
                            "code": "rubric_score_mismatch",
                            "message": "Tổng điểm barem phải bằng điểm câu.",
                            "field": "rubric_items",
                            "exam_question_id": question["exam_question_id"],
                        }
                    )
                for item in rubrics:
                    if not item["topic_ids"]:
                        errors.append(
                            {
                                "code": "topic_required",
                                "message": "Mỗi ý barem phải có topic.",
                                "field": "topic_ids",
                                "rubric_item_id": item["rubric_item_id"],
                            }
                        )
        return errors

    def validate(self, actor: str, exam_id: str) -> dict[str, Any]:
        detail = self.get(actor, exam_id)
        errors = self._validation_errors(detail)
        return {"valid": not errors, "errors": errors}

    def transition(
        self,
        actor: str,
        exam_id: str,
        payload: VersionRequest,
        target: str,
    ) -> dict[str, Any]:
        with self.database.transaction(immediate=True) as connection:
            exam = self._mutable(connection, actor, exam_id, payload.expected_version)
            if target == "preparing_exam":
                if exam["status"] != "drafting":
                    raise DomainError(
                        409, "invalid_transition", "Cannot prepare this exam"
                    )
                detail = self.repository.detail(connection, exam)
                errors = self._validation_errors(detail)
                if errors:
                    raise DomainError(
                        409,
                        "exam_invalid",
                        "Exam must be valid before preparing",
                        {"errors": errors},
                    )
            elif exam["status"] != "preparing_exam":
                raise DomainError(409, "invalid_transition", "Exam is not preparing")
            connection.execute(
                """UPDATE exams SET status = ?, version = version + 1,
                   updated_at = ? WHERE exam_id = ?""",
                (target, utcnow(), exam_id),
            )
            self._audit(
                connection,
                exam_id,
                "exam_prepared" if target == "preparing_exam" else "returned_to_draft",
                actor,
                {"status": target},
            )
            current = self.repository.get_owned_exam(connection, exam_id, actor)
            assert current is not None
            return self.repository.detail(connection, current)

    def _internal_event(
        self,
        exam_id: str,
        event_type: str,
        idempotency_key: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        with self.database.transaction(immediate=True) as connection:
            existing = connection.execute(
                """SELECT exam_id, payload_json, result_json FROM internal_events
                   WHERE event_type = ? AND idempotency_key = ?""",
                (event_type, idempotency_key),
            ).fetchone()
            if existing:
                if (
                    existing["exam_id"] != exam_id
                    or existing["payload_json"] != canonical
                ):
                    raise DomainError(
                        409,
                        "idempotency_conflict",
                        "Idempotency key was used with another payload",
                    )
                return json.loads(existing["result_json"])
            exam_row = connection.execute(
                "SELECT * FROM exams WHERE exam_id = ?", (exam_id,)
            ).fetchone()
            if not exam_row:
                raise DomainError(404, "exam_not_found", "Exam not found")
            exam = dict(exam_row)
            now = utcnow()
            if event_type == "first_submission":
                if exam["locked_snapshot_id"]:
                    raise DomainError(409, "exam_locked", "Exam is already locked")
                if exam["status"] != "preparing_exam":
                    raise DomainError(
                        409,
                        "invalid_transition",
                        "Exam must be preparing before submissions",
                    )
                detail = self.repository.detail(connection, exam)
                errors = self._validation_errors(detail)
                if errors:
                    raise DomainError(
                        409, "exam_invalid", "Exam is invalid", {"errors": errors}
                    )
                snapshot_id = str(uuid4())
                connection.execute(
                    """INSERT INTO exam_snapshots VALUES
                       (?, ?, ?, 'grading_lock', ?, ?)""",
                    (
                        snapshot_id,
                        exam_id,
                        exam["version"],
                        json.dumps(detail, ensure_ascii=False, sort_keys=True),
                        now,
                    ),
                )
                connection.execute(
                    """UPDATE exams SET first_submission_received_at = ?,
                       locked_snapshot_id = ? WHERE exam_id = ?""",
                    (now, snapshot_id, exam_id),
                )
                connection.execute(
                    """INSERT INTO grading_progress VALUES (?, ?, 0, 0, ?)
                       ON CONFLICT(exam_id) DO UPDATE SET
                         total_submissions = excluded.total_submissions,
                         updated_at = excluded.updated_at""",
                    (exam_id, payload["total_submissions"], now),
                )
                self._audit(
                    connection,
                    exam_id,
                    "first_submission_received",
                    "grading-system",
                    {"total_submissions": payload["total_submissions"]},
                )
                result = {
                    "exam_id": exam_id,
                    "locked": True,
                    "status": "preparing_exam",
                    "total_submissions": payload["total_submissions"],
                    "snapshot_id": snapshot_id,
                }
            else:
                if not exam["locked_snapshot_id"]:
                    raise DomainError(
                        409, "exam_not_locked", "Exam has no grading snapshot"
                    )
                if exam["status"] == "done":
                    raise DomainError(
                        409, "exam_done", "Completed grading cannot be changed"
                    )
                progress = connection.execute(
                    """SELECT total_submissions, graded_submissions,
                              scored_submissions
                       FROM grading_progress WHERE exam_id = ?""",
                    (exam_id,),
                ).fetchone()
                if (
                    progress
                    and progress["total_submissions"] != payload["total_submissions"]
                ):
                    raise DomainError(
                        409,
                        "submission_count_conflict",
                        "Submission total differs from the lock event",
                    )
                if progress and (
                    payload["graded_submissions"] < progress["graded_submissions"]
                    or payload["scored_submissions"] < progress["scored_submissions"]
                ):
                    raise DomainError(
                        409,
                        "grading_progress_regression",
                        "Grading progress cannot move backwards",
                    )
                completed = (
                    payload["graded_submissions"] == payload["total_submissions"]
                    and payload["scored_submissions"] == payload["total_submissions"]
                )
                status = "done" if completed else exam["status"]
                connection.execute(
                    """INSERT INTO grading_progress VALUES (?, ?, ?, ?, ?)
                       ON CONFLICT(exam_id) DO UPDATE SET
                         total_submissions = excluded.total_submissions,
                         graded_submissions = excluded.graded_submissions,
                         scored_submissions = excluded.scored_submissions,
                         updated_at = excluded.updated_at""",
                    (
                        exam_id,
                        payload["total_submissions"],
                        payload["graded_submissions"],
                        payload["scored_submissions"],
                        now,
                    ),
                )
                if completed:
                    connection.execute(
                        "UPDATE exams SET status = 'done', updated_at = ? WHERE exam_id = ?",
                        (now, exam_id),
                    )
                    self._audit(
                        connection,
                        exam_id,
                        "grading_completed",
                        "grading-system",
                        payload,
                    )
                result = {"exam_id": exam_id, "status": status, **payload}
            connection.execute(
                "INSERT INTO internal_events VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    str(uuid4()),
                    exam_id,
                    event_type,
                    idempotency_key,
                    canonical,
                    json.dumps(result, ensure_ascii=False, sort_keys=True),
                    now,
                ),
            )
            return result

    def first_submission(
        self,
        exam_id: str,
        idempotency_key: str,
        payload: FirstSubmissionEvent,
    ) -> dict[str, Any]:
        return self._internal_event(
            exam_id,
            "first_submission",
            idempotency_key,
            payload.model_dump(),
        )

    def grading_completed(
        self,
        exam_id: str,
        idempotency_key: str,
        payload: GradingCompletedEvent,
    ) -> dict[str, Any]:
        if (
            payload.scored_submissions > payload.graded_submissions
            or payload.graded_submissions > payload.total_submissions
        ):
            raise DomainError(
                422,
                "invalid_grading_counts",
                "Graded and scored counts must not exceed their parents",
            )
        return self._internal_event(
            exam_id,
            "grading_completed",
            idempotency_key,
            payload.model_dump(),
        )

    def export_docx(
        self,
        actor: str,
        exam_id: str,
        payload: DocxExportCreate,
    ) -> dict[str, Any]:
        with self.database.connect() as connection:
            exam = self.repository.get_owned_exam(connection, exam_id, actor)
            if not exam:
                raise DomainError(404, "exam_not_found", "Exam not found")
            if exam["version"] != payload.expected_version:
                raise DomainError(
                    409,
                    "version_conflict",
                    "Exam version is stale",
                    {"current_version": exam["version"]},
                )
            detail = self.repository.detail(connection, exam)
        errors = self._validation_errors(detail)
        if errors:
            raise DomainError(
                409, "exam_invalid", "Cannot export invalid exam", {"errors": errors}
            )
        export_id = str(uuid4())
        normalized = unicodedata.normalize("NFKD", detail["title"])
        slug = (
            re.sub(
                r"[^a-z0-9]+",
                "-",
                normalized.encode("ascii", "ignore").decode().lower(),
            ).strip("-")
            or "exam"
        )
        file_name = f"{slug[:80]}-v{exam['version']}.docx"
        destination = self.export_dir / export_id / file_name
        self.exporter.export(
            detail,
            payload.style,
            payload.include_answer_key,
            payload.include_rubric,
            destination,
        )
        now = utcnow()
        snapshot_id = str(uuid4())
        with self.database.transaction() as connection:
            connection.execute(
                "INSERT INTO exam_snapshots VALUES (?, ?, ?, 'export', ?, ?)",
                (
                    snapshot_id,
                    exam_id,
                    exam["version"],
                    json.dumps(detail, ensure_ascii=False, sort_keys=True),
                    now,
                ),
            )
            connection.execute(
                "INSERT INTO exports VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    export_id,
                    exam_id,
                    exam["version"],
                    payload.style,
                    file_name,
                    str(destination),
                    actor,
                    now,
                ),
            )
            self._audit(
                connection,
                exam_id,
                "docx_exported",
                actor,
                {
                    "export_id": export_id,
                    "exam_version": exam["version"],
                    "style": payload.style,
                },
            )
        return {
            "export_id": export_id,
            "exam_id": exam_id,
            "exam_version": exam["version"],
            "style": payload.style,
            "file_name": file_name,
            "created_at": now,
        }

    def list_exports(self, actor: str, exam_id: str) -> list[dict[str, Any]]:
        with self.database.connect() as connection:
            if not self.repository.get_owned_exam(connection, exam_id, actor):
                raise DomainError(404, "exam_not_found", "Exam not found")
            return [
                dict(row)
                for row in connection.execute(
                    """SELECT export_id, exam_id, exam_version, style,
                              file_name, created_at
                       FROM exports WHERE exam_id = ? AND created_by = ?
                       ORDER BY created_at DESC""",
                    (exam_id, actor),
                )
            ]

    def export_file(self, actor: str, exam_id: str, export_id: str) -> tuple[Path, str]:
        with self.database.connect() as connection:
            row = connection.execute(
                """SELECT file_path, file_name FROM exports
                   WHERE export_id = ? AND exam_id = ? AND created_by = ?""",
                (export_id, exam_id, actor),
            ).fetchone()
        if not row:
            raise DomainError(404, "export_not_found", "Export not found")
        return Path(row["file_path"]), row["file_name"]
