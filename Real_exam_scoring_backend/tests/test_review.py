from concurrent.futures import ThreadPoolExecutor

from conftest import TEACHER_HEADERS, create_submission, upload_demo_file


def prepared_submission(client, payload):
    submission = create_submission(client, payload)
    upload_demo_file(client, submission["submission_id"])
    client.post(
        f"/api/submissions/{submission['submission_id']}/process",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "process"},
    )
    return submission["submission_id"]


def test_approval_requires_every_rubric_status(client, submission_payload):
    submission_id = prepared_submission(client, submission_payload)
    client.put(
        f"/api/submissions/{submission_id}/reviews/r1",
        headers=TEACHER_HEADERS,
        json={"status": "correct", "evidence_block_ids": []},
    )
    response = client.post(
        f"/api/submissions/{submission_id}/approve",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "approve-1"},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Every rubric item must have a review status"


def test_ai_submission_cannot_be_reviewed_or_approved_before_pipeline(
    client, submission_payload
):
    submission = create_submission(client, submission_payload)
    submission_id = submission["submission_id"]
    review = client.put(
        f"/api/submissions/{submission_id}/reviews/r1",
        headers=TEACHER_HEADERS,
        json={"status": "correct", "evidence_block_ids": []},
    )
    approve = client.post(
        f"/api/submissions/{submission_id}/approve",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "premature"},
    )
    assert review.status_code == 409
    assert approve.status_code == 409


def test_approval_versions_results_and_writes_audit(client, submission_payload):
    submission_id = prepared_submission(client, submission_payload)
    detail = client.get(
        f"/api/submissions/{submission_id}", headers=TEACHER_HEADERS
    ).json()
    evidence = [detail["ocr_blocks"][0]["block_id"]]
    for rubric_id, status in (("r1", "correct"), ("r2", "incorrect")):
        response = client.put(
            f"/api/submissions/{submission_id}/reviews/{rubric_id}",
            headers=TEACHER_HEADERS,
            json={"status": status, "evidence_block_ids": evidence},
        )
        assert response.status_code == 200

    first = client.post(
        f"/api/submissions/{submission_id}/approve",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "approve-1"},
    )
    assert first.status_code == 201
    assert first.json()["version"] == 1
    assert {item["mapping_method"] for item in first.json()["items"]} == {"ai_reviewed"}

    client.put(
        f"/api/submissions/{submission_id}/reviews/r2",
        headers=TEACHER_HEADERS,
        json={"status": "correct", "evidence_block_ids": evidence},
    )
    second = client.post(
        f"/api/submissions/{submission_id}/approve",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "approve-2"},
    )
    assert second.status_code == 201
    assert second.json()["version"] == 2

    audit = client.get(
        f"/api/submissions/{submission_id}/audit", headers=TEACHER_HEADERS
    ).json()
    assert any(row["action"] == "review_updated" for row in audit)
    assert sum(row["action"] == "submission_approved" for row in audit) == 2


def test_review_rejects_unknown_evidence_block(client, submission_payload):
    submission_id = prepared_submission(client, submission_payload)
    response = client.put(
        f"/api/submissions/{submission_id}/reviews/r1",
        headers=TEACHER_HEADERS,
        json={"status": "correct", "evidence_block_ids": ["not-a-block"]},
    )
    assert response.status_code == 422


def test_teacher_can_edit_ocr_text_and_change_to_manual(client, submission_payload):
    submission_id = prepared_submission(client, submission_payload)
    detail = client.get(
        f"/api/submissions/{submission_id}", headers=TEACHER_HEADERS
    ).json()
    block_id = detail["ocr_blocks"][0]["block_id"]

    edited = client.patch(
        f"/api/submissions/{submission_id}/ocr-blocks/{block_id}",
        headers=TEACHER_HEADERS,
        json={"content": "Nội dung OCR đã sửa"},
    )
    assert edited.status_code == 200
    assert edited.json()["content"] == "Nội dung OCR đã sửa"

    manual = client.post(
        f"/api/submissions/{submission_id}/manual",
        headers=TEACHER_HEADERS,
    )
    assert manual.status_code == 200
    assert manual.json()["processing_mode"] == "full_manual"
    assert manual.json()["fallback_reason"] == "teacher_selected_manual"

    audit = client.get(
        f"/api/submissions/{submission_id}/audit", headers=TEACHER_HEADERS
    ).json()
    assert any(row["action"] == "ocr_content_edited" for row in audit)
    assert any(row["action"] == "switched_to_manual" for row in audit)


def test_concurrent_duplicate_approval_is_idempotent(client, submission_payload):
    submission_id = prepared_submission(client, submission_payload)
    detail = client.get(
        f"/api/submissions/{submission_id}", headers=TEACHER_HEADERS
    ).json()
    evidence = [detail["ocr_blocks"][0]["block_id"]]
    for rubric_id in ("r1", "r2"):
        client.put(
            f"/api/submissions/{submission_id}/reviews/{rubric_id}",
            headers=TEACHER_HEADERS,
            json={"status": "correct", "evidence_block_ids": evidence},
        )

    def approve_once(_):
        return client.post(
            f"/api/submissions/{submission_id}/approve",
            headers={**TEACHER_HEADERS, "Idempotency-Key": "concurrent-approval"},
        )

    with ThreadPoolExecutor(max_workers=8) as executor:
        responses = list(executor.map(approve_once, range(16)))

    assert {response.status_code for response in responses}.issubset({200, 201})
    assert {response.json()["version"] for response in responses} == {1}
