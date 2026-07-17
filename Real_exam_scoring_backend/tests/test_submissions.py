from conftest import TEACHER_HEADERS, create_submission


def test_submission_creation_is_idempotent(client, submission_payload):
    submission_payload["rubric_items"][0]["max_points"] = 1.5
    first = create_submission(client, submission_payload, "same-key")
    second = client.post(
        "/api/submissions",
        json=submission_payload,
        headers={**TEACHER_HEADERS, "Idempotency-Key": "same-key"},
    )

    assert second.status_code == 200
    assert second.json()["submission_id"] == first["submission_id"]
    assert first["status"] == "ready"
    assert len(first["rubric_items"]) == 2
    assert first["rubric_items"][0]["max_points"] == 1.5
    assert first["rubric_items"][1]["max_points"] == 0


def test_submission_requires_teacher_role(client, submission_payload):
    response = client.post(
        "/api/submissions",
        json=submission_payload,
        headers={
            "X-Teacher-Id": "student-1",
            "X-Role": "student",
            "Idempotency-Key": "x",
        },
    )

    assert response.status_code == 403


def test_full_manual_skips_jobs_and_awaits_review(client, submission_payload):
    submission_payload["processing_mode"] = "full_manual"
    submission = create_submission(client, submission_payload)

    response = client.post(
        f"/api/submissions/{submission['submission_id']}/process",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "process-manual"},
    )

    assert response.status_code == 202
    detail = client.get(
        f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
    ).json()
    assert detail["status"] == "awaiting_review"
    assert detail["ocr_jobs"] == []
    assert detail["mapping_jobs"] == []


def test_processing_mode_defaults_to_full_manual(client, submission_payload):
    submission_payload.pop("processing_mode")
    submission = create_submission(client, submission_payload)

    assert submission["processing_mode"] == "full_manual"

    response = client.post(
        f"/api/submissions/{submission['submission_id']}/process",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "process-default-manual"},
    )

    assert response.status_code == 202
    detail = client.get(
        f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
    ).json()
    assert detail["status"] == "awaiting_review"
    assert detail["ocr_jobs"] == []
    assert detail["mapping_jobs"] == []


def test_teacher_cannot_read_another_teachers_submission(client, submission_payload):
    submission = create_submission(client, submission_payload)
    response = client.get(
        f"/api/submissions/{submission['submission_id']}",
        headers={"X-Teacher-Id": "teacher-2", "X-Role": "teacher"},
    )
    assert response.status_code == 404
