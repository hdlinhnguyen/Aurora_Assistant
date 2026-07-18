from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    db_path: Path
    export_dir: Path
    internal_token: str
    demo_mode: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            db_path=Path(
                os.getenv("AURORA_EXAM_DB_PATH", "create_exam_backend/data/exams.db")
            ),
            export_dir=Path(
                os.getenv(
                    "AURORA_EXAM_EXPORT_DIR",
                    "create_exam_backend/data/exports",
                )
            ),
            internal_token=os.getenv(
                "AURORA_EXAM_INTERNAL_TOKEN", "change-me-for-production"
            ),
            demo_mode=os.getenv("AURORA_EXAM_DEMO_MODE", "true").lower() == "true",
        )
