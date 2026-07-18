import json
import sqlite3
from typing import Any


def decoded(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return dict(row) if row else None


class ExamRepository:
    def get_owned_exam(
        self, connection: sqlite3.Connection, exam_id: str, teacher_id: str
    ) -> dict[str, Any] | None:
        return decoded(
            connection.execute(
                "SELECT * FROM exams WHERE exam_id = ? AND created_by = ?",
                (exam_id, teacher_id),
            ).fetchone()
        )

    def detail(
        self, connection: sqlite3.Connection, exam: dict[str, Any]
    ) -> dict[str, Any]:
        result = dict(exam)
        questions = [
            dict(row)
            for row in connection.execute(
                "SELECT * FROM exam_questions WHERE exam_id = ? ORDER BY position",
                (exam["exam_id"],),
            ).fetchall()
        ]
        for question in questions:
            question["choices"] = json.loads(question.pop("choices_json"))
            question["topic_ids"] = json.loads(question.pop("topic_ids_json"))
            rubrics = [
                dict(row)
                for row in connection.execute(
                    "SELECT * FROM rubric_items WHERE exam_question_id = ? ORDER BY position",
                    (question["exam_question_id"],),
                ).fetchall()
            ]
            for rubric in rubrics:
                rubric["topic_ids"] = json.loads(rubric.pop("topic_ids_json"))
            question["rubric_items"] = rubrics
        result["questions"] = questions
        return result


class QuestionBankRepository:
    @staticmethod
    def _decode(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["choices"] = json.loads(result.pop("choices_json"))
        result["topic_ids"] = json.loads(result.pop("topic_ids_json"))
        result["rubric"] = json.loads(result.pop("rubric_json"))
        return result

    def list_questions(
        self,
        connection: sqlite3.Connection,
        subject_id: str | None,
        grade_level: int | None,
        question_type: str | None,
        topic_id: str | None,
        search: str | None,
    ) -> list[dict[str, Any]]:
        sql = "SELECT * FROM question_bank_questions WHERE 1 = 1"
        params: list[Any] = []
        for field, value in (
            ("subject_id", subject_id),
            ("grade_level", grade_level),
            ("question_type", question_type),
        ):
            if value is not None:
                sql += f" AND {field} = ?"
                params.append(value)
        if search:
            sql += " AND lower(content) LIKE ?"
            params.append(f"%{search.lower()}%")
        sql += " ORDER BY question_id"
        results = [
            self._decode(row) for row in connection.execute(sql, params).fetchall()
        ]
        if topic_id:
            results = [
                question for question in results if topic_id in question["topic_ids"]
            ]
        return results

    def get_question(
        self, connection: sqlite3.Connection, question_id: str
    ) -> dict[str, Any] | None:
        row = connection.execute(
            "SELECT * FROM question_bank_questions WHERE question_id = ?",
            (question_id,),
        ).fetchone()
        return self._decode(row) if row else None

    def list_topics(
        self,
        connection: sqlite3.Connection,
        subject_id: str | None,
        grade_level: int | None,
    ) -> list[dict[str, Any]]:
        sql = "SELECT * FROM topics WHERE 1 = 1"
        params: list[Any] = []
        if subject_id:
            sql += " AND subject_id = ?"
            params.append(subject_id)
        if grade_level:
            sql += " AND grade_level = ?"
            params.append(grade_level)
        sql += " ORDER BY name"
        return [dict(row) for row in connection.execute(sql, params)]
