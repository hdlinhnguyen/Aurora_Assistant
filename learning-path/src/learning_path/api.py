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
import json
from time import perf_counter
import urllib.request
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.types import Command
from pydantic import BaseModel, Field

from learning_path.adapters import CurriculumGraph, load_chac_goc_graph
from learning_path.bkt import BKTParams, ConfidenceConfig, knowledge_state
from learning_path.evidence import EvidenceStore, calibrate_paper, calibrate_quiz
from learning_path.hints import HintLadder
from learning_path.mastery_api import (
    MasteryCalculationBody,
    MasteryCalculationResponse,
    calculate_mastery,
)
from learning_path.schemas import (
    LearningPathRequest,
    LearningPathSuggestionRequest,
    LearningPathSuggestionResponse,
    RawPaperEvidence,
    RawQuizEvidence,
    Topic,
    PrerequisiteEdge,
)
from learning_path.suggestions import suggest_from_states
from learning_path.telemetry import learning_path_metadata

# parents[3] = repo root (api.py → learning_path → src → learning-path → root)
DEFAULT_GRAPH_JSON = Path(__file__).resolve().parents[3] / "knowledge-graph" / "data" / "graph.json"


class CreatePathBody(BaseModel):
    request: LearningPathRequest
    raw_quiz: list[RawQuizEvidence] | None = Field(default_factory=list)
    raw_paper: list[RawPaperEvidence] | None = Field(default_factory=list)
    as_of: datetime


class SuggestPathBody(BaseModel):
    request: LearningPathSuggestionRequest
    raw_quiz: list[RawQuizEvidence] | None = Field(default_factory=list)
    raw_paper: list[RawPaperEvidence] | None = Field(default_factory=list)
    as_of: datetime


class ApproveBody(BaseModel):
    approve: bool
    note: str = ""


class EvidenceBody(BaseModel):
    raw_quiz: list[RawQuizEvidence] | None = Field(default_factory=list)
    raw_paper: list[RawPaperEvidence] | None = Field(default_factory=list)
    as_of: datetime


class HintBody(BaseModel):
    topic_id: str
    press_count: int = Field(ge=1)
    chosen_misconception: str | None = None


DEFAULT_MINUTES_BY_CAP = {"TH": 25, "THCS": 35, "THPT": 45}


def fetch_dynamic_graph() -> CurriculumGraph:
    url = os.environ.get("GO_BACKEND_GRAPH_URL", "http://localhost:8082/api/internal/graph")
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            raw = json.loads(response.read().decode('utf-8'))
            
        topics: dict[str, Topic] = {}
        edges: list[PrerequisiteEdge] = []
        for node in raw["nodes"]:
            topics[node["id"]] = Topic(
                topic_id=node["id"],
                subject_id="toan",
                grade_level=node["lop"],
                name=node["ten"],
                estimated_learning_time=DEFAULT_MINUTES_BY_CAP.get(node["cap"], 30),
                content_available=not node["mo"],
                learning_outcomes=node.get("yccd", []),
            )
            for prereq_id in node["tienQuyet"]:
                edges.append(
                    PrerequisiteEdge(prerequisite_topic_id=prereq_id, dependent_topic_id=node["id"])
                )

        return CurriculumGraph(topics, edges)
    except Exception as e:
        print(f"Failed to fetch dynamic graph from {url}: {e}. Falling back to static graph.json")
        from learning_path.adapters import load_chac_goc_graph
        from pathlib import Path
        DEFAULT_GRAPH_JSON = Path(__file__).resolve().parents[3] / "knowledge-graph" / "data" / "graph.json"
        return load_chac_goc_graph(DEFAULT_GRAPH_JSON)


def create_app(
    initial_curriculum: CurriculumGraph | None = None, *, checkpointer: BaseCheckpointSaver | None = None
) -> FastAPI:
    # import trễ để test không cần build pipeline khi chỉ import schemas
    from langgraph.checkpoint.memory import InMemorySaver
    from learning_path.graph import build_pipeline

    app = FastAPI(title="learning-path", version="0.1.1")
    checkpointer_to_use = checkpointer or InMemorySaver()

    def get_curriculum() -> CurriculumGraph:
        if initial_curriculum is not None:
            return initial_curriculum
        return fetch_dynamic_graph()

    def _config(thread_id: str) -> dict:
        return {"configurable": {"thread_id": thread_id}}

    def _serialize(state: dict) -> dict:
        insight = state.get("class_insight")
        return {
            "paths": {
                sid: p.model_dump(mode="json") for sid, p in state.get("paths", {}).items()
            },
            "class_insight": insight.model_dump(mode="json") if insight else None,
        }

    def _respond(thread_id: str, result: dict, latency_ms: int = 0) -> dict:
        interrupts = result.get("__interrupt__", [])
        return {
            "thread_id": thread_id,
            "status": "awaiting_approval" if interrupts else "finalized",
            "interrupt": interrupts[0].value if interrupts else None,
            "decision_metadata": learning_path_metadata(result.get("paths", {}), latency_ms),
            **_serialize(result),
        }

    @app.post("/learning-path")
    def create_learning_path(body: CreatePathBody) -> dict:
        thread_id = uuid.uuid4().hex
        started = perf_counter()
        curr = get_curriculum()
        pipeline = build_pipeline(curr, checkpointer=checkpointer_to_use)
        result = pipeline.invoke(
            {
                "request": body.request,
                "raw_quiz": body.raw_quiz or [],
                "raw_paper": body.raw_paper or [],
                "as_of": body.as_of,
                "path_version": 1,
            },
            _config(thread_id),
        )
        return _respond(thread_id, result, round((perf_counter() - started) * 1000))

    @app.post(
        "/learning-path/suggestions", response_model=LearningPathSuggestionResponse
    )
    def suggest_learning_paths(body: SuggestPathBody) -> LearningPathSuggestionResponse:
        curr = get_curriculum()
        calibrated = [calibrate_quiz(e, as_of=body.as_of) for e in body.raw_quiz or []]
        calibrated += [calibrate_paper(e, as_of=body.as_of) for e in body.raw_paper or []]
        store = EvidenceStore()
        store.ingest(calibrated)
        params = BKTParams()
        confidence = ConfidenceConfig()
        states_by_student = {
            student_id: {
                topic_id: knowledge_state(
                    student_id,
                    topic_id,
                    evidences,
                    params=params,
                    config=confidence,
                )
                for topic_id, evidences in store.active_by_topic(student_id).items()
            }
            for student_id in body.request.student_ids
        }
        try:
            return suggest_from_states(
                body.request, states_by_student, curr, body.as_of
            )
        except ValueError as error:
            code = str(error)
            raise HTTPException(
                status_code=422,
                detail={"code": code, "message": "Khong the tao goi y lo trinh"},
            ) from error

    @app.post("/learning-path/{thread_id}/approve")
    def approve_learning_path(thread_id: str, body: ApproveBody) -> dict:
        curr = get_curriculum()
        pipeline = build_pipeline(curr, checkpointer=checkpointer_to_use)
        
        snapshot = pipeline.get_state(_config(thread_id))
        if not snapshot.values:
            raise HTTPException(status_code=404, detail="thread_id không tồn tại")
            
        result = pipeline.invoke(
            Command(resume={"approve": body.approve, "note": body.note}), _config(thread_id)
        )
        return {
            "thread_id": thread_id,
            "status": "finalized",
            "decision_metadata": learning_path_metadata(result.get("paths", {}), 0),
            **_serialize(result),
        }

    @app.post("/learning-path/{thread_id}/evidence")
    def submit_evidence(thread_id: str, body: EvidenceBody) -> dict:
        """Trigger tái lập kế hoạch của spec mục 14: evidence mới → chạy lại pipeline
        trên cùng thread (gộp evidence cũ — dedup theo evidence_id trong EvidenceStore),
        path version tăng, bản Draft mới thay bản cũ và chờ duyệt lại."""
        curr = get_curriculum()
        pipeline = build_pipeline(curr, checkpointer=checkpointer_to_use)
        
        snapshot = pipeline.get_state(_config(thread_id))
        if not snapshot.values:
            raise HTTPException(status_code=404, detail="thread_id không tồn tại")
            
        current = snapshot.values
        paths = current.get("paths", {})
        next_version = max((p.version for p in paths.values()), default=0) + 1
        result = pipeline.invoke(
            {
                "request": current["request"],
                "raw_quiz": current.get("raw_quiz", []) + (body.raw_quiz or []),
                "raw_paper": current.get("raw_paper", []) + (body.raw_paper or []),
                "as_of": body.as_of,
                "path_version": next_version,
            },
            _config(thread_id),
        )
        return _respond(thread_id, result)

    @app.post("/hints")
    def request_hint(body: HintBody) -> dict:
        curr = get_curriculum()
        if body.topic_id not in curr.topics:
            raise HTTPException(status_code=404, detail="topic_id không tồn tại")
        ladder = HintLadder(curr)
        hint = ladder.request_hint(
            body.topic_id,
            press_count=body.press_count,
            chosen_misconception=body.chosen_misconception,
        )
        return hint.model_dump(mode="json")

    @app.post("/mastery/calculate", response_model=MasteryCalculationResponse)
    def calculate_mastery_endpoint(body: MasteryCalculationBody) -> MasteryCalculationResponse:
        return calculate_mastery(body)

    return app


def _default_app() -> FastAPI:
    checkpointer: BaseCheckpointSaver | None = None
    db_path = os.environ.get("LEARNING_PATH_DB")
    if db_path:
        import sqlite3

        from langgraph.checkpoint.sqlite import SqliteSaver

        checkpointer = SqliteSaver(sqlite3.connect(db_path, check_same_thread=False))
    return create_app(checkpointer=checkpointer)


try:
    app = _default_app()
except Exception as e:
    print(f"Failed to initialize app: {e}")
    app = None
