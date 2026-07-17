from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event

import pytest

from app.config import Settings
from app.normalizer import normalize_datalab
from app.pipeline import Pipeline
from app.providers import (
    DatalabClient,
    DemoMappingProvider,
    MappingValidationError,
    ProviderError,
    QwenClient,
    validate_mapping_output,
)
from conftest import TEACHER_HEADERS, create_submission, upload_demo_file


def test_normalizer_keeps_types_positions_order_and_nullable_confidence():
    raw = {
        "json": {
            "children": [
                {
                    "block_type": "Page",
                    "page_id": 0,
                    "children": [
                        {
                            "id": "line-1",
                            "block_type": "Text",
                            "html": "Lời giải",
                            "bbox": [10, 20, 200, 50],
                            "confidence": 0.93,
                        },
                        {
                            "id": "formula-1",
                            "block_type": "Equation",
                            "latex": "1/2+1/4=3/4",
                            "bbox": [10, 60, 240, 100],
                        },
                    ],
                }
            ]
        }
    }

    blocks = normalize_datalab(raw)

    assert [block.content_type for block in blocks] == ["text", "math"]
    assert blocks[0].page_number == 1
    assert blocks[1].reading_order == 2
    assert blocks[1].ocr_confidence is None
    assert blocks[0].bounding_box == [10.0, 20.0, 200.0, 50.0]


def test_mapping_validation_rejects_missing_or_unknown_references():
    with pytest.raises(MappingValidationError):
        validate_mapping_output(
            {
                "rubric_mappings": [
                    {
                        "rubric_item_id": "unknown",
                        "evidence_block_ids": ["b1"],
                        "mapping_confidence": 0.8,
                    }
                ]
            },
            rubric_ids={"r1", "r2"},
            block_ids={"b1"},
        )


def test_mapping_validation_rejects_model_generated_topic_tags():
    with pytest.raises(MappingValidationError):
        validate_mapping_output(
            {
                "rubric_mappings": [
                    {
                        "rubric_item_id": "r1",
                        "evidence_block_ids": ["b1"],
                        "mapping_confidence": 0.8,
                        "topic_tags": ["invented"],
                    }
                ]
            },
            rubric_ids={"r1"},
            block_ids={"b1"},
        )


def test_datalab_submit_is_never_retried_without_provider_idempotency(monkeypatch):
    class ServerError:
        status_code = 500

    class FakeClient:
        post_calls = 0

        def __init__(self, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def post(self, *args, **kwargs):
            self.post_calls += 1
            return ServerError()

    fake = FakeClient()
    monkeypatch.setattr("app.providers.httpx.Client", lambda **kwargs: fake)
    client = DatalabClient(
        Settings(provider_mode="demo", datalab_api_key="server-secret")
    )

    with pytest.raises(ProviderError) as error:
        client.submit([("answer.png", b"image", "image/png")])

    assert fake.post_calls == 1
    assert error.value.retryable is False


def test_datalab_poll_reuses_request_id_until_complete(monkeypatch):
    class FakeResponse:
        status_code = 200

        def __init__(self, payload):
            self.payload = payload

        def json(self):
            return self.payload

    class FakeClient:
        def __init__(self):
            self.urls = []
            self.responses = [
                FakeResponse({"status": "processing"}),
                FakeResponse(
                    {"status": "complete", "success": True, "json": {"children": []}}
                ),
            ]

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return None

        def get(self, url, **kwargs):
            self.urls.append(url)
            return self.responses.pop(0)

    fake = FakeClient()
    monkeypatch.setattr("app.providers.httpx.Client", lambda **kwargs: fake)
    settings = Settings(
        provider_mode="demo",
        datalab_api_key="server-secret",
        provider_poll_interval_seconds=0,
        provider_max_polls=3,
    )

    result = DatalabClient(settings).poll("request-123")

    assert result["_provider_request_id"] == "request-123"
    assert fake.urls == [
        "https://www.datalab.to/api/v1/convert/request-123",
        "https://www.datalab.to/api/v1/convert/request-123",
    ]


def test_qwen_client_sends_structured_payload_and_parses_json(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"rubric_mappings":[{"rubric_item_id":"r1",'
                                '"evidence_block_ids":["b1"],'
                                '"mapping_confidence":0.9}]}'
                            )
                        }
                    }
                ]
            }

    def fake_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr("app.providers.httpx.post", fake_post)
    client = QwenClient(
        Settings(
            provider_mode="demo",
            qwen_base_url="https://qwen.example/v1",
            qwen_api_key="qwen-secret",
            qwen_model="qwen-8b-test",
        )
    )
    payload = {
        "question": {"question_id": "q1", "content": "Q"},
        "rubric_items": [{"rubric_item_id": "r1"}],
        "ocr_blocks": [{"block_id": "b1"}],
    }

    result = client.map(payload)

    assert result["rubric_mappings"][0]["rubric_item_id"] == "r1"
    assert captured["url"] == "https://qwen.example/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer qwen-secret"
    assert captured["json"]["response_format"] == {"type": "json_object"}
    assert payload["question"]["content"] in captured["json"]["messages"][1]["content"]


def test_demo_pipeline_creates_separate_completed_jobs(client, submission_payload):
    submission = create_submission(client, submission_payload)
    upload_demo_file(client, submission["submission_id"])
    response = client.post(
        f"/api/submissions/{submission['submission_id']}/process",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "process-1"},
    )

    assert response.status_code == 202
    detail = client.get(
        f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
    ).json()
    assert detail["status"] == "awaiting_review"
    assert detail["ocr_jobs"][0]["status"] == "completed"
    assert detail["mapping_jobs"][0]["status"] == "completed"
    assert len(detail["ocr_blocks"]) >= 2
    assert len(detail["draft_mappings"]) == 2
    raw_location = client.app.state.database.fetchone(
        "SELECT raw_response_location FROM ocr_jobs WHERE submission_id = ?",
        (submission["submission_id"],),
    )["raw_response_location"]
    assert raw_location
    assert (client.app.state.storage.root / raw_location).is_file()


def test_duplicate_process_message_does_not_create_jobs_twice(
    client, submission_payload
):
    submission = create_submission(client, submission_payload)
    upload_demo_file(client, submission["submission_id"])
    headers = {**TEACHER_HEADERS, "Idempotency-Key": "same-process"}
    client.post(
        f"/api/submissions/{submission['submission_id']}/process", headers=headers
    )
    client.post(
        f"/api/submissions/{submission['submission_id']}/process", headers=headers
    )

    detail = client.get(
        f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
    ).json()
    assert len(detail["ocr_jobs"]) == 1
    assert len(detail["mapping_jobs"]) == 1
    assert detail["status"] == "awaiting_review"


def test_same_process_key_is_scoped_to_submission(client, submission_payload):
    first = create_submission(client, submission_payload, "first")
    second = create_submission(client, submission_payload, "second")
    upload_demo_file(client, first["submission_id"])
    upload_demo_file(client, second["submission_id"])
    headers = {**TEACHER_HEADERS, "Idempotency-Key": "shared-key"}

    client.post(f"/api/submissions/{first['submission_id']}/process", headers=headers)
    client.post(f"/api/submissions/{second['submission_id']}/process", headers=headers)

    for submission in (first, second):
        detail = client.get(
            f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
        ).json()
        assert detail["status"] == "awaiting_review"
        assert len(detail["ocr_jobs"]) == 1


def test_mapping_can_be_rerun_without_new_ocr_job(client, submission_payload):
    submission = create_submission(client, submission_payload)
    upload_demo_file(client, submission["submission_id"])
    client.post(
        f"/api/submissions/{submission['submission_id']}/process",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "process"},
    )
    rerun = client.post(
        f"/api/submissions/{submission['submission_id']}/mapping-jobs",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "rerun-1"},
    )

    assert rerun.status_code == 202
    detail = client.get(
        f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
    ).json()
    assert len(detail["ocr_jobs"]) == 1
    assert len(detail["mapping_jobs"]) == 2


def test_ocr_failure_falls_back_to_full_manual(client, submission_payload):
    class FailingOCR:
        name = "failing-ocr"

        def convert(self, files):
            raise ProviderError("temporary outage")

    state = client.app.state
    state.pipeline = Pipeline(
        state.database,
        state.storage,
        state.settings,
        ocr_provider=FailingOCR(),
    )
    submission = create_submission(client, submission_payload)
    upload_demo_file(client, submission["submission_id"])
    client.post(
        f"/api/submissions/{submission['submission_id']}/process",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "ocr-fail"},
    )

    detail = client.get(
        f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
    ).json()
    assert detail["processing_mode"] == "full_manual"
    assert detail["fallback_reason"] == "ocr_failed"
    assert detail["ocr_jobs"][0]["status"] == "failed"
    assert detail["mapping_jobs"] == []


def test_invalid_mapping_keeps_ocr_and_uses_partial_fallback(
    client, submission_payload
):
    class InvalidMapping:
        model_name = "invalid-qwen"

        def map(self, payload):
            return {"rubric_mappings": []}

    state = client.app.state
    state.pipeline = Pipeline(
        state.database,
        state.storage,
        state.settings,
        mapping_provider=InvalidMapping(),
    )
    submission = create_submission(client, submission_payload)
    upload_demo_file(client, submission["submission_id"])
    client.post(
        f"/api/submissions/{submission['submission_id']}/process",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "mapping-fail"},
    )

    detail = client.get(
        f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
    ).json()
    assert detail["processing_mode"] == "partial_fallback"
    assert detail["fallback_reason"] == "invalid_mapping_schema"
    assert detail["ocr_jobs"][0]["status"] == "completed"
    assert detail["ocr_blocks"]
    assert detail["mapping_jobs"][0]["status"] == "failed"


def test_redelivery_resumes_existing_datalab_request(client, submission_payload):
    class RecoveringDatalab(DatalabClient):
        name = "datalab"

        def __init__(self):
            self.poll_calls = 0

        def submit(self, files):
            raise AssertionError("redelivery must not submit the document again")

        def poll(self, request_id):
            self.poll_calls += 1
            assert request_id == "provider-request-1"
            return {
                "_provider_request_id": request_id,
                "status": "complete",
                "success": True,
                "json": {
                    "children": [
                        {
                            "block_type": "Page",
                            "page_id": 0,
                            "children": [
                                {
                                    "id": "recovered",
                                    "block_type": "Text",
                                    "text": "Recovered OCR",
                                    "bbox": [0, 0, 100, 30],
                                    "confidence": 0.9,
                                }
                            ],
                        }
                    ]
                },
            }

    submission = create_submission(client, submission_payload)
    upload_demo_file(client, submission["submission_id"])
    state = client.app.state
    provider = RecoveringDatalab()
    state.pipeline = Pipeline(
        state.database,
        state.storage,
        state.settings,
        ocr_provider=provider,
        mapping_provider=DemoMappingProvider(),
    )
    state.database.execute(
        """INSERT INTO ocr_jobs
           (ocr_job_id, submission_id, provider, provider_request_id,
            idempotency_key, status, attempt_count, created_at)
           VALUES ('recover-job', ?, 'datalab', 'provider-request-1',
                   'recover-key', 'processing', 1, '2026-07-17T00:00:00Z')""",
        (submission["submission_id"],),
    )
    state.database.execute(
        "UPDATE submissions SET status = 'processing' WHERE submission_id = ?",
        (submission["submission_id"],),
    )

    response = client.post(
        f"/api/submissions/{submission['submission_id']}/process",
        headers={**TEACHER_HEADERS, "Idempotency-Key": "recover-key"},
    )

    assert response.status_code == 202
    detail = client.get(
        f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
    ).json()
    assert provider.poll_calls == 1
    assert detail["status"] == "awaiting_review"
    assert detail["ocr_jobs"][0]["status"] == "completed"
    assert detail["mapping_jobs"][0]["status"] == "completed"


def test_redelivery_resumes_interrupted_mapping_job(client, submission_payload):
    submission = create_submission(client, submission_payload)
    upload_demo_file(client, submission["submission_id"])
    process_headers = {**TEACHER_HEADERS, "Idempotency-Key": "mapping-recovery"}
    client.post(
        f"/api/submissions/{submission['submission_id']}/process",
        headers=process_headers,
    )
    state = client.app.state
    mapping_job = state.database.fetchone(
        "SELECT * FROM mapping_jobs WHERE submission_id = ?",
        (submission["submission_id"],),
    )
    state.database.execute(
        "DELETE FROM draft_mappings WHERE mapping_job_id = ?",
        (mapping_job["mapping_job_id"],),
    )
    state.database.execute(
        """UPDATE mapping_jobs
           SET status = 'processing', completed_at = NULL
           WHERE mapping_job_id = ?""",
        (mapping_job["mapping_job_id"],),
    )
    state.database.execute(
        "UPDATE submissions SET status = 'processing' WHERE submission_id = ?",
        (submission["submission_id"],),
    )

    client.post(
        f"/api/submissions/{submission['submission_id']}/process",
        headers=process_headers,
    )

    detail = client.get(
        f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
    ).json()
    assert detail["status"] == "awaiting_review"
    assert detail["mapping_jobs"][0]["status"] == "completed"
    assert len(detail["draft_mappings"]) == len(submission_payload["rubric_items"])


def test_concurrent_redelivery_cannot_overwrite_completed_ocr(
    client, submission_payload
):
    barrier = Barrier(2)

    class ConcurrentDatalab(DatalabClient):
        name = "datalab"

        def __init__(self):
            pass

        def poll(self, request_id):
            barrier.wait(timeout=5)
            return {
                "_provider_request_id": request_id,
                "status": "complete",
                "success": True,
                "json": {
                    "children": [
                        {
                            "block_type": "Page",
                            "page_id": 0,
                            "children": [
                                {
                                    "id": "same-block",
                                    "block_type": "Text",
                                    "text": "Recovered once",
                                    "bbox": [0, 0, 100, 30],
                                }
                            ],
                        }
                    ]
                },
            }

    submission = create_submission(client, submission_payload)
    upload_demo_file(client, submission["submission_id"])
    state = client.app.state
    state.pipeline = Pipeline(
        state.database,
        state.storage,
        state.settings,
        ocr_provider=ConcurrentDatalab(),
        mapping_provider=DemoMappingProvider(),
    )
    state.database.execute(
        """INSERT INTO ocr_jobs
           (ocr_job_id, submission_id, provider, provider_request_id,
            idempotency_key, status, attempt_count, created_at)
           VALUES ('concurrent-job', ?, 'datalab', 'request-concurrent',
                   'concurrent-key', 'processing', 1, '2026-07-17T00:00:00Z')""",
        (submission["submission_id"],),
    )
    state.database.execute(
        "UPDATE submissions SET status = 'processing' WHERE submission_id = ?",
        (submission["submission_id"],),
    )

    with ThreadPoolExecutor(max_workers=2) as executor:
        list(
            executor.map(
                lambda _: state.pipeline.process(
                    submission["submission_id"], "concurrent-key"
                ),
                range(2),
            )
        )

    detail = client.get(
        f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
    ).json()
    assert detail["status"] == "awaiting_review"
    assert detail["processing_mode"] == "ai_assisted"
    assert detail["ocr_jobs"][0]["status"] == "completed"
    assert len(detail["ocr_blocks"]) == 1


def test_manual_switch_during_datalab_submit_keeps_job_cancelled(
    client, submission_payload
):
    submitted = Event()
    release = Event()

    class BlockingDatalab(DatalabClient):
        name = "datalab"

        def __init__(self):
            self.poll_calls = 0

        def submit(self, files):
            submitted.set()
            assert release.wait(timeout=5)
            return "request-after-manual"

        def poll(self, request_id):
            self.poll_calls += 1
            return {"status": "processing"}

    submission = create_submission(client, submission_payload)
    upload_demo_file(client, submission["submission_id"])
    state = client.app.state
    provider = BlockingDatalab()
    state.pipeline = Pipeline(
        state.database,
        state.storage,
        state.settings,
        ocr_provider=provider,
        mapping_provider=DemoMappingProvider(),
    )

    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(
            client.post,
            f"/api/submissions/{submission['submission_id']}/process",
            headers={**TEACHER_HEADERS, "Idempotency-Key": "manual-race"},
        )
        assert submitted.wait(timeout=5)
        manual = client.post(
            f"/api/submissions/{submission['submission_id']}/manual",
            headers=TEACHER_HEADERS,
        )
        assert manual.status_code == 200
        release.set()
        assert future.result(timeout=5).status_code == 202

    detail = client.get(
        f"/api/submissions/{submission['submission_id']}", headers=TEACHER_HEADERS
    ).json()
    assert provider.poll_calls == 0
    assert detail["processing_mode"] == "full_manual"
    assert detail["fallback_reason"] == "teacher_selected_manual"
    assert detail["ocr_jobs"][0]["status"] == "cancelled"
