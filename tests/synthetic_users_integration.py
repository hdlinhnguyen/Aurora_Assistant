"""Live API verification for resettable synthetic users and BKT profiles."""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request


BASE_URL = os.environ.get("AURORA_API_URL", "http://localhost:8081/api").rstrip("/")
PASSWORD = "demo123"
TEACHER_EMAIL = "synthetic.teacher@aurora.local"
STUDENT_EMAILS = [
    "synthetic.student.a@aurora.local",
    "synthetic.student.b@aurora.local",
    "synthetic.student.c@aurora.local",
]
SYNTHETIC_SUBJECT = "Synthetic - To\u00e1n \u0111\u1ea1i s\u1ed1"


def request(method: str, path: str, *, token: str | None = None, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    call = urllib.request.Request(BASE_URL + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(call, timeout=15) as response:
        return json.loads(response.read().decode())


def login(email: str) -> dict:
    return request("POST", "/auth/login", body={"email": email, "password": PASSWORD})


def main() -> None:
    teacher = login(TEACHER_EMAIL)
    students = {email: login(email) for email in STUDENT_EMAILS}
    progress = request("GET", "/teacher/students-progress", token=teacher["token"])
    target = next(
        row
        for row in progress
        if row["studentEmail"] == STUDENT_EMAILS[1]
        and row["subject"] == SYNTHETIC_SUBJECT
    )
    subject = target["subject"]
    student_id = students[STUDENT_EMAILS[1]]["user"]["id"]
    profile = request(
        "GET",
        f"/teacher/students/{student_id}/mastery?subject={urllib.parse.quote(subject)}",
        token=teacher["token"],
    )

    assert target["totalAnswers"] > 0
    assert len(profile["topics"]) >= 3
    assert all(topic["evidenceCount"] > 0 for topic in profile["topics"].values())
    print(
        "synthetic users integration passed; "
        f"users={1 + len(students)} topics={len(profile['topics'])} answers={target['totalAnswers']}"
    )


if __name__ == "__main__":
    main()
