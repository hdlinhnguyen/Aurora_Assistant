"""FastAPI mỏng — cầu nối HTTP cho phần còn lại của hệ thống (TypeScript).

POST /learning-path                     → chạy pipeline tới interrupt, trả Draft + insight
POST /learning-path/{thread_id}/approve → resume interrupt với quyết định giáo viên

Trạng thái phiên nằm trong checkpointer của LangGraph (InMemorySaver v1 — seam để
thay SQLite khi cần bền vững qua restart); thread_id là chìa khóa resume.

Chạy: uv run uvicorn learning_path.api:app
(graph mặc định đọc từ LEARNING_PATH_GRAPH_JSON, fallback knowledge-graph/data/graph.json)
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from langgraph.types import Command
from pydantic import BaseModel, Field

from learning_path.adapters import CurriculumGraph, load_chac_goc_graph
from learning_path.schemas import (
    LearningPathRequest,
    RawPaperEvidence,
    RawQuizEvidence,
)

# parents[3] = repo root (api.py → learning_path → src → learning-path → root)
DEFAULT_GRAPH_JSON = Path(__file__).resolve().parents[3] / "knowledge-graph" / "data" / "graph.json"


class CreatePathBody(BaseModel):
    request: LearningPathRequest
    raw_quiz: list[RawQuizEvidence] = Field(default_factory=list)
    raw_paper: list[RawPaperEvidence] = Field(default_factory=list)
    as_of: datetime


class ApproveBody(BaseModel):
    approve: bool
    note: str = ""


def create_app(curriculum: CurriculumGraph) -> FastAPI:
    # import trễ để test không cần build pipeline khi chỉ import schemas
    from learning_path.graph import build_pipeline

    app = FastAPI(title="learning-path", version="0.1.0")
    pipeline = build_pipeline(curriculum)
    known_threads: set[str] = set()

    def _serialize(state: dict) -> dict:
        insight = state.get("class_insight")
        return {
            "paths": {
                sid: p.model_dump(mode="json") for sid, p in state.get("paths", {}).items()
            },
            "class_insight": insight.model_dump(mode="json") if insight else None,
        }

    @app.post("/learning-path")
    def create_learning_path(body: CreatePathBody) -> dict:
        thread_id = uuid.uuid4().hex
        config = {"configurable": {"thread_id": thread_id}}
        result = pipeline.invoke(
            {
                "request": body.request,
                "raw_quiz": body.raw_quiz,
                "raw_paper": body.raw_paper,
                "as_of": body.as_of,
            },
            config,
        )
        known_threads.add(thread_id)
        interrupts = result.get("__interrupt__", [])
        return {
            "thread_id": thread_id,
            "status": "awaiting_approval" if interrupts else "finalized",
            "interrupt": interrupts[0].value if interrupts else None,
            **_serialize(result),
        }

    @app.post("/learning-path/{thread_id}/approve")
    def approve_learning_path(thread_id: str, body: ApproveBody) -> dict:
        if thread_id not in known_threads:
            raise HTTPException(status_code=404, detail="thread_id không tồn tại")
        config = {"configurable": {"thread_id": thread_id}}
        result = pipeline.invoke(
            Command(resume={"approve": body.approve, "note": body.note}), config
        )
        return {"thread_id": thread_id, "status": "finalized", **_serialize(result)}

    return app


def _default_app() -> FastAPI:
    graph_path = os.environ.get("LEARNING_PATH_GRAPH_JSON", str(DEFAULT_GRAPH_JSON))
    return create_app(load_chac_goc_graph(graph_path))


# Chỉ dựng app mặc định khi chạy qua uvicorn (import module này trực tiếp);
# create_app(curriculum) là entry point cho test và cho ai muốn graph khác.
try:
    app = _default_app()
except FileNotFoundError:  # môi trường không có graph.json — vẫn import được module
    app = None  # type: ignore[assignment]
