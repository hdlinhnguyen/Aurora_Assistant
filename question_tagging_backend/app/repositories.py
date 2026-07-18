from __future__ import annotations

import sqlite3
from collections.abc import Sequence


class TaggingRepository:
    def list_questions(self, connection: sqlite3.Connection) -> list[sqlite3.Row]:
        return connection.execute(
            """
            SELECT id, content, subject_id, grade_level, question_type
            FROM questions
            ORDER BY id
            """
        ).fetchall()

    def get_question(
        self, connection: sqlite3.Connection, question_id: str
    ) -> sqlite3.Row | None:
        return connection.execute(
            """
            SELECT id, content, subject_id, grade_level, question_type
            FROM questions
            WHERE id = ?
            """,
            (question_id,),
        ).fetchone()

    def get_rubric_item(
        self, connection: sqlite3.Connection, rubric_item_id: str
    ) -> sqlite3.Row | None:
        return connection.execute(
            """
            SELECT id, question_id, content, position
            FROM rubric_items
            WHERE id = ?
            """,
            (rubric_item_id,),
        ).fetchone()

    def list_rubric_items(
        self, connection: sqlite3.Connection, question_id: str
    ) -> list[sqlite3.Row]:
        return connection.execute(
            """
            SELECT id, question_id, content, position
            FROM rubric_items
            WHERE question_id = ?
            ORDER BY position, id
            """,
            (question_id,),
        ).fetchall()

    def list_topics_for_subject(
        self, connection: sqlite3.Connection, subject_id: str
    ) -> list[sqlite3.Row]:
        return connection.execute(
            """
            SELECT id, name, subject_id, grade_level
            FROM topics
            WHERE subject_id = ?
            ORDER BY name, id
            """,
            (subject_id,),
        ).fetchall()

    def get_topics(
        self, connection: sqlite3.Connection, topic_ids: Sequence[str]
    ) -> list[sqlite3.Row]:
        if not topic_ids:
            return []
        placeholders = ",".join("?" for _ in topic_ids)
        return connection.execute(
            f"""
            SELECT id, name, subject_id, grade_level
            FROM topics
            WHERE id IN ({placeholders})
            ORDER BY id
            """,
            tuple(topic_ids),
        ).fetchall()

    def get_state(
        self, connection: sqlite3.Connection, question_id: str
    ) -> sqlite3.Row | None:
        return connection.execute(
            """
            SELECT question_id, version, updated_by, updated_at
            FROM question_tagging_states
            WHERE question_id = ?
            """,
            (question_id,),
        ).fetchone()

    def list_direct_topic_ids(
        self, connection: sqlite3.Connection, question_id: str
    ) -> list[str]:
        rows = connection.execute(
            """
            SELECT topic_id
            FROM question_topic_mappings
            WHERE question_id = ?
            ORDER BY topic_id
            """,
            (question_id,),
        ).fetchall()
        return [row["topic_id"] for row in rows]

    def list_rubric_topic_ids(
        self, connection: sqlite3.Connection, rubric_item_id: str
    ) -> list[str]:
        rows = connection.execute(
            """
            SELECT topic_id
            FROM rubric_item_topic_mappings
            WHERE rubric_item_id = ?
            ORDER BY topic_id
            """,
            (rubric_item_id,),
        ).fetchall()
        return [row["topic_id"] for row in rows]

    def list_effective_topic_ids(
        self,
        connection: sqlite3.Connection,
        question_id: str,
        question_type: str,
    ) -> list[str]:
        direct = set(self.list_direct_topic_ids(connection, question_id))
        if question_type == "multiple_choice":
            return sorted(direct)

        rubric_rows = connection.execute(
            """
            SELECT mapping.topic_id
            FROM rubric_item_topic_mappings AS mapping
            JOIN rubric_items AS rubric ON rubric.id = mapping.rubric_item_id
            WHERE rubric.question_id = ?
            """,
            (question_id,),
        ).fetchall()
        return sorted(direct | {row["topic_id"] for row in rubric_rows})

    def replace_question_topics(
        self,
        connection: sqlite3.Connection,
        question_id: str,
        topic_ids: Sequence[str],
        updated_by: str,
        updated_at: str,
    ) -> None:
        connection.execute(
            "DELETE FROM question_topic_mappings WHERE question_id = ?",
            (question_id,),
        )
        connection.executemany(
            """
            INSERT INTO question_topic_mappings
                (question_id, topic_id, created_by, created_at)
            VALUES (?, ?, ?, ?)
            """,
            [
                (question_id, topic_id, updated_by, updated_at)
                for topic_id in topic_ids
            ],
        )

    def replace_rubric_item_topics(
        self,
        connection: sqlite3.Connection,
        rubric_item_id: str,
        topic_ids: Sequence[str],
        updated_by: str,
        updated_at: str,
    ) -> None:
        connection.execute(
            "DELETE FROM rubric_item_topic_mappings WHERE rubric_item_id = ?",
            (rubric_item_id,),
        )
        connection.executemany(
            """
            INSERT INTO rubric_item_topic_mappings
                (rubric_item_id, topic_id, created_by, created_at)
            VALUES (?, ?, ?, ?)
            """,
            [
                (rubric_item_id, topic_id, updated_by, updated_at)
                for topic_id in topic_ids
            ],
        )

    def advance_version(
        self,
        connection: sqlite3.Connection,
        question_id: str,
        expected_version: int,
        updated_by: str,
        updated_at: str,
    ) -> bool:
        cursor = connection.execute(
            """
            UPDATE question_tagging_states
            SET version = version + 1, updated_by = ?, updated_at = ?
            WHERE question_id = ? AND version = ?
            """,
            (updated_by, updated_at, question_id, expected_version),
        )
        return cursor.rowcount == 1
