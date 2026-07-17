"""Smoke test tích hợp — cần backend Go đang chạy thật với OPENAI_API_KEY hợp
lệ (không phải mock mode). Tự động skip nếu backend không sẵn sàng, để không
chặn `pytest` khi chạy offline. Chạy `uv run eval-static` để có báo cáo đầy đủ.
"""

from __future__ import annotations

import httpx
import pytest

from evals.client import AuroraClient, MockModeDetected
from evals.run_static import run_track_c


def _backend_reachable(base_url: str) -> bool:
    try:
        httpx.get(base_url.replace("/api", "") + "/api/health", timeout=3.0)
        return True
    except httpx.HTTPError:
        return False


BASE_URL = "http://localhost:8081/api"


@pytest.mark.skipif(not _backend_reachable(BASE_URL), reason="backend không chạy ở localhost:8081")
def test_track_c_smoke():
    report = {"_all_responses": []}
    with AuroraClient(base_url=BASE_URL) as client:
        try:
            client.ensure_logged_in()
        except httpx.HTTPStatusError as e:
            pytest.skip(f"không đăng nhập được tài khoản demo: {e}")
        try:
            run_track_c(client, report)
        except MockModeDetected as e:
            pytest.skip(str(e))

    result = report["track_c_correct_step"]
    assert result["total"] > 0
    # Không assert accuracy cụ thể ở đây — đó là việc của gate trong run_static,
    # smoke test chỉ xác nhận pipeline chạy hết mà không lỗi.
