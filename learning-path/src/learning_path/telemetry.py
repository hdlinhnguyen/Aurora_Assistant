from __future__ import annotations

import os
from typing import Any


def model_version() -> str:
    return os.getenv("TELEMETRY_MODEL_VERSION", "bkt-v1")


def config_version() -> str:
    return os.getenv("BKT_CONFIG_VERSION", "bkt-config-v1")


def mastery_metadata(topic_count: int, evidence_count: int, latency_ms: int) -> dict[str, Any]:
    return {
        "event_name": "mastery_calculated",
        "model_version": model_version(),
        "config_version": config_version(),
        "topic_count": topic_count,
        "evidence_count": evidence_count,
        "calculation_latency_ms": latency_ms,
    }


def learning_path_metadata(paths: dict[str, Any], latency_ms: int) -> dict[str, Any]:
    step_count = 0
    for path in paths.values():
        ordered_steps = (
            path.get("ordered_steps", [])
            if isinstance(path, dict)
            else getattr(path, "ordered_steps", [])
        )
        step_count += len(ordered_steps)
    return {
        "event_name": "learning_path_generated",
        "model_version": os.getenv("LEARNING_PATH_MODEL_VERSION", "learning-path-v1"),
        "config_version": os.getenv("LEARNING_PATH_CONFIG_VERSION", "learning-path-config-v1"),
        "path_count": len(paths),
        "step_count": step_count,
        "generation_latency_ms": latency_ms,
    }
