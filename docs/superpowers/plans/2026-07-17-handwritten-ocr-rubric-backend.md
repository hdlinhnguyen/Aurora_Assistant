# Handwritten OCR and Rubric Mapping Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable, tested FastAPI backend and embedded HTML demo for handwritten OCR and rubric mapping.

**Architecture:** A FastAPI application uses SQLite and local file storage, with separate OCR/mapping services and injectable demo/live providers. Processing is queued through FastAPI background tasks for the demo while preserving idempotent job boundaries.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic 2, sqlite3, httpx, Pillow, pytest.

## Global Constraints

- Do not connect or modify the existing frontend.
- Do not calculate scores, generate topic tags, or diagnose mastery.
- Every final mapping requires teacher review.
- Datalab and Qwen credentials remain server-side.

---

### Task 1: Domain, persistence, and submission intake

**Files:**
- Create: `Real_exam_scoring_backend/app/config.py`
- Create: `Real_exam_scoring_backend/app/database.py`
- Create: `Real_exam_scoring_backend/app/schemas.py`
- Create: `Real_exam_scoring_backend/tests/test_submissions.py`

**Interfaces:**
- Produces: `Settings`, `Database`, submission and rubric request/response schemas.

- [ ] Write failing API tests for authenticated creation, idempotency, ownership, and full-manual state.
- [ ] Run the focused tests and confirm failures are caused by the missing application.
- [ ] Implement schema initialization, repository operations, request validation, and intake routes.
- [ ] Run the focused tests and confirm they pass.

### Task 2: File intake and resumable upload

**Files:**
- Create: `Real_exam_scoring_backend/app/storage.py`
- Create: `Real_exam_scoring_backend/tests/test_uploads.py`
- Modify: `Real_exam_scoring_backend/app/api.py`

**Interfaces:**
- Produces: checksum-deduplicated `SubmissionFile` records and resumable upload sessions.

- [ ] Write failing tests for multipart upload, duplicate checksums, chunk resume, and checksum rejection.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Implement bounded local storage, multipart upload, chunk status, part upload, and completion.
- [ ] Run the focused tests and confirm they pass.

### Task 3: OCR and mapping pipeline

**Files:**
- Create: `Real_exam_scoring_backend/app/providers.py`
- Create: `Real_exam_scoring_backend/app/normalizer.py`
- Create: `Real_exam_scoring_backend/app/pipeline.py`
- Create: `Real_exam_scoring_backend/tests/test_pipeline.py`

**Interfaces:**
- Produces: `DatalabClient`, `QwenClient`, demo providers, `normalize_datalab`, and `Pipeline.process`.

- [ ] Write failing tests for recursive OCR normalization, valid mappings, schema rejection, fallbacks, reruns, and idempotency.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Implement demo/live providers, strict mapping validation, raw-response storage, job transitions, and fallback behavior.
- [ ] Run the focused tests and confirm they pass.

### Task 4: Teacher review, approval, and audit

**Files:**
- Create: `Real_exam_scoring_backend/tests/test_review.py`
- Modify: `Real_exam_scoring_backend/app/api.py`
- Modify: `Real_exam_scoring_backend/app/database.py`

**Interfaces:**
- Produces: draft review upsert and immutable versioned approval endpoints.

- [ ] Write failing tests for incomplete reviews, evidence validation, approval methods, versions, and audit logs.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Implement review persistence, authorization, approval validation, version snapshots, and audit records.
- [ ] Run the focused tests and confirm they pass.

### Task 5: Embedded demo and operational documentation

**Files:**
- Create: `Real_exam_scoring_backend/app/templates/demo.html`
- Create: `Real_exam_scoring_backend/tests/test_demo.py`
- Create: `Real_exam_scoring_backend/pyproject.toml`
- Create: `Real_exam_scoring_backend/.env.example`
- Create: `Real_exam_scoring_backend/README.md`

**Interfaces:**
- Produces: `GET /demo`, runnable package metadata, environment reference, and startup instructions.

- [ ] Write a failing smoke test for the demo page and health endpoint.
- [ ] Run the test and confirm expected failure.
- [ ] Add the demo workflow, health endpoint, packaging, and run documentation.
- [ ] Run all tests, compile checks, and a local HTTP smoke test.
