from pathlib import Path
import warnings

import pytest
from starlette.exceptions import StarletteDeprecationWarning

from create_exam_backend.app.config import Settings
from create_exam_backend.app.main import create_app

warnings.filterwarnings(
    "ignore",
    message="Using `httpx` with `starlette.testclient` is deprecated",
    category=StarletteDeprecationWarning,
)


@pytest.fixture
def client(tmp_path: Path):
    from fastapi.testclient import TestClient

    settings = Settings(
        db_path=tmp_path / "exam.db",
        export_dir=tmp_path / "exports",
        internal_token="test-internal-token",
        demo_mode=True,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def teacher_headers() -> dict[str, str]:
    return {"X-Teacher-Id": "teacher-demo", "X-Role": "teacher"}
