# Synthetic Exam History Design

## Goal

Seed realistic historical exams and grading results for the existing synthetic teacher and students whenever the Go backend starts with synthetic data enabled. Existing APIs and teacher UI must display the fixtures without frontend changes or hardcoded API responses.

## Scope

- Add two historical exams owned by `synthetic.teacher@aurora.local`.
- Include one single-choice exam and one essay or mixed-format exam.
- Create a completed, approved scoring submission for every synthetic student on both exams.
- Preserve the existing reset-on-start behavior and `ENABLE_SYNTHETIC_DATA` flag.
- Do not add pages, tabs, controls, or synthetic-only branches to the UI.

## Seed Scenario

The synthetic scenario contains three students with deliberately different outcomes so class data looks credible:

- Student A performs strongly and answers most objective questions correctly.
- Student B has mixed objective results and partial essay rubric achievement.
- Student C has weaker results, including at least one unanswered objective question and missed rubric criteria.

The exams use past timestamps with the objective exam older than the essay exam. Titles, instructions, question content, choices, and rubric descriptions are deterministic so every backend restart restores the same scenario.

## Data Model

Each historical exam must create the complete graph expected by the current exam and scoring domains:

1. `Exam` with the teacher as owner and a grading-compatible completed state.
2. `ExamQuestion` rows with topic associations. Single-choice questions include choices and a correct choice; essay questions include rubric items.
3. A grading-lock `ExamSnapshot` containing the canonical exam detail used by scoring.
4. One `GradingBatch` per student and exam, matching the existing individual-session constraint.
5. One approved `ScoringSubmission` per batch.
6. `ScoringQuestionResult` rows for every question and `ScoringRubricResult` rows for every essay rubric item.
7. `ScoringApprovalSnapshot` and relevant `ScoringAuditLog` records so history endpoints behave like genuinely reviewed work.
8. Completed grading progress for each historical exam.

Question totals are derived from question results. Essay question results are derived from their rubric results. Submission totals equal the sum of question totals; no independent mastery or score percentage is hardcoded into API handlers.

## Integration Boundary

Historical fixtures belong in `backend/internal/syntheticseed`. The startup entry point continues to call the existing reset-and-seed operation; it does not gain exam-specific orchestration. Seed creation runs in the same database transaction as the rest of the synthetic scenario so partial historical data cannot survive a failed startup.

Synthetic cleanup must delete the historical scoring graph in dependency order before recreating it. Cleanup is limited to records owned by or linked to synthetic users and deterministic synthetic exam identifiers.

## Existing UI Behavior

No frontend changes are required. The current endpoints must expose the fixtures:

- `GET /teacher/exams` returns the historical synthetic exams when their status matches the existing scoring workspace filter.
- `GET /teacher/grading-batches` returns completed batches.
- `GET /teacher/grading-batches/:id` and `GET /teacher/scoring-submissions/:id` return each student's approved results.
- `GET /teacher/scoring-submissions/:id/history` returns the seeded approval history.

If the existing exam-list status contract prevents completed historical exams from appearing in `ExamScoringTab`, the implementation may adjust only the backend status/query compatibility needed for existing UI consumption. It must not add a new UI surface.

## Error Handling

- Synthetic seeding remains fail-fast: any invalid relationship, snapshot, score, or database operation aborts startup with the existing wrapped error path.
- Deterministic IDs and reset-before-seed behavior make repeated startup idempotent.
- Score construction uses the domain score parser and exact decimal values.

## Testing

Implementation follows test-first development:

- A scenario test first fails until two historical exams are defined with both single-choice and essay content.
- An integration seed test first fails until every synthetic student has an approved submission for both exams.
- Assertions verify question and rubric result coverage, approval snapshots, past timestamps, and differing student outcomes.
- Assertions verify each essay question score equals its rubric-derived score and each submission score equals the sum of question scores.
- Startup tests verify disabling synthetic data still skips all fixtures.
- Relevant Go package tests and backend test suite run before completion.

## Out of Scope

- New teacher or student pages.
- A separate exam-history tab.
- Changes to real-user data.
- Random fixture generation.
- Hardcoded synthetic results in frontend code or API handlers.
