# Khang Into Duong Semantic Merge Design

## Goal

Merge all relevant work from `origin/khang` into `duong` without modifying or
moving the `khang` branch. Resolve conflicts semantically so the merged system
uses Khang's UI and interaction design while retaining Duong's newer backend,
data, assessment, and mastery architecture.

## Source and Target

- Source: `origin/khang` at `b7d4064`
- Target: `duong`
- Common ancestor: `e753913`
- The source branch remains untouched. Only `duong` receives a merge commit.
- Existing uncommitted files in the main checkout are preserved outside the
  merge through a temporary stash.

## Priority Rules

### UI conflicts

Khang wins for visual layout, navigation, interaction structure, LaTeX
rendering, Socratic workspace behavior, and responsive presentation.

Duong behavior must then be reattached to that UI:

- persisted BKT mastery and history;
- teacher individual-student profile;
- student self-only mastery API;
- exam creation and individual grading;
- real-exam scoring;
- question tagging and structured API errors.

Hard-coded or inferred mastery values from Khang must not replace persisted BKT
values from Duong.

### Backend and data conflicts

Duong wins for Go services, routes, PostgreSQL models, migrations,
authorization, scoring, exams, tagging, and Python mastery calculation.

Khang backend additions are included only when they add a non-duplicate
Socratic, LaTeX, graph-export, or UI-support capability.

### Documentation conflicts

Keep the union of valid setup and feature documentation. When descriptions
disagree with executable code, update the text to match the merged behavior.

## Known Conflict Files

### `.gitignore`

Keep the union of ignore rules. Preserve `.worktrees/`, exam exports, local
environment files, build artifacts, and uploaded-document patterns.

### `backend/cmd/server/main.go`

Keep Duong's service construction and all mastery, exam, scoring, tagging, and
guardrail routes. Add Khang-only routes or startup behavior when they do not
duplicate existing endpoints.

### `frontend/src/app/components/KnowledgeTree.tsx`

Use Khang's preferred visual and interaction structure. Preserve these Duong
interfaces and behaviors:

- `masteryByTopic?: Record<string, TopicMastery>`;
- a visible `BKT N%` badge;
- mastery status dot/color;
- existing teacher, student, and view-only modes;
- node selection callbacks used by teacher and student profile panels.

Locked/current/completed state remains distinct from BKT status.

### `frontend/src/app/teacher/components/QuestionBankTab.tsx`

Use Khang's UI arrangement while retaining Duong's question types, rubrics,
topic tagging controls, structured error handling, and exam-bank integration.

### `frontend/src/app/teacher/page.tsx`

Use Khang's page layout and interaction flow as the presentation baseline.
Reintegrate Duong's teacher modules and state:

- exam builder and exam scoring tabs;
- question tagging panel;
- `StudentMasteryProfile` for individual learners;
- mastery matrix and activity feed;
- personalized learning-path generation and approval;
- guardrail/monitoring behavior already present in Duong.

No existing Duong teacher module may disappear merely because Khang's page did
not contain it.

### `frontend/src/app/tutor/page.tsx`

Use Khang's Socratic workspace, LaTeX rendering, drawer behavior, and page
layout. Preserve or reattach:

- `GET /student/mastery` profile loading;
- `masteryByTopic` passed to `KnowledgeTree`;
- persisted mastery/confidence gauges;
- `StudentMasteryDashboard` history panel;
- learning-path and hint behavior;
- all auth and API error handling from Duong.

Delete Khang's `getBktScoreForNode` constants and any fallback that presents a
fabricated mastery percentage as BKT.

### `frontend/src/lib/api.ts`

Keep Duong's structured `ApiError`, retry behavior, authentication handling,
and Vietnamese error mapping. Add Khang behavior only if it preserves those
contracts.

## Khang-Only Files

Include Khang-only source and assets that implement the requested UI,
Socratic, LaTeX, or graph-export features. Do not add documentation-only
references to absent `knowledge-graph/lib/engine.ts` or `lib/store.ts` as if
they were operational.

The `knowledge-graph` seeded mastery schema is a demo data format, not a second
source of truth. PostgreSQL `student_topic_masteries` remains authoritative.

## Mastery Invariants

The merge must preserve:

- weighted/soft-evidence BKT in Python;
- separate mastery probability and confidence score;
- current and immutable history tables in PostgreSQL;
- stale-version protection;
- teacher and student read APIs;
- student identity derived from the token;
- missing evidence displayed as no data, never as a confirmed gap.

## Conflict Resolution Process

1. Merge `origin/khang` into an isolated branch created from current `duong`.
2. Accept Khang UI as the initial conflict shape for frontend page files.
3. Reapply Duong interfaces and functional modules in small, reviewable edits.
4. Accept Duong backend/data as the initial conflict shape for Go and API files.
5. Add Khang-only backend support selectively.
6. Search for conflict markers, hard-coded BKT values, duplicate routes, and
   removed teacher modules.
7. Run all verification before merging the integration branch into `duong`.

## Verification

- Python: full `learning-path` pytest suite.
- Go: full `backend/internal/...` tests with PostgreSQL.
- Frontend: existing smoke tests plus production build.
- Merge-specific smoke checks:
  - Khang LaTeX/Socratic UI markers are present;
  - Duong mastery APIs and components are still mounted;
  - exam/scoring/tagging teacher modules remain mounted;
  - no hard-coded BKT score function remains;
  - no unresolved conflict markers remain.
- When local services are available, run the teacher/student mastery integration
  script.

## Completion

After the integration branch passes verification, merge it into `duong`, rerun
the verification suite on `duong`, restore the user's uncommitted files, and
push only `duong`. Do not push, reset, or rewrite `khang`.
