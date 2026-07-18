"""Live smoke test for teacher/student mastery profile API parity."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request


BASE_URL = os.environ.get("AURORA_API_URL", "http://127.0.0.1:8082/api").rstrip("/")


def request(method: str, path: str, *, token: str | None = None, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE_URL + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode())


def login(email: str) -> dict:
    return request("POST", "/auth/login", body={"email": email, "password": "demo123"})


def main() -> None:
    try:
        teacher = login("teacher@aurora.edu.vn")
        student = login("student@aurora.edu.vn")
    except (urllib.error.URLError, TimeoutError) as error:
        raise SystemExit(f"SKIP: local Aurora API is not running at {BASE_URL}: {error}")

    progress = request("GET", "/teacher/students-progress", token=teacher["token"])
    row = next(item for item in progress if item["studentEmail"] == "student@aurora.edu.vn")
    subject = row["subject"]
    student_id = student["user"]["id"]

    request(
        "POST",
        f"/teacher/students/{student_id}/mastery/recalculate",
        token=teacher["token"],
        body={"subject": subject},
    )
    encoded_subject = urllib.parse.quote(subject)
    teacher_profile = request(
        "GET",
        f"/teacher/students/{student_id}/mastery?subject={encoded_subject}",
        token=teacher["token"],
    )
    student_profile = request(
        "GET",
        f"/student/mastery?subject={encoded_subject}",
        token=student["token"],
    )

    assert teacher_profile["studentId"] == student_profile["studentId"] == student_id
    assert teacher_profile["topics"] == student_profile["topics"]
    print(f"PASS: teacher and student mastery profiles match ({len(student_profile['topics'])} topics)")


if __name__ == "__main__":
    main()
