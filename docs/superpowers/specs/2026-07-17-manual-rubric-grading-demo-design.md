# Manual Rubric Grading Demo Design

## Goal

Make teacher-led manual grading the primary demo flow. A teacher selects the
current assessment and a student, then checks scored rubric criteria for every
question without uploading an image or PDF. OCR + Qwen remains an explicit,
secondary mode and is the only mode that asks for a file.

## Architecture

The existing backend continues to store one submission per student/question.
The demo owns a deterministic assessment/student catalog and orchestrates one
manual submission per question, so the production API does not gain a
demo-specific batch endpoint. Rubric items gain a backward-compatible
`max_points` field, stored in SQLite and returned in submission detail.

For manual grading, a checked criterion is saved as `correct`; an unchecked
criterion is saved as `incorrect`. The demo calculates the visible total from
approved criterion statuses and `max_points`. The backend still stores the
atomic rubric decisions and approval version for each question.

## User Flow

1. The page opens in `full_manual`.
2. The file picker is hidden.
3. The teacher selects the current assessment and student.
4. The page renders every question and its point-bearing rubric checkboxes.
5. The teacher checks achieved criteria and chooses `Lưu và phê duyệt`.
6. The demo creates, processes, reviews, and approves one submission per
   question, then shows the total and backend responses.
7. Selecting `ai_assisted` switches to the existing image/PDF workflow and
   reveals the file picker.

## Validation and Errors

- Assessment and student are required before manual approval.
- Every rubric item is explicitly persisted as `correct` or `incorrect`.
- A failed question stops the batch and identifies the question in the status.
- Repeated clicks are disabled while a save is running.
- `max_points` is constrained to `0..1000` and defaults to `0` for old clients
  and migrated rows.

## Testing

- API tests cover `max_points` persistence, its default, and SQLite migration.
- HTML tests cover manual selectors, the hidden upload panel, and rubric
  checkbox hooks.
- Playwright covers manual grading without a file, score summary, approvals for
  multiple questions, and the optional AI flow with upload.

