from conftest import TEACHER_HEADERS, create_submission, upload_demo_file


def test_health_and_demo_are_available(client):
    health = client.get("/health")
    demo = client.get("/demo")

    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    assert demo.status_code == 200
    assert "Handwritten OCR" in demo.text
    assert "/api/submissions" in demo.text
    assert "OCR:" in demo.text
    assert '<option value="full_manual" selected>' in demo.text
    assert demo.text.index('value="full_manual"') < demo.text.index(
        'value="ai_assisted"'
    )
    assert "OCR + Qwen là tùy chọn hỗ trợ" in demo.text
    assert 'id="assessment"' in demo.text
    assert 'id="student"' in demo.text
    assert 'id="manual-workspace"' in demo.text
    assert 'class="manual-rubric-checkbox"' in demo.text
    assert 'id="upload-panel" hidden' in demo.text
    assert 'id="approve-manual"' in demo.text


def test_original_file_is_protected_and_viewable(client, submission_payload):
    submission = create_submission(client, submission_payload)
    uploaded = upload_demo_file(client, submission["submission_id"])

    anonymous = client.get(f"/api/files/{uploaded['file_id']}/content")
    teacher = client.get(
        f"/api/files/{uploaded['file_id']}/content", headers=TEACHER_HEADERS
    )

    assert anonymous.status_code == 401
    assert teacher.status_code == 200
    assert teacher.content == b"handwriting"
