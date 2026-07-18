# Learning Path Step Progress MVP

## Goal

Turn an approved learning path from a static `StepsJSON` snapshot into a trackable learning workflow. The MVP records progress for each step, determines the student's next task, unlocks prerequisites in order, exposes teacher-facing progress data, and emits telemetry for later alerts and gamification.

The student experience stays inside the existing **Lo trinh** area in `/tutor`; this work does not add a new top-level route or navigation tab.

## Scope

### Included

- Persist one progress record per approved learning-path step.
- Support `pending`, `in_progress`, `completed`, and `blocked` states.
- Record attempts, correct answers, hints, and mastery/confidence before and after learning.
- Automatically complete a step when mastery is at least `0.80` and confidence is at least `0.60`.
- Unlock the next eligible step according to prerequisites and path order.
- Show the student completion percentage, next task, and detailed step progress inside the existing learning-path UI.
- Expose a teacher endpoint with completion percentage and blocked-step details.
- Emit step lifecycle telemetry.
- Replace the hard-coded `classID := "class-demo"` approval behavior with the real classroom ID.
- Lazily initialize progress for approved paths created before this feature.

### Not Included

- Automatic path re-planning from new evidence.
- Teacher alerts or alert delivery UI.
- Daily quests, XP, streak changes, or rewards based on these events.
- A detailed misconception profile.
- A new teacher progress screen or a new student route.
- Manual unblock controls.

## Current State

`model.LearningPath` stores the student, class, approval thread, status, and the complete path payload in `StepsJSON`. `ApproveLearningPath` saves one approved path per student but assigns every record to `class-demo`. `GetStudentLearningPath` deserializes and returns the path without persistent step state.

The frontend derives `done`, `current`, and `locked` roadmap states from the approved payload and mastery profile. Answer and hint flows already produce evidence and telemetry, but they do not update a learning-path step record.

## Architecture

Keep `LearningPath.StepsJSON` as the immutable approved-path snapshot and add a relational progress table for mutable state. This separates teacher-approved content/order from frequently changing student progress and allows efficient teacher queries without parsing JSON.

Add a focused learning-path progress service responsible for:

1. Initializing progress from an approved path.
2. Reading student and teacher progress views.
3. Starting an eligible step.
4. Applying answer, hint, cant-do, adaptive-downgrade, and mastery evidence.
5. Completing or blocking a step.
6. Unlocking the next eligible step.
7. Publishing lifecycle telemetry after successful persistence.

Handlers should delegate state transitions to this service rather than writing progress rows directly. Existing answer and hint behavior remains authoritative for grading, activity logs, and mastery calculation; the progress service consumes their results.

## Data Model

Add `LearningPathStepProgress` with these fields:

| Field | Type | Purpose |
| --- | --- | --- |
| `ID` | UUID | Primary key |
| `LearningPathID` | UUID | Approved path owner |
| `StudentID` | UUID | Query and authorization key |
| `TopicID` | UUID | Knowledge node represented by the step |
| `StepKey` | string | Stable key from the path payload when the topic ID alone is insufficient |
| `StepOrder` | int | Approved display and tie-break order |
| `Status` | string | `pending`, `in_progress`, `completed`, or `blocked` |
| `Attempts` | int | Submitted answers for this topic while the path is active |
| `CorrectAnswers` | int | Correct submitted answers |
| `HintCount` | int | Successfully requested/rendered hints |
| `MasteryBefore` | float64 nullable | Mastery when the step first starts |
| `MasteryAfter` | float64 nullable | Latest observed mastery |
| `ConfidenceBefore` | float64 nullable | Confidence when the step first starts |
| `ConfidenceAfter` | float64 nullable | Latest observed confidence |
| `BlockedReason` | string nullable | Stable reason code for UI and future alerts |
| `StartedAt` | timestamp nullable | First transition to `in_progress` |
| `CompletedAt` | timestamp nullable | Latest completion time |
| `BlockedAt` | timestamp nullable | Latest blocked time |
| `LastActivityAt` | timestamp nullable | Latest evidence application |
| `CreatedAt` / `UpdatedAt` | timestamp | Audit timestamps |

Constraints and indexes:

- Unique `(learning_path_id, step_key)` to make initialization and approval retries idempotent.
- Index `(student_id, status)` for the student next-step query.
- Index `(learning_path_id, step_order)` for ordered rendering.
- Foreign-key semantics to the learning path and topic where supported by the current migration strategy.

`StepKey` should use the path-provided step identifier if present; otherwise it uses `topic_id`. Duplicate topic IDs in one approved path are rejected during initialization because counters and mastery evidence cannot distinguish repeated occurrences in the MVP.

## Classroom Resolution Fix

`ApproveLearningPath` must not use `class-demo`. Classroom identity is resolved as follows:

1. Accept `classId` in the teacher approval request and parse it as a UUID.
2. Verify that the authenticated teacher owns the classroom.
3. Verify every student in the approved/custom paths belongs to that classroom.
4. Persist the canonical UUID string in `LearningPath.ClassID` for backward compatibility with the current model.
5. Reject the request before writing any path when ownership or membership validation fails.

The frontend teacher approval call sends the selected classroom ID used to generate the path. If the current generation flow does not yet retain a selected classroom, it must derive one explicitly from the teacher's classroom state rather than falling back to a demo value.

## State Machine

### Initialization

- Create every step as `pending`.
- Evaluate prerequisites using the approved path metadata first and graph edges only when the payload lacks prerequisite data.
- Move the first eligible incomplete step to `in_progress`.
- If a step already satisfies mastery `>= 0.80` and confidence `>= 0.60`, initialize it as `completed` and continue unlocking until the first incomplete eligible step is reached.

### Start

`pending -> in_progress` is allowed only when all prerequisites are completed. Starting is idempotent: starting an already active, completed, or blocked step returns its current representation without incrementing counters.

The first transition to `in_progress` records `MasteryBefore`, `ConfidenceBefore`, and `StartedAt`. Returning from `blocked` to `in_progress` retains the original before snapshots and clears the active blocked reason/time.

### Evidence Updates

- A submitted answer increments `Attempts`; a correct result also increments `CorrectAnswers`.
- A successful hint request/render increments `HintCount` once. Backend persistence is the source of truth so frontend telemetry retries cannot double-count hints.
- Cant-do and adaptive downgrade are explicit struggle evidence.
- Every evidence update refreshes `MasteryAfter`, `ConfidenceAfter`, and `LastActivityAt` from the latest persisted mastery state when available.
- Missing or temporarily unavailable mastery data does not fail a valid answer or hint request; counters persist and threshold evaluation waits for the next evidence update.

### Completion

A step becomes `completed` when both conditions are true:

- mastery `>= 0.80`
- confidence `>= 0.60`

Completion records `CompletedAt`, clears blocked fields, and evaluates all later steps in approved order. The first step whose prerequisites are completed becomes `in_progress`. Other incomplete steps remain `pending`.

### Blocked

A non-completed active step becomes `blocked` when either condition is met:

- It has at least three attempts and `correctAnswers / attempts < 0.50`.
- It receives explicit cant-do or adaptive-downgrade evidence.

Use stable reason codes: `low_accuracy`, `cant_do`, and `adaptive_downgrade`. A blocked step remains the student's next task and does not unlock dependent steps.

New evidence may move `blocked -> in_progress` when the blocking condition no longer holds. It may move directly to `completed` when the mastery/confidence threshold is reached.

## Transactions and Concurrency

Initialization, evidence application, completion, and unlock decisions run in database transactions. The service locks the relevant progress rows when supported by the database. Counter updates must be atomic to prevent concurrent submissions from losing increments.

Telemetry is published only after the transaction commits. A telemetry publishing failure is logged but does not roll back student progress.

Approving a replacement path creates the new approved snapshot and its progress rows transactionally. Existing approved paths for the same student and classroom are superseded rather than destructively deleting progress history. The existing `LearningPath.Status` values should be extended with a terminal `Superseded` status for this purpose.

## API Design

### Student Learning Path

`GET /student/learning-path` remains backward compatible and adds:

```json
{
  "id": "learning-path-uuid",
  "classId": "classroom-uuid",
  "ordered_steps": [],
  "progress": {
    "completedSteps": 2,
    "totalSteps": 5,
    "completionPercent": 40,
    "nextStep": {},
    "blockedSteps": [],
    "steps": []
  }
}
```

Each progress step contains the status, counters, mastery/confidence snapshots, timestamps, and blocked reason. It may include the approved step payload needed by the UI but must not expose unrelated student data.

When no approved path exists, return the current compatible empty shape with `ordered_steps: []` and an empty progress summary.

### Start Step

`POST /student/learning-path/steps/:topicId/start`

- Uses the authenticated student ID.
- Operates on the latest active approved learning path.
- Returns `404` when no path/step exists, `409` when prerequisites are incomplete, and the current step for idempotent repeats.

### Teacher Progress

`GET /teacher/students/:studentId/learning-path/progress?classId=:classId`

- Requires teacher authentication.
- Verifies classroom ownership and student membership.
- Returns path metadata, completion percentage, the active/blocked step, and ordered step details.
- Returns an empty progress representation when the student has no approved path in the classroom.

## Integration With Evidence Sources

### Answer Submission

After `SubmitAnswer` has persisted the normal activity/evidence and the latest mastery recalculation has completed, call the progress service with student ID, topic ID, correctness, and the latest mastery state. If mastery recalculation is asynchronous or not part of the current answer call, apply counters immediately and reconcile thresholds from the persisted mastery table during the same request or a subsequent evidence event.

Progress update failures should be logged and surfaced as server errors only when the answer transaction itself cannot be safely committed. The implementation plan must preserve the existing answer response contract.

### Hints

After a hint is successfully produced, increment the matching active step once and publish progress telemetry. Failed hint generation emits the existing failure telemetry but does not increment `HintCount`.

### Cant-Do and Adaptive Downgrade

After their existing state changes commit, pass an explicit blocking signal to the progress service with the appropriate stable reason code.

## Telemetry

Add these event schemas:

- `learning_path_step_started`
- `learning_path_step_progressed`
- `learning_path_step_completed`
- `learning_path_step_blocked`

Required shared properties:

- `learning_path_id`
- `topic_id`
- `step_order`
- `status_before`
- `status_after`
- `attempt_count`
- `correct_count`
- `hint_count`

Progressed/completed/blocked events also include mastery and confidence when known. Blocked events require `blocked_reason`. Events use the existing actor publisher with actor role `student`, source `go_backend`, and no question content, answer content, or free-form hint text.

## Student UI

Enhance the existing learning-path section in `frontend/src/app/tutor/page.tsx` or extract a focused component if the current file would grow materially.

The panel contains:

1. A completion header with percentage and completed/total steps.
2. A **Viec can lam tiep theo** card showing the first blocked step, otherwise the active step, with mastery, confidence, and a start/continue action.
3. The ordered roadmap with status badges for pending, in progress, completed, and blocked.
4. Per-step evidence: attempts, correct answers, hints, and mastery movement where available.
5. A blocked explanation mapped from stable backend reason codes.

The start/continue action selects the topic in the existing learning workspace and invokes the idempotent start endpoint before navigation when needed. Completed steps remain selectable for review. Pending steps with unmet prerequisites remain disabled.

Loading uses the established tutor UI patterns. If the progress extension fails but the approved `ordered_steps` payload is available, the frontend falls back to the current derived roadmap and displays a non-blocking retry message. It must not invent persisted counters.

The layout must remain usable on desktop and mobile without adding a separate route.

## Teacher Data Use

This MVP provides the teacher endpoint but does not add a teacher screen. The response is intentionally shaped for a later addition to the existing teacher Learning Path tab: completion percentage, current or blocked step, last activity, and ordered details.

## Error Handling

- Invalid classroom, path, topic, or membership data returns a typed `400`, `403`, `404`, or `409` response as appropriate.
- Malformed approved path payloads fail approval before partial persistence.
- Duplicate topic steps fail validation with an actionable error.
- Progress initialization is idempotent and safe to retry.
- Missing mastery evidence never fabricates zero as a measured before/after snapshot; nullable values remain null.
- Telemetry failure never blocks learning.
- Database transition failures do not leave a completed step without its unlock decision because both occur in one transaction.

## Compatibility and Migration

Register the new model with the repository's existing GORM migration path. Existing `LearningPath` rows remain readable.

On `GET /student/learning-path` and the teacher progress endpoint, if an approved path has no progress rows, initialize them from `StepsJSON` under a transaction and then return the persisted representation. This avoids a one-off backfill requirement for the MVP.

The API retains `ordered_steps` so the current tutor hub and other consumers continue to work while adopting the new `progress` object incrementally.

## Testing Strategy

### Backend Unit Tests

- Initialization creates one row per step and is idempotent.
- Initial mastered steps become completed and unlock the correct next step.
- Start rejects unmet prerequisites and accepts eligible/idempotent starts.
- Correct and incorrect answers update counters atomically.
- Hints increment only after successful generation.
- Completion requires both mastery `0.80` and confidence `0.60`, including exact-boundary cases.
- Three attempts below 50 percent accuracy block a step; exactly 50 percent does not.
- Cant-do and adaptive downgrade block with the correct reason.
- Improved evidence moves blocked to in-progress or completed.
- Completing a step unlocks only eligible prerequisites in approved order.
- Concurrent/retried initialization does not create duplicates.
- Replacement approval supersedes the old path without deleting its progress history.

### Handler and Integration Tests

- Approval uses the real classroom and rejects unauthorized/mismatched students.
- Student GET returns the compatible empty shape and the extended progress shape.
- Legacy approved paths are lazily initialized.
- Student start authorization and response codes are correct.
- Teacher progress enforces classroom ownership and membership.
- Answer, hint, cant-do, and adaptive-downgrade flows call progress updates.
- Lifecycle telemetry contains required properties and excludes question/hint content.

### Frontend Tests

- Renders completion percentage and completed/total values.
- Selects blocked step before active step for the next-task card.
- Renders all four statuses and evidence counters.
- Maps blocked reason codes to understandable Vietnamese text.
- Start/continue selects the topic and handles API errors without losing the roadmap.
- Falls back to the current derived roadmap when the progress extension is unavailable.
- Remains usable at representative desktop and mobile widths.

### Verification

- Run focused Go package tests during development, then `go test ./...` from `backend`.
- Run focused frontend tests, lint, and the repository's production build command.
- Exercise the student flow in a browser: approve a real-class path, start a step, answer and request hints, cross the threshold, observe unlock, and verify blocked rendering.

## Acceptance Criteria

1. Approving a learning path stores the real classroom ID and initializes persistent step progress.
2. A student can see completion percentage, evidence counters, statuses, and the next task inside the existing learning-path UI.
3. Answers, successful hints, cant-do, and adaptive downgrade update the matching active step.
4. A step completes only at mastery `>= 0.80` and confidence `>= 0.60`.
5. Completion unlocks the next prerequisite-eligible step in approved order.
6. The blocked heuristic and reason are persisted and visible to the student.
7. A teacher-authorized API returns completion percentage and blocked/current step information.
8. Step lifecycle telemetry is emitted without sensitive learning content.
9. Existing approved paths and existing `ordered_steps` consumers remain functional.
10. Relevant backend and frontend tests pass.
