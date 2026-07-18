# Handwritten OCR and Rubric Mapping Backend Design

## Scope

Build a standalone FastAPI backend for the documented Handwritten OCR and Rubric Mapping module. The backend accepts submissions and files, defaults to teacher-led manual review, and optionally creates OCR and Qwen mapping jobs when the teacher requests AI assistance. It stores maximum points per rubric item, derives the teacher-confirmed score summary from checked criteria, normalizes OCR blocks, validates Qwen mappings, requires teacher review, versions approved mappings, and records audit events. It does not let AI award points, create topic tags, diagnose mastery, or update learning paths.

The standalone service lives under `Real_exam_scoring_backend/`. It includes a small server-rendered HTML/JavaScript demo at `/demo`; it does not modify or connect to the existing frontend.

## Architecture

- FastAPI exposes submission, resumable upload, processing, review, approval, and read APIs.
- SQLite stores module state. Files and raw provider responses are stored below a configurable local data directory.
- OCR and mapping are independent idempotent jobs. A lightweight in-process background runner is sufficient for the local demo; service boundaries allow replacing it with an external queue later.
- `demo` provider mode is deterministic and requires no credentials. `live` mode calls Datalab's current `/api/v1/convert` asynchronous API and an OpenAI-compatible Qwen chat-completions endpoint.
- All teacher-owned routes require `X-Teacher-Id` and `X-Role: teacher`. The demo supplies these headers automatically.

## Data Flow

1. A teacher creates a submission with class, student, assessment template, question, and approved rubric items.
2. Files arrive either through the simple multipart demo endpoint or resumable upload sessions. Checksums prevent duplicate file records.
3. Submissions default to full manual and go directly to review. Only explicitly AI-assisted submissions create an OCR job.
4. The OCR client submits files exactly once for an idempotency key, polls to completion, stores the raw response, and normalizes recursive JSON blocks.
5. A separate mapping job sends the question, unchanged rubric topic tags, and normalized blocks to Qwen. Strict validation rejects missing rubric items, unknown rubric/block IDs, extra topic tags, scores, or explanations.
6. OCR failure switches to full manual. Mapping failure preserves OCR blocks and switches to partial fallback.
7. Teachers save a status and evidence selection for every rubric item. Approval is rejected until all items are `correct`, `incorrect`, or `unanswered`.
8. Approval writes a new immutable version and audit entries. Re-approval creates another version.

## Error Handling and Security

- Request validation limits media types, file size, page numbers, chunk counts, and checksums.
- Provider secrets remain in environment variables and are never returned or logged.
- Provider timeouts, rate limits, and server failures are retryable up to a configured bound; schema and reference errors are not.
- Successful jobs are no-ops when duplicate processing messages arrive.
- Submission access is scoped to the creating teacher in this standalone module.
- Raw OCR responses are stored out of API responses and referenced by path for audit.

## Testing

Tests cover submission idempotency, file deduplication, resumable upload, OCR normalization, strict mapping validation, full-manual behavior, both fallback paths, job idempotency, mandatory complete review, versioned approval, audit logs, and demo availability. Provider clients are exercised with deterministic fakes; no real network or credentials are required.

## Assumptions

- Assessment-template validity is represented by the approved question/rubric snapshot supplied to this isolated module; integration with the source Question Tagging service is deferred.
- Local SQLite and local file storage are suitable for the requested backend demo. Their interfaces are isolated so production database/object storage can replace them.
- The current Datalab Convert API supersedes the deprecated standalone OCR endpoint.
