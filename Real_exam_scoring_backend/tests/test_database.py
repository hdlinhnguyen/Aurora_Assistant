import sqlite3

from app.database import Database


def test_initialize_migrates_legacy_approval_snapshot_column(tmp_path):
    path = tmp_path / "legacy.db"
    connection = sqlite3.connect(path)
    connection.execute(
        """CREATE TABLE approved_mappings (
               approved_mapping_id TEXT PRIMARY KEY,
               submission_id TEXT NOT NULL,
               rubric_item_id TEXT NOT NULL,
               status TEXT NOT NULL,
               evidence_block_ids_json TEXT NOT NULL,
               ocr_confidence REAL,
               mapping_confidence REAL,
               mapping_method TEXT NOT NULL,
               approved_by TEXT NOT NULL,
               approved_at TEXT NOT NULL,
               version INTEGER NOT NULL
           )"""
    )
    connection.commit()
    connection.close()

    database = Database(path)
    database.initialize()

    columns = {
        row["name"] for row in database.fetchall("PRAGMA table_info(approved_mappings)")
    }
    assert "evidence_snapshot_json" in columns
