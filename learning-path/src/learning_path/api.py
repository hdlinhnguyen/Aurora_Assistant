"""FastAPI mỏng — cầu nối HTTP cho phần còn lại của hệ thống (TypeScript).

POST /learning-path                      → chạy pipeline tới interrupt, trả Draft + insight
POST /learning-path/{thread_id}/approve  → resume interrupt với quyết định giáo viên
POST /learning-path/{thread_id}/evidence → nộp evidence mới, re-plan cùng thread,
                                           path version tăng, bản mới chờ duyệt lại
POST /hints                              → thang gợi ý 3 bậc có trần

Trạng thái phiên nằm trong checkpointer của LangGraph; thread_id là chìa khóa resume.
Mặc định InMemorySaver; đặt LEARNING_PATH_DB=<file.sqlite> (hoặc truyền checkpointer
vào create_app) để phiên duyệt sống qua restart server.

Chạy: uv run uvicorn learning_path.api:app
(graph mặc định đọc từ LEARNING_PATH_GRAPH_JSON, fallback knowledge-graph/data/graph.json)
"""

from __future__ import annotations

import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.types import Command
from pydantic import BaseModel, Field

from learning_path.adapters import CurriculumGraph, load_chac_goc_graph
from learning_path.hints import HintLadder
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


class EvidenceBody(BaseModel):
    raw_quiz: list[RawQuizEvidence] = Field(default_factory=list)
    raw_paper: list[RawPaperEvidence] = Field(default_factory=list)
    as_of: datetime


class HintBody(BaseModel):
    topic_id: str
    press_count: int = Field(ge=1)
    chosen_misconception: str | None = None


def create_app(
    curriculum: CurriculumGraph, *, checkpointer: BaseCheckpointSaver | None = None
) -> FastAPI:
    # import trễ để test không cần build pipeline khi chỉ import schemas
    from learning_path.graph import build_pipeline

    app = FastAPI(title="learning-path", version="0.1.1")
    pipeline = build_pipeline(curriculum, checkpointer=checkpointer)
    ladder = HintLadder(curriculum)

    def _config(thread_id: str) -> dict:
        return {"configurable": {"thread_id": thread_id}}

    def _existing_state(thread_id: str) -> dict:
        """Trạng thái đã checkpoint của thread; 404 nếu chưa từng tồn tại (kể cả sau restart)."""
        snapshot = pipeline.get_state(_config(thread_id))
        if not snapshot.values:
            raise HTTPException(status_code=404, detail="thread_id không tồn tại")
        return snapshot.values

    def _serialize(state: dict) -> dict:
        insight = state.get("class_insight")
        return {
            "paths": {
                sid: p.model_dump(mode="json") for sid, p in state.get("paths", {}).items()
            },
            "class_insight": insight.model_dump(mode="json") if insight else None,
        }

    def _respond(thread_id: str, result: dict) -> dict:
        interrupts = result.get("__interrupt__", [])
        return {
            "thread_id": thread_id,
            "status": "awaiting_approval" if interrupts else "finalized",
            "interrupt": interrupts[0].value if interrupts else None,
            **_serialize(result),
        }

    @app.post("/learning-path")
    def create_learning_path(body: CreatePathBody) -> dict:
        thread_id = uuid.uuid4().hex
        result = pipeline.invoke(
            {
                "request": body.request,
                "raw_quiz": body.raw_quiz,
                "raw_paper": body.raw_paper,
                "as_of": body.as_of,
                "path_version": 1,
            },
            _config(thread_id),
        )
        return _respond(thread_id, result)

    @app.post("/learning-path/{thread_id}/approve")
    def approve_learning_path(thread_id: str, body: ApproveBody) -> dict:
        _existing_state(thread_id)
        result = pipeline.invoke(
            Command(resume={"approve": body.approve, "note": body.note}), _config(thread_id)
        )
        return {"thread_id": thread_id, "status": "finalized", **_serialize(result)}

    @app.post("/learning-path/{thread_id}/evidence")
    def submit_evidence(thread_id: str, body: EvidenceBody) -> dict:
        """Trigger tái lập kế hoạch của spec mục 14: evidence mới → chạy lại pipeline
        trên cùng thread (gộp evidence cũ — dedup theo evidence_id trong EvidenceStore),
        path version tăng, bản Draft mới thay bản cũ và chờ duyệt lại."""
        current = _existing_state(thread_id)
        paths = current.get("paths", {})
        next_version = max((p.version for p in paths.values()), default=0) + 1
        result = pipeline.invoke(
            {
                "request": current["request"],
                "raw_quiz": current.get("raw_quiz", []) + body.raw_quiz,
                "raw_paper": current.get("raw_paper", []) + body.raw_paper,
                "as_of": body.as_of,
                "path_version": next_version,
            },
            _config(thread_id),
        )
        return _respond(thread_id, result)

    @app.post("/hints")
    def request_hint(body: HintBody) -> dict:
        if body.topic_id not in curriculum.topics:
            raise HTTPException(status_code=404, detail="topic_id không tồn tại")
        hint = ladder.request_hint(
            body.topic_id,
            press_count=body.press_count,
            chosen_misconception=body.chosen_misconception,
        )
        return hint.model_dump(mode="json")

    return app


def _default_app() -> FastAPI:
    graph_path = os.environ.get("LEARNING_PATH_GRAPH_JSON", str(DEFAULT_GRAPH_JSON))
    checkpointer: BaseCheckpointSaver | None = None
    db_path = os.environ.get("LEARNING_PATH_DB")
    if db_path:
        import sqlite3

        from langgraph.checkpoint.sqlite import SqliteSaver

        checkpointer = SqliteSaver(sqlite3.connect(db_path, check_same_thread=False))
    return create_app(load_chac_goc_graph(graph_path), checkpointer=checkpointer)


# Chỉ dựng app mặc định khi chạy qua uvicorn (import module này trực tiếp);
# create_app(curriculum) là entry point cho test và cho ai muốn graph khác.
try:
    app = _default_app()
except FileNotFoundError:  # môi trường không có graph.json — vẫn import được module
    app = None  # type: ignore[assignment]
