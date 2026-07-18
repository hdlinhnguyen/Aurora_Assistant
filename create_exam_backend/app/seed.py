import json

from .database import Database


TOPICS = [
    ("topic-linear-equations", "Phương trình bậc nhất", "math", 8),
    ("topic-fractions", "Phân số", "math", 8),
    ("topic-geometry", "Hình học phẳng", "math", 8),
    ("topic-probability", "Xác suất", "math", 8),
    ("topic-reading", "Đọc hiểu", "literature", 8),
    ("topic-writing", "Viết đoạn văn", "literature", 8),
]

QUESTIONS = [
    (
        "bank-math-1",
        "Giá trị của x trong x + 3 = 5 là bao nhiêu?",
        "math",
        8,
        "single_choice",
        "2.00",
        [{"choice_id": "a", "content": "1"}, {"choice_id": "b", "content": "2"}],
        "b",
        ["topic-linear-equations"],
        [],
    ),
    (
        "bank-math-2",
        "Phân số nào bằng 1/2?",
        "math",
        8,
        "single_choice",
        "2.00",
        [{"choice_id": "a", "content": "2/4"}, {"choice_id": "b", "content": "3/4"}],
        "a",
        ["topic-fractions"],
        [],
    ),
    (
        "bank-math-3",
        "Giải phương trình 2x + 1 = 7 và trình bày các bước.",
        "math",
        8,
        "essay",
        "4.00",
        [],
        None,
        ["topic-linear-equations"],
        [
            {
                "description": "Lập phép biến đổi đúng",
                "points": "2.00",
                "topic_ids": ["topic-linear-equations"],
            },
            {
                "description": "Kết luận x = 3",
                "points": "2.00",
                "topic_ids": ["topic-linear-equations"],
            },
        ],
    ),
    (
        "bank-math-4",
        "Tính xác suất lấy được một số chẵn từ các số 1 đến 6.",
        "math",
        8,
        "essay",
        "2.00",
        [],
        None,
        ["topic-probability"],
        [
            {
                "description": "Xác định đúng ba kết quả thuận lợi",
                "points": "1.00",
                "topic_ids": ["topic-probability"],
            },
            {
                "description": "Kết luận xác suất bằng 1/2",
                "points": "1.00",
                "topic_ids": ["topic-probability"],
            },
        ],
    ),
]


def seed_database(database: Database) -> None:
    with database.connect() as connection:
        connection.execute(
            "INSERT OR IGNORE INTO teachers VALUES (?, ?)",
            ("teacher-demo", "Giáo viên demo"),
        )
        connection.executemany(
            "INSERT OR IGNORE INTO topics VALUES (?, ?, ?, ?)", TOPICS
        )
        connection.executemany(
            """INSERT OR IGNORE INTO question_bank_questions
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            [
                (
                    *q[:6],
                    json.dumps(q[6], ensure_ascii=False),
                    q[7],
                    json.dumps(q[8]),
                    json.dumps(q[9], ensure_ascii=False),
                )
                for q in QUESTIONS
            ],
        )
