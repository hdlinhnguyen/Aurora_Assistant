from pathlib import Path

from fastapi.testclient import TestClient

from create_exam_backend.app.config import Settings
from create_exam_backend.app.main import create_app


def test_demo_page_exposes_authoring_controls(client):
    response = client.get("/")

    assert response.status_code == 200
    assert "Ngân hàng câu hỏi" in response.text
    assert 'id="exam-canvas"' in response.text
    assert 'id="manual-question-form"' in response.text
    assert 'id="export-docx"' in response.text
    assert 'id="simulate-submission"' in response.text
    assert 'id="simulate-completion"' in response.text
    assert 'id="bank-topic"' in response.text
    assert 'id="question-editor-form"' in response.text
    assert 'id="return-draft"' in response.text
    assert "change-me-for-production" not in response.text


def test_demo_config_never_exposes_token_and_disables_simulation(tmp_path):
    settings = Settings(
        db_path=tmp_path / "disabled-demo.db",
        export_dir=tmp_path / "exports",
        internal_token="never-return-this-token",
        demo_mode=False,
    )
    with TestClient(create_app(settings)) as client:
        config = client.get("/api/demo-config")
        assert config.json() == {"demo_mode": False, "teacher_id": None}
        assert "never-return-this-token" not in config.text
        simulation = client.post("/demo/exams/not-an-exam/simulate-first-submission")
        assert simulation.status_code == 404


def test_openapi_contains_complete_exam_authoring_contract(client):
    paths = set(client.get("/openapi.json").json()["paths"])
    assert {
        "/api/exams",
        "/api/exams/{exam_id}",
        "/api/exams/{exam_id}/audit",
        "/api/question-bank/questions",
        "/api/question-bank/questions/{question_id}",
        "/api/topics",
        "/api/exams/{exam_id}/questions/from-bank",
        "/api/exams/{exam_id}/questions/manual",
        "/api/exams/{exam_id}/questions/reorder",
        "/api/exams/{exam_id}/questions/{question_id}",
        "/api/exams/{exam_id}/questions/{question_id}/rubric-items",
        "/api/exams/{exam_id}/questions/{question_id}/rubric-items/{rubric_id}",
        "/api/exams/{exam_id}/questions/{question_id}/rubric-items/reorder",
        "/api/exams/{exam_id}/validate",
        "/api/exams/{exam_id}/prepare",
        "/api/exams/{exam_id}/return-to-draft",
        "/internal/exams/{exam_id}/first-submission",
        "/internal/exams/{exam_id}/grading-completed",
        "/api/exams/{exam_id}/exports/docx",
        "/api/exams/{exam_id}/exports",
        "/api/exams/{exam_id}/exports/{export_id}/download",
    } <= paths


def test_readme_documents_run_test_and_callback_commands():
    text = Path("create_exam_backend/README.md").read_text(encoding="utf-8")
    assert "python -m uvicorn create_exam_backend.app.main:app" in text
    assert "python -m pytest create_exam_backend/tests -v" in text
    assert "X-Internal-Token" in text
    assert "Idempotency-Key" in text
    assert "grading-completed" in text
