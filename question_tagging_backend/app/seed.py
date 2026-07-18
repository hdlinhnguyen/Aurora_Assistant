from __future__ import annotations

from datetime import UTC, datetime

from question_tagging_backend.app.database import Database


QUESTIONS = [
    (
        "q-mcq-1",
        "Giải phương trình 2x + 3 = 11.",
        "math",
        7,
        "multiple_choice",
    ),
    (
        "q-essay-1",
        "Rút gọn biểu thức phân thức và giải phương trình thu được.",
        "math",
        7,
        "essay",
    ),
]

RUBRIC_ITEMS = [
    ("r-essay-1", "q-essay-1", "Quy đồng và rút gọn phân thức.", 1),
    ("r-essay-2", "q-essay-1", "Giải phương trình và kết luận.", 2),
]

TOPICS = [
    ("topic-fractions", "Phân số và phân thức", "math", 6),
    ("topic-equations", "Phương trình bậc nhất", "math", 7),
    ("topic-polynomials", "Đa thức", "math", 8),
    ("topic-motion", "Chuyển động cơ học", "physics", 7),
]


def seed_demo_data(database: Database) -> None:
    now = datetime.now(UTC).isoformat()
    with database.transaction() as connection:
        connection.executemany(
            """
            INSERT OR IGNORE INTO questions
                (id, content, subject_id, grade_level, question_type)
            VALUES (?, ?, ?, ?, ?)
            """,
            QUESTIONS,
        )
        connection.executemany(
            """
            INSERT OR IGNORE INTO rubric_items
                (id, question_id, content, position)
            VALUES (?, ?, ?, ?)
            """,
            RUBRIC_ITEMS,
        )
        connection.executemany(
            """
            INSERT OR IGNORE INTO topics (id, name, subject_id, grade_level)
            VALUES (?, ?, ?, ?)
            """,
            TOPICS,
        )
        connection.executemany(
            """
            INSERT OR IGNORE INTO question_tagging_states
                (question_id, version, updated_by, updated_at)
            VALUES (?, 1, NULL, ?)
            """,
            [(question[0], now) for question in QUESTIONS],
        )
