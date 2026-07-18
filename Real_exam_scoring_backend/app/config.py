from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlparse


DEFAULT_DATA_DIR = Path(__file__).resolve().parents[1] / "data"


@dataclass(slots=True)
class Settings:
    database_path: Path = field(
        default_factory=lambda: Path(
            os.getenv("DATABASE_PATH", str(DEFAULT_DATA_DIR / "ocr.db"))
        )
    )
    data_dir: Path = field(
        default_factory=lambda: Path(os.getenv("DATA_DIR", str(DEFAULT_DATA_DIR)))
    )
    provider_mode: str = field(
        default_factory=lambda: os.getenv("PROVIDER_MODE", "demo")
    )
    datalab_api_key: str | None = field(
        default_factory=lambda: os.getenv("DATALAB_API_KEY")
    )
    datalab_base_url: str = field(
        default_factory=lambda: os.getenv(
            "DATALAB_BASE_URL", "https://www.datalab.to/api/v1"
        )
    )
    qwen_base_url: str | None = field(
        default_factory=lambda: os.getenv("QWEN_BASE_URL")
    )
    qwen_api_key: str | None = field(default_factory=lambda: os.getenv("QWEN_API_KEY"))
    qwen_model: str = field(default_factory=lambda: os.getenv("QWEN_MODEL", "qwen-8b"))
    provider_timeout_seconds: float = 30.0
    provider_poll_interval_seconds: float = 1.0
    provider_max_polls: int = 120
    provider_max_attempts: int = 3
    max_file_bytes: int = 25 * 1024 * 1024
    max_upload_parts: int = 10_000

    def __post_init__(self) -> None:
        self.database_path = Path(self.database_path)
        self.data_dir = Path(self.data_dir)
        if self.provider_mode not in {"demo", "live"}:
            raise ValueError("PROVIDER_MODE must be demo or live")
        if self.provider_mode == "live":
            for name, value in (
                ("DATALAB_BASE_URL", self.datalab_base_url),
                ("QWEN_BASE_URL", self.qwen_base_url),
            ):
                if value and urlparse(value).scheme != "https":
                    raise ValueError(f"{name} must use HTTPS in live mode")
