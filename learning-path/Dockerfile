FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/learning-path/src \
    PATH=/app/learning-path/.venv/bin:$PATH

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY learning-path/pyproject.toml learning-path/uv.lock learning-path/README.md /app/learning-path/
COPY learning-path/src /app/learning-path/src
COPY knowledge-graph/data/graph.json /app/knowledge-graph/data/graph.json

RUN uv sync --project /app/learning-path --frozen --no-dev

CMD ["sh", "-c", "exec uvicorn learning_path.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
