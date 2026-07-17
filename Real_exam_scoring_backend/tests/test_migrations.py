import sqlite3

from app.database import Database


def test_initialize_adds_max_points_to_legacy_rubric_items(tmp_path):
    path = tmp_path / "legacy.db"
    connection = sqlite3.connect(path)
    connection.execute(
        """CREATE TABLE rubric_items (
            submission_id TEXT NOT NULL,
            rubric_item_id TEXT NOT NULL,
            description TEXT NOT NULL,
            topic_tags_json TEXT NOT NULL,
            position INTEGER NOT NULL,
            PRIMARY KEY(submission_id, rubric_item_id)
        )"""
    )
    connection.commit()
    connection.close()

    Database(path).initialize()

    connection = sqlite3.connect(path)
    columns = {
        row[1]: row for row in connection.execute("PRAGMA table_info(rubric_items)")
    }
    connection.close()
    assert columns["max_points"][2] == "REAL"
    assert columns["max_points"][4] == "0"
