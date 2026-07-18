from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse

from .config import Settings
from .database import Database
from .seed import seed_database
from .api import internal_router, router
from .errors import DomainError
from .services import ExamService
from .schemas import FirstSubmissionEvent, GradingCompletedEvent


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings.from_env()
    config.export_dir.mkdir(parents=True, exist_ok=True)
    database = Database(config.db_path)
    database.initialize(Path(__file__).with_name("schema.sql"))
    seed_database(database)
    app = FastAPI(title="Aurora Create Exam Backend")
    app.state.settings = config
    app.state.database = database
    app.state.exam_service = ExamService(database, config.export_dir)
    app.include_router(router)
    app.include_router(internal_router)

    @app.exception_handler(DomainError)
    def domain_error(_request: Request, error: DomainError):
        return JSONResponse(
            status_code=error.status,
            content={
                "error": {
                    "code": error.code,
                    "message": error.message,
                    "details": error.details,
                }
            },
        )

    @app.get("/health")
    def health() -> dict[str, int | str]:
        with database.connect() as connection:
            topics = connection.execute("SELECT COUNT(*) FROM topics").fetchone()[0]
            questions = connection.execute(
                "SELECT COUNT(*) FROM question_bank_questions"
            ).fetchone()[0]
        return {
            "status": "ready",
            "topics": topics,
            "question_bank_questions": questions,
        }

    @app.get("/")
    def demo():
        return FileResponse(Path(__file__).with_name("demo.html"))

    @app.get("/api/demo-config")
    def demo_config():
        return {
            "demo_mode": config.demo_mode,
            "teacher_id": "teacher-demo" if config.demo_mode else None,
        }

    @app.post("/demo/exams/{exam_id}/simulate-first-submission")
    def simulate_first_submission(exam_id: str):
        if not config.demo_mode:
            raise HTTPException(404, "Demo mode is disabled")
        return app.state.exam_service.first_submission(
            exam_id,
            f"demo-first-{uuid4()}",
            FirstSubmissionEvent(total_submissions=1),
        )

    @app.post("/demo/exams/{exam_id}/simulate-grading-completed")
    def simulate_grading_completed(exam_id: str):
        if not config.demo_mode:
            raise HTTPException(404, "Demo mode is disabled")
        return app.state.exam_service.grading_completed(
            exam_id,
            f"demo-grading-{uuid4()}",
            GradingCompletedEvent(
                total_submissions=1,
                graded_submissions=1,
                scored_submissions=1,
            ),
        )

    return app


app = create_app()
