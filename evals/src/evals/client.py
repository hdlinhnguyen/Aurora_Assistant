"""HTTP client mỏng cho backend Go — black-box, đi qua đúng API thật (không gọi
thẳng LLM) để eval luôn cả prompt, JSON parsing, guardrail integration, model
router. Xem docs/eval-socratic-chat.md mục Harness.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import httpx

DEFAULT_BASE_URL = "http://localhost:8081/api"

# Chuỗi mở đầu đặc trưng của mock mode (ai_service.go GenerateResponse, khi
# OPENAI_API_KEY rỗng) — dùng làm canary để phát hiện harness đang vô tình đo
# mock mode thay vì model thật (xem Track E4 trong doc thiết kế).
MOCK_MODE_SOCRATIC_PREFIX = "Chào em! Thầy thấy em đang muốn tìm hiểu về chủ đề"
MOCK_MODE_FEYNMAN_PREFIX = "Em chào thầy/cô ạ! Em nghe nói thầy/cô rất giỏi"


class MockModeDetected(RuntimeError):
    """Backend đang trả lời bằng mock mode (thiếu OPENAI_API_KEY) — mọi số đo
    eval trong tình trạng này là giả, phải dừng ngay (Track E4: fail-fast)."""


@dataclass
class EvalUser:
    email: str
    password: str
    token: str = ""
    user_id: str = ""


class AuroraClient:
    """Thin wrapper quanh REST API — tự quản token cho 1 học sinh + 1 giáo viên
    dùng chung suốt phiên eval (tái dùng tài khoản demo đã seed sẵn trong
    main.go, xem README)."""

    def __init__(self, base_url: str | None = None, timeout: float = 90.0):
        self.base_url = (base_url or os.environ.get("AURORA_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
        self._http = httpx.Client(base_url=self.base_url, timeout=timeout)
        self.student = EvalUser(
            email=os.environ.get("AURORA_EVAL_STUDENT_EMAIL", "student@aurora.edu.vn"),
            password=os.environ.get("AURORA_EVAL_STUDENT_PASSWORD", "demo123"),
        )
        self.teacher = EvalUser(
            email=os.environ.get("AURORA_EVAL_TEACHER_EMAIL", "teacher@aurora.edu.vn"),
            password=os.environ.get("AURORA_EVAL_TEACHER_PASSWORD", "demo123"),
        )

    def login(self, user: EvalUser) -> EvalUser:
        resp = self._http.post("/auth/login", json={"email": user.email, "password": user.password})
        resp.raise_for_status()
        data = resp.json()
        user.token = data["token"]
        user.user_id = data["user"]["id"]
        return user

    def ensure_logged_in(self) -> None:
        if not self.student.token:
            self.login(self.student)
        if not self.teacher.token:
            self.login(self.teacher)

    def _auth_headers(self, user: EvalUser) -> dict:
        return {"Authorization": f"Bearer {user.token}"}

    def create_session(self, topic: str, mode: str = "socratic") -> str:
        self.ensure_logged_in()
        resp = self._http.post(
            "/tutor/sessions",
            json={"topic": topic, "mode": mode},
            headers=self._auth_headers(self.student),
        )
        resp.raise_for_status()
        return resp.json()["id"]

    def send_message(self, session_id: str, content: str) -> dict:
        """Gửi 1 lượt chat học sinh, trả về {"studentMessage": ..., "aiMessage": ...}.
        Kiểm tra canary mock-mode ngay khi nhận response đầu tiên."""
        self.ensure_logged_in()
        resp = self._http.post(
            f"/tutor/sessions/{session_id}/messages",
            json={"content": content},
            headers=self._auth_headers(self.student),
        )
        resp.raise_for_status()
        data = resp.json()
        ai_content = (data.get("aiMessage") or {}).get("content", "")
        if ai_content.startswith(MOCK_MODE_SOCRATIC_PREFIX) or ai_content.startswith(MOCK_MODE_FEYNMAN_PREFIX):
            raise MockModeDetected(
                "Backend đang trả lời bằng mock mode (không có OPENAI_API_KEY). "
                "Kiểm tra backend/.env trước khi chạy eval."
            )
        return data

    def guardrail_events(self, severity: str = "", limit: int = 100) -> list[dict]:
        """Lấy sự kiện guardrail gần nhất (yêu cầu tài khoản giáo viên) — dùng
        để suy ra safety_flag của lượt chat vừa gửi (API chat không trả trực
        tiếp safety_flag cho học sinh, xem docs/eval-socratic-chat.md Track D)."""
        self.ensure_logged_in()
        params = {"limit": limit}
        if severity:
            params["severity"] = severity
        resp = self._http.get(
            "/teacher/guardrail-events",
            params=params,
            headers=self._auth_headers(self.teacher),
        )
        resp.raise_for_status()
        return resp.json() or []

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "AuroraClient":
        return self

    def __exit__(self, *exc) -> None:
        self.close()
