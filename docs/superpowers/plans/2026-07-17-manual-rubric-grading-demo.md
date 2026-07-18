# Manual Rubric Grading Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let teachers grade every question in the current assessment with scored rubric checkboxes and no upload, while keeping OCR + Qwen optional.

**Architecture:** Preserve one backend submission per question and let the demo orchestrate the assessment batch. Add backward-compatible `max_points` storage to rubric items; keep file upload exclusively in the AI-assisted branch.

**Tech Stack:** FastAPI, Pydantic, SQLite, server-rendered HTML/CSS/JavaScript, pytest, Playwright.

## Global Constraints

- `full_manual` remains the API and demo default.
- Manual grading must never require an uploaded file.
- OCR + Qwen must remain available only through explicit `ai_assisted` selection.
- Do not connect or modify the main frontend.

---

### Task 1: Persist rubric points

**Files:**
- Modify: `Real_exam_scoring_backend/app/schemas.py`
- Modify: `Real_exam_scoring_backend/app/database.py`
- Modify: `Real_exam_scoring_backend/app/api.py`
- Test: `Real_exam_scoring_backend/tests/test_submissions.py`
- Test: `Real_exam_scoring_backend/tests/test_migrations.py`

**Interfaces:**
- Consumes: `SubmissionCreate.rubric_items`.
- Produces: `RubricItemInput.max_points: float` and `rubric_items.max_points`.

- [ ] Add failing API assertions that supplied `max_points` is returned and omitted `max_points` defaults to `0`.
- [ ] Add a failing migration test for a legacy `rubric_items` table without `max_points`.
- [ ] Run the targeted tests and confirm failures mention the missing field/column.
- [ ] Add the bounded schema field, SQLite column/migration, and insert parameter.
- [ ] Re-run the targeted tests and confirm they pass.

### Task 2: Build the manual assessment workspace

**Files:**
- Modify: `Real_exam_scoring_backend/app/templates/demo.html`
- Test: `Real_exam_scoring_backend/tests/test_demo.py`

**Interfaces:**
- Consumes: existing submission/process/review/approve endpoints.
- Produces: `#assessment`, `#student`, `#manual-workspace`,
  `.manual-rubric-checkbox`, and `#approve-manual`.

- [ ] Add failing HTML assertions for assessment/student selectors, manual
  rubric checkbox hooks, and an upload panel hidden by default.
- [ ] Run the demo test and confirm it fails against the old single-question UI.
- [ ] Add a deterministic assessment catalog with multiple questions and
  point-bearing rubric items.
- [ ] Implement manual batch creation, explicit review status persistence,
  approval, score summary, busy state, and actionable error copy.
- [ ] Keep the existing AI-assisted upload/review path behind its mode selector.
- [ ] Re-run the demo unit tests and confirm they pass.

### Task 3: Verify browser behavior and documentation

**Files:**
- Modify: `Real_exam_scoring_backend/tests/browser_demo_smoke.py`
- Modify: `Real_exam_scoring_backend/README.md`
- Modify: `module_documentation/Handwritten OCR and Rubric Mapping/README.md`

**Interfaces:**
- Consumes: DOM hooks and API behavior from Tasks 1–2.
- Produces: an end-to-end regression check for both processing modes.

- [ ] Change the manual browser scenario to select assessment/student, check
  rubric criteria, approve without setting a file, and assert the score plus
  multiple approved submissions.
- [ ] Keep an AI-assisted scenario that reveals upload and completes review.
- [ ] Document manual no-upload behavior, scored rubric criteria, and optional
  OCR + Qwen.
- [ ] Run pytest with coverage, Ruff, compileall, and Playwright on a dedicated
  port; require zero failures and no browser console/page errors.
