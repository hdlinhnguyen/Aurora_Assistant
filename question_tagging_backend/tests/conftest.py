from collections.abc import Iterator
from pathlib import Path
import warnings

import pytest

warnings.filterwarnings(
    "ignore",
    message="Using `httpx` with `starlette.testclient` is deprecated.*",
)

from fastapi.testclient import TestClient  # noqa: E402

from question_tagging_backend.app.main import create_app


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    app = create_app(tmp_path / "tagging-test.db")
    with TestClient(app) as test_client:
        yield test_client
