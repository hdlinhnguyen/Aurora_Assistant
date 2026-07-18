from __future__ import annotations

import hashlib
from io import BytesIO

from conftest import TEACHER_HEADERS, create_submission, upload_demo_file
from PIL import Image, ImageDraw


def image_bytes(size=(700, 900), *, border=False) -> bytes:
    image = Image.new("RGB", size, "white")
    if border:
        ImageDraw.Draw(image).rectangle(
            (0, 0, size[0] - 1, size[1] - 1), outline="black", width=30
        )
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def test_simple_upload_deduplicates_by_checksum(client, submission_payload):
    submission = create_submission(client, submission_payload)
    first = upload_demo_file(client, submission["submission_id"])
    second_response = client.post(
        f"/api/submissions/{submission['submission_id']}/files",
        headers=TEACHER_HEADERS,
        data={
            "page_number": "1",
            "checksum": hashlib.sha256(b"handwriting").hexdigest(),
        },
        files={"file": ("copy.png", b"handwriting", "image/png")},
    )

    assert second_response.status_code == 200
    assert second_response.json()["file_id"] == first["file_id"]


def test_simple_upload_rejects_bad_checksum(client, submission_payload):
    submission = create_submission(client, submission_payload)
    response = client.post(
        f"/api/submissions/{submission['submission_id']}/files",
        headers=TEACHER_HEADERS,
        data={"page_number": "1", "checksum": "0" * 64},
        files={"file": ("answer.png", b"handwriting", "image/png")},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "File checksum mismatch"


def test_resumable_upload_reports_missing_parts_and_completes(
    client, submission_payload
):
    submission = create_submission(client, submission_payload)
    content = b"abcdefgh"
    upload = client.post(
        f"/api/submissions/{submission['submission_id']}/uploads",
        headers=TEACHER_HEADERS,
        json={
            "file_name": "pages.pdf",
            "media_type": "application/pdf",
            "page_number": 1,
            "total_parts": 2,
            "checksum": hashlib.sha256(content).hexdigest(),
        },
    )
    assert upload.status_code == 201
    upload_id = upload.json()["upload_id"]

    part_one = b"abcd"
    response = client.put(
        f"/api/uploads/{upload_id}/parts/1",
        headers={
            **TEACHER_HEADERS,
            "X-Part-Checksum": hashlib.sha256(part_one).hexdigest(),
            "Content-Type": "application/octet-stream",
        },
        content=part_one,
    )
    assert response.status_code == 204
    status = client.get(f"/api/uploads/{upload_id}", headers=TEACHER_HEADERS).json()
    assert status["missing_parts"] == [2]

    part_two = b"efgh"
    client.put(
        f"/api/uploads/{upload_id}/parts/2",
        headers={
            **TEACHER_HEADERS,
            "X-Part-Checksum": hashlib.sha256(part_two).hexdigest(),
            "Content-Type": "application/octet-stream",
        },
        content=part_two,
    )
    complete = client.post(
        f"/api/uploads/{upload_id}/complete", headers=TEACHER_HEADERS
    )
    assert complete.status_code == 201
    assert complete.json()["checksum"] == hashlib.sha256(content).hexdigest()


def test_resumable_upload_rejects_oversized_part(client, submission_payload):
    client.app.state.settings.max_file_bytes = 4
    submission = create_submission(client, submission_payload)
    upload = client.post(
        f"/api/submissions/{submission['submission_id']}/uploads",
        headers=TEACHER_HEADERS,
        json={
            "file_name": "answer.png",
            "media_type": "image/png",
            "page_number": 1,
            "total_parts": 1,
            "checksum": hashlib.sha256(b"12345").hexdigest(),
        },
    ).json()
    response = client.put(
        f"/api/uploads/{upload['upload_id']}/parts/1",
        headers={
            **TEACHER_HEADERS,
            "X-Part-Checksum": hashlib.sha256(b"12345").hexdigest(),
            "Content-Type": "application/octet-stream",
        },
        content=b"12345",
    )
    assert response.status_code == 413


def test_image_quality_warns_blur_crop_and_wrong_orientation(
    client, submission_payload
):
    submission = create_submission(client, submission_payload)
    content = image_bytes((900, 700), border=True)
    response = client.post(
        f"/api/submissions/{submission['submission_id']}/files",
        headers=TEACHER_HEADERS,
        data={"page_number": "1", "checksum": hashlib.sha256(content).hexdigest()},
        files={"file": ("landscape.png", content, "image/png")},
    )

    assert response.status_code == 201
    warnings = set(response.json()["quality_warnings"])
    assert "warning_blurry" in warnings
    assert "warning_possible_crop" in warnings
    assert "warning_wrong_orientation" in warnings


def test_submission_reports_missing_page_numbers(client, submission_payload):
    submission = create_submission(client, submission_payload)
    for page_number in (1, 3):
        content = image_bytes()
        response = client.post(
            f"/api/submissions/{submission['submission_id']}/files",
            headers=TEACHER_HEADERS,
            data={
                "page_number": str(page_number),
                "checksum": hashlib.sha256(
                    content + str(page_number).encode()
                ).hexdigest(),
            },
            files={
                "file": (
                    f"page-{page_number}.png",
                    content + str(page_number).encode(),
                    "image/png",
                )
            },
        )
        assert response.status_code == 201

    detail = client.get(
        f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
    ).json()
    assert detail["quality_warnings"] == [
        {"code": "warning_missing_pages", "page_numbers": [2]}
    ]
