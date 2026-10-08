# syntax=docker/dockerfile:1
FROM python:3.13-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /venv
COPY requirements.txt .
RUN /venv/bin/pip install -r requirements.txt

FROM python:3.13-slim
ENV PATH=/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000
RUN useradd --system --uid 10001 --home-dir /app app \
    && mkdir -p /app/data \
    && chown app /app/data
WORKDIR /app
COPY --from=build /venv /venv
COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
USER app

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=3)"

# Migrate and seed (only when the database is empty), then serve. One worker: the
# rate limiter and SQLite writer lock both live in a single process.
CMD ["sh", "-c", "python -m app.seed && exec uvicorn app.main:app --host 127.0.0.1 --port \"$PORT\" --proxy-headers --workers 1"]
