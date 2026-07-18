from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse

from .api import router
from .config import Settings
from .database import Database
from .pipeline import Pipeline
from .storage import LocalStorage


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    database = Database(settings.database_path)
    database.initialize()
    storage = LocalStorage(settings.data_dir)

    app = FastAPI(
        title="Handwritten OCR and Rubric Mapping",
        version="0.1.0",
        description="OCR, rubric evidence mapping, and mandatory teacher review.",
    )
    app.state.settings = settings
    app.state.database = database
    app.state.storage = storage
    app.state.pipeline = Pipeline(database, storage, settings)
    app.include_router(router)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/demo", include_in_schema=False)
    def demo() -> FileResponse:
        return FileResponse(Path(__file__).parent / "templates" / "demo.html")

    return app


app = create_app()
