from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse

from question_tagging_backend.app.database import Database
from question_tagging_backend.app.schemas import (
    EffectiveQuestionTopicSet,
    Question,
    TaggingContext,
    UpdateTopicsRequest,
)
from question_tagging_backend.app.seed import seed_demo_data
from question_tagging_backend.app.service import (
    DomainError,
    TaggingService,
    VersionConflict,
)


APP_DIR = Path(__file__).resolve().parent
DEFAULT_DATABASE_PATH = APP_DIR.parent / "data" / "question_tagging.db"


def create_app(database_path: str | Path | None = None) -> FastAPI:
    path = Path(
        database_path
        or os.environ.get("AURORA_TAGGING_DB", str(DEFAULT_DATABASE_PATH))
    )
    database = Database(path)
    service = TaggingService(database)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        database.initialize()
        seed_demo_data(database)
        yield

    app = FastAPI(
        title="Aurora Question Tagging Module",
        version="1.0.0",
        lifespan=lifespan,
    )
    app.state.tagging_service = service

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation_error(
        _: Request, error: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "request_validation_error",
                    "message": "Request payload is invalid.",
                    "details": {"issues": jsonable_encoder(error.errors())},
                }
            },
        )

    @app.exception_handler(DomainError)
    async def handle_domain_error(
        _: Request, error: DomainError
    ) -> JSONResponse:
        body: dict = {
            "error": {
                "code": error.code,
                "message": error.message,
                "details": error.details,
            }
        }
        if isinstance(error, VersionConflict):
            body["latest_context"] = service.get_context(error.question_id).model_dump(
                mode="json"
            )
        return JSONResponse(status_code=error.status_code, content=body)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/questions", response_model=list[Question])
    def list_questions() -> list[Question]:
        return service.list_questions()

    @app.get(
        "/api/questions/{question_id}/tagging-context",
        response_model=TaggingContext,
    )
    def get_tagging_context(question_id: str) -> TaggingContext:
        return service.get_context(question_id)

    @app.put(
        "/api/questions/{question_id}/topics",
        response_model=TaggingContext,
    )
    def set_question_topics(
        question_id: str, payload: UpdateTopicsRequest
    ) -> TaggingContext:
        return service.set_question_topics(question_id, payload)

    @app.put(
        "/api/questions/{question_id}/rubric-items/{rubric_item_id}/topics",
        response_model=TaggingContext,
    )
    def set_rubric_item_topics(
        question_id: str,
        rubric_item_id: str,
        payload: UpdateTopicsRequest,
    ) -> TaggingContext:
        return service.set_rubric_item_topics(question_id, rubric_item_id, payload)

    @app.get(
        "/api/questions/{question_id}/effective-topics",
        response_model=EffectiveQuestionTopicSet,
    )
    def get_effective_topics(question_id: str) -> EffectiveQuestionTopicSet:
        return service.get_effective_topics(question_id)

    @app.get("/", include_in_schema=False)
    def demo() -> FileResponse:
        return FileResponse(APP_DIR / "demo.html", media_type="text/html")

    return app


app = create_app()
