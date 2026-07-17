from __future__ import annotations

import json
import time
from dataclasses import asdict
from typing import Any, Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .config import Settings
from .normalizer import NormalizedBlock


class ProviderError(RuntimeError):
    def __init__(self, message: str, *, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable


class MappingValidationError(ValueError):
    pass


class OCRProvider(Protocol):
    name: str

    def convert(self, files: list[tuple[str, bytes, str]]) -> dict[str, Any]: ...


class MappingProvider(Protocol):
    model_name: str

    def map(self, payload: dict[str, Any]) -> dict[str, Any]: ...


class DemoOCRProvider:
    name = "datalab-demo"

    def convert(self, files: list[tuple[str, bytes, str]]) -> dict[str, Any]:
        if not files:
            raise ProviderError("No files supplied")
        return {
            "_provider_request_id": "demo-request",
            "status": "complete",
            "success": True,
            "json": {
                "children": [
                    {
                        "block_type": "Page",
                        "page_id": 0,
                        "children": [
                            {
                                "id": "demo-b1",
                                "block_type": "Text",
                                "text": "Quy đồng: 1/2 = 2/4",
                                "bbox": [80, 120, 520, 190],
                                "confidence": 0.94,
                            },
                            {
                                "id": "demo-b2",
                                "block_type": "Equation",
                                "latex": "2/4 + 1/4 = 3/4",
                                "bbox": [80, 210, 560, 290],
                                "confidence": 0.91,
                            },
                        ],
                    }
                ]
            },
        }


class DemoMappingProvider:
    model_name = "qwen-8b-demo"

    def map(self, payload: dict[str, Any]) -> dict[str, Any]:
        block_ids = [block["block_id"] for block in payload["ocr_blocks"]]
        return {
            "rubric_mappings": [
                {
                    "rubric_item_id": item["rubric_item_id"],
                    "evidence_block_ids": [block_ids[min(index, len(block_ids) - 1)]],
                    "mapping_confidence": round(0.9 - index * 0.03, 2),
                }
                for index, item in enumerate(payload["rubric_items"])
            ]
        }


class DatalabClient:
    name = "datalab"

    def __init__(self, settings: Settings):
        if not settings.datalab_api_key:
            raise ValueError("DATALAB_API_KEY is required in live mode")
        self.settings = settings

    def submit(self, files: list[tuple[str, bytes, str]]) -> str:
        multipart = [
            (f"file.{index}", (name, content, media_type))
            for index, (name, content, media_type) in enumerate(files)
        ]
        headers = {"X-API-Key": self.settings.datalab_api_key or ""}
        with httpx.Client(timeout=self.settings.provider_timeout_seconds) as client:
            try:
                response = client.post(
                    f"{self.settings.datalab_base_url.rstrip('/')}/convert",
                    headers=headers,
                    files=multipart,
                    data={
                        "output_format": "json",
                        "mode": "balanced",
                        "add_block_ids": "true",
                        "disable_image_extraction": "true",
                    },
                )
            except httpx.HTTPError as exc:
                # A timed-out POST may already have been accepted. Reposting could
                # duplicate processing, so submit is deliberately never auto-retried.
                raise ProviderError(
                    f"Datalab submit outcome is unknown: {exc}", retryable=False
                ) from exc
            if response.status_code >= 400:
                raise ProviderError(
                    f"Datalab rejected request with HTTP {response.status_code}",
                    retryable=False,
                )
            try:
                submitted = response.json()
                if not submitted.get("success", True):
                    raise ProviderError(
                        str(submitted.get("error") or "Datalab rejected request"),
                        retryable=False,
                    )
                return str(submitted["request_id"])
            except (KeyError, ValueError) as exc:
                raise ProviderError(
                    f"Invalid Datalab submit response: {exc}", retryable=False
                ) from exc
        raise ProviderError("Datalab submit failed")

    def poll(self, request_id: str) -> dict[str, Any]:
        headers = {"X-API-Key": self.settings.datalab_api_key or ""}
        check_url = f"{self.settings.datalab_base_url.rstrip('/')}/convert/{request_id}"
        transient_failures = 0
        with httpx.Client(timeout=self.settings.provider_timeout_seconds) as client:
            for _ in range(self.settings.provider_max_polls):
                try:
                    result_response = client.get(check_url, headers=headers)
                    if (
                        result_response.status_code == 429
                        or result_response.status_code >= 500
                    ):
                        transient_failures += 1
                        if transient_failures >= self.settings.provider_max_attempts:
                            raise ProviderError("Datalab polling repeatedly failed")
                        time.sleep(self.settings.provider_poll_interval_seconds)
                        continue
                    if result_response.status_code >= 400:
                        raise ProviderError(
                            f"Datalab poll rejected with HTTP {result_response.status_code}",
                            retryable=False,
                        )
                    result = result_response.json()
                    if result.get("status") == "complete":
                        if not result.get("success", True):
                            raise ProviderError(
                                str(result.get("error") or "Datalab failed"),
                                retryable=False,
                            )
                        result["_provider_request_id"] = request_id
                        return result
                    if result.get("status") in {"failed", "error"}:
                        raise ProviderError(
                            str(result.get("error") or "Datalab failed"),
                            retryable=False,
                        )
                    transient_failures = 0
                    time.sleep(self.settings.provider_poll_interval_seconds)
                except httpx.HTTPError:
                    transient_failures += 1
                    if transient_failures >= self.settings.provider_max_attempts:
                        raise ProviderError("Datalab polling repeatedly failed")
                    time.sleep(self.settings.provider_poll_interval_seconds)
                except ValueError as exc:
                    raise ProviderError(
                        f"Invalid Datalab poll response: {exc}", retryable=False
                    ) from exc
        raise ProviderError("Datalab polling timed out")

    def convert(self, files: list[tuple[str, bytes, str]]) -> dict[str, Any]:
        """Convenience API; the pipeline uses submit/poll to persist request IDs."""
        request_id = self.submit(files)
        return self.poll(request_id)


class QwenClient:
    model_name: str

    def __init__(self, settings: Settings):
        if not settings.qwen_base_url:
            raise ValueError("QWEN_BASE_URL is required in live mode")
        self.settings = settings
        self.model_name = settings.qwen_model

    def map(self, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if self.settings.qwen_api_key:
            headers["Authorization"] = f"Bearer {self.settings.qwen_api_key}"
        body = {
            "model": self.model_name,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Return only JSON with rubric_mappings. Use only supplied rubric_item_id "
                        "and block_id values. Do not return scores, topic tags, or explanations."
                    ),
                },
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
        }
        url = f"{self.settings.qwen_base_url.rstrip('/')}/chat/completions"
        try:
            response = httpx.post(
                url,
                headers=headers,
                json=body,
                timeout=self.settings.provider_timeout_seconds,
            )
            if response.status_code == 429 or response.status_code >= 500:
                raise ProviderError(
                    f"Qwen temporarily failed with HTTP {response.status_code}"
                )
            if response.status_code >= 400:
                raise ProviderError(
                    f"Qwen rejected request with HTTP {response.status_code}",
                    retryable=False,
                )
            content = response.json()["choices"][0]["message"]["content"].strip()
            if content.startswith("```"):
                content = content.removeprefix("```json").removeprefix("```")
                content = content.removesuffix("```").strip()
            return json.loads(content)
        except httpx.HTTPError as exc:
            raise ProviderError(f"Qwen request failed: {exc}") from exc
        except (KeyError, ValueError, json.JSONDecodeError) as exc:
            raise ProviderError(
                f"Invalid Qwen response: {exc}", retryable=False
            ) from exc


class MappingItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rubric_item_id: str
    evidence_block_ids: list[str]
    mapping_confidence: float = Field(ge=0, le=1)


class MappingOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rubric_mappings: list[MappingItem]


def validate_mapping_output(
    raw: dict[str, Any], rubric_ids: set[str], block_ids: set[str]
) -> list[MappingItem]:
    try:
        output = MappingOutput.model_validate(raw)
    except ValidationError as exc:
        raise MappingValidationError(f"Invalid mapping schema: {exc}") from exc
    returned_ids = [item.rubric_item_id for item in output.rubric_mappings]
    if len(returned_ids) != len(set(returned_ids)) or set(returned_ids) != rubric_ids:
        raise MappingValidationError(
            "Mapping must contain every rubric item exactly once"
        )
    for item in output.rubric_mappings:
        if not set(item.evidence_block_ids).issubset(block_ids):
            raise MappingValidationError("Mapping references an unknown OCR block")
    return output.rubric_mappings


def block_payload(block: NormalizedBlock) -> dict[str, Any]:
    return asdict(block)
