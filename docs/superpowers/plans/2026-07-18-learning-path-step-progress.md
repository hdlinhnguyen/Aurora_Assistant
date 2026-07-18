# Learning Path Step Progress MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-step learning-path progress, complete and unlock steps from mastery evidence, expose student/teacher progress APIs, and render progress inside the existing student learning-path panel.

**Architecture:** Keep `LearningPath.StepsJSON` as the approved snapshot and add a relational progress table. A focused `backend/internal/learningpath` service owns parsing, transactions, state transitions, classroom-safe approval, reads, and telemetry; existing tutor flows feed it answer, hint, cant-do, and adaptive-downgrade evidence.

**Tech Stack:** Go 1.26, Fiber v3, GORM/Postgres, existing mastery/telemetry packages, Next.js 16, React 19, TypeScript, Vitest, Testing Library.

## Global Constraints

- Preserve `GET /student/learning-path` and top-level `ordered_steps`.
- Complete only when mastery is at least `0.80` and confidence is at least `0.60`.
- Statuses are exactly `pending`, `in_progress`, `completed`, and `blocked`.
- Block after three attempts with accuracy below `0.50`, `cant_do`, or `adaptive_downgrade`.
- Remove production use of `class-demo`; validate teacher ownership and student membership.
- Never emit question content, answer content, or hint text in step telemetry.
- Preserve unrelated files in the shared dirty worktree and stage feature files explicitly.
- Use TDD and commit each independently testable slice.

---

## File Structure

### Create

- `backend/internal/model/learning_path_models.go` — relational progress model.
- `backend/internal/learningpath/domain.go` — statuses, thresholds, errors, payload/view types, pure transitions.
- `backend/internal/learningpath/domain_test.go` — threshold and blocked-state tests.
- `backend/internal/learningpath/service.go` — transactional initialization, reads, approval, evidence, unlock, telemetry.
- `backend/internal/learningpath/service_test.go` — persistence/state-machine tests.
- `backend/internal/handler/learning_path_progress.go` — start-step and teacher-progress handlers.
- `backend/internal/handler/learning_path_progress_test.go` — Fiber authorization/status tests.
- `backend/internal/service/tutor_learning_path_progress_test.go` — evidence integration tests.
- `frontend/src/app/tutor/components/LearningPathProgress.tsx` — student summary/timeline.
- `frontend/src/app/tutor/components/LearningPathProgress.test.tsx` — component behavior tests.
- `frontend/src/app/teacher/components/LearningPathTab.test.tsx` — real-class selector/payload tests.

### Modify

- `backend/internal/config/db.go`, `backend/internal/config/db_test.go` — migrate/assert progress model.
- `backend/internal/telemetry/schema.go` — four lifecycle event schemas.
- `backend/internal/service/tutor_service.go`, `backend/internal/service/tutor_adaptive.go` — inject and apply evidence.
- `backend/internal/handler/tutor.go` — real classroom approval, compatible student GET, hint/struggle evidence.
- `backend/cmd/server/main.go` — service construction and routes.
- `frontend/src/app/tutor/hub/api.ts` — typed progress response/start call.
- `frontend/src/app/tutor/page.tsx` — render and refresh progress inside “Lộ trình học”.
- `frontend/src/app/teacher/page.tsx`, `frontend/src/app/teacher/components/LearningPathTab.tsx` — classroom selection and request payloads.

---

### Task 1: Progress Model and Pure Domain Rules

**Files:**
- Create: `backend/internal/model/learning_path_models.go`
- Create: `backend/internal/learningpath/domain.go`
- Create: `backend/internal/learningpath/domain_test.go`
- Modify: `backend/internal/config/db.go`
- Modify: `backend/internal/config/db_test.go`

**Interfaces:**
- Produces `model.LearningPathStepProgress`.
- Produces `learningpath.NextStatus(...)`, status constants, threshold constants, evidence constants, payload/view types, and typed errors.

- [ ] **Step 1: Write the failing threshold and blocked tests**

```go
func TestNextStatusRequiresMasteryAndConfidence(t *testing.T) {
    tests := []struct {
        name string
        mastery, confidence float64
        want string
    }{
        {"mastery low", .79, .99, StatusInProgress},
        {"confidence low", .80, .59, StatusInProgress},
        {"exact boundary", .80, .60, StatusCompleted},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            got := NextStatus(StatusInProgress, 3, 1, "", tt.mastery, tt.confidence)
            require.Equal(t, tt.want, got)
        })
    }
}

func TestNextStatusBlocksOnlyBelowHalfAfterThreeAttempts(t *testing.T) {
    require.Equal(t, StatusBlocked, NextStatus(StatusInProgress, 3, 1, "", .40, .40))
    require.Equal(t, StatusInProgress, NextStatus(StatusInProgress, 4, 2, "", .40, .40))
    require.Equal(t, StatusBlocked, NextStatus(StatusInProgress, 0, 0, BlockedReasonCantDo, .40, .40))
}
```

- [ ] **Step 2: Verify failure**

Run from `backend`: `go test ./internal/learningpath -run TestNextStatus -v`.

Expected: FAIL because the package/functions do not exist.

- [ ] **Step 3: Implement the model**

```go
type LearningPathStepProgress struct {
    ID uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
    LearningPathID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_learning_path_step_key;index:idx_learning_path_step_order" json:"learningPathId"`
    StudentID uuid.UUID `gorm:"type:uuid;not null;index:idx_student_path_status" json:"studentId"`
    TopicID uuid.UUID `gorm:"type:uuid;not null" json:"topicId"`
    StepKey string `gorm:"type:varchar(200);not null;uniqueIndex:idx_learning_path_step_key" json:"stepKey"`
    StepOrder int `gorm:"not null;index:idx_learning_path_step_order" json:"stepOrder"`
    Status string `gorm:"type:varchar(20);not null;index:idx_student_path_status" json:"status"`
    Attempts int `gorm:"not null;default:0" json:"attempts"`
    CorrectAnswers int `gorm:"not null;default:0" json:"correctAnswers"`
    HintCount int `gorm:"not null;default:0" json:"hintCount"`
    MasteryBefore *float64 `json:"masteryBefore"`
    MasteryAfter *float64 `json:"masteryAfter"`
    ConfidenceBefore *float64 `json:"confidenceBefore"`
    ConfidenceAfter *float64 `json:"confidenceAfter"`
    BlockedReason *string `gorm:"type:varchar(40)" json:"blockedReason"`
    StartedAt, CompletedAt, BlockedAt, LastActivityAt *time.Time
    CreatedAt, UpdatedAt time.Time
}
```

- [ ] **Step 4: Implement domain types and transition precedence**

Completion wins first; explicit reason/low accuracy blocks second; otherwise a previously blocked step returns to `in_progress`. Define `PathStepPayload` with `topic_id`, `order`, optional `step_key`, and optional `prerequisite_topic_ids`. Define `ApplyEvidenceInput` with student/topic IDs, evidence kind, correctness, nullable mastery/confidence, and reason.

- [ ] **Step 5: Register migration and test it**

Add `&model.LearningPathStepProgress{}` to `migrationModels()` and assert its reflected type in `db_test.go`.

Run: `go test ./internal/learningpath ./internal/config -v`.

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/model/learning_path_models.go backend/internal/learningpath/domain.go backend/internal/learningpath/domain_test.go backend/internal/config/db.go backend/internal/config/db_test.go
git commit -m "feat: add learning path progress domain"
```

### Task 2: Transactional Progress Service

**Files:**
- Create: `backend/internal/learningpath/service.go`
- Create: `backend/internal/learningpath/service_test.go`
- Modify: `backend/internal/learningpath/domain.go`

**Interfaces:**
- Produces `NewService(db *gorm.DB, publisher telemetry.ActorPublisher, mastery MasteryReader) *Service`.
- Produces `Initialize(context.Context, *model.LearningPath) error`.
- Produces `GetStudentProgress(context.Context, uuid.UUID) (LearningPathProgressView, error)`.
- Produces `GetTeacherProgress(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) (LearningPathProgressView, error)`.
- Produces `StartStep(context.Context, uuid.UUID, uuid.UUID) (ProgressStepView, error)`.
- Produces `ApplyEvidence(context.Context, ApplyEvidenceInput) (ProgressStepView, error)`.
- Produces `ApprovePaths(context.Context, uuid.UUID, uuid.UUID, string, map[string]any) error`.

- [ ] **Step 1: Write failing service tests**

Use the repository Postgres test helper/pattern and migrate `User`, `Classroom`, `LearningPath`, `LearningPathStepProgress`, `Node`, `Edge`, and `StudentTopicMastery`.

```go
func TestApplyEvidenceCompletesAndUnlocksNextStep(t *testing.T) {
    db := setupLearningPathDB(t)
    studentID, path, topics := seedApprovedPath(t, db, 3)
    svc := NewService(db, nil, fakeMasteryReader{})
    require.NoError(t, svc.Initialize(context.Background(), &path))

    got, err := svc.ApplyEvidence(context.Background(), ApplyEvidenceInput{
        StudentID: studentID, TopicID: topics[0], Kind: EvidenceAnswer,
        Correct: true, Mastery: ptr(.80), Confidence: ptr(.60),
    })
    require.NoError(t, err)
    require.Equal(t, StatusCompleted, got.Status)

    var next model.LearningPathStepProgress
    require.NoError(t, db.Where("learning_path_id = ? AND step_order = ?", path.ID, 2).First(&next).Error)
    require.Equal(t, StatusInProgress, next.Status)
}
```

Also test duplicate initialization, malformed JSON, duplicate topic IDs, blocked preference for next task, exact 50% not blocked, cant-do/adaptive reasons, and legacy lazy initialization.

- [ ] **Step 2: Verify failure**

Run: `go test ./internal/learningpath -run 'TestApplyEvidence|TestInitialize|TestApprovePaths' -v`.

Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement parsing and initialization**

Decode `ordered_steps`; reject malformed/duplicate topics. In a transaction, create rows with `ON CONFLICT DO NOTHING`, determine prerequisites from payload or active graph edges, mark already-qualified steps completed, and activate the first eligible incomplete step.

- [ ] **Step 4: Implement student/teacher reads**

Load the latest `Approved` path, lazily initialize missing rows, order by `step_order`, calculate integer completion percentage, choose first blocked step as `nextStep` before first in-progress step, and return the original ordered payload plus progress views. Teacher reads must verify classroom ownership and student membership.

- [ ] **Step 5: Implement idempotent start**

Lock the target/path rows. Reject missing path/step and incomplete prerequisites with typed errors. On first start, snapshot mastery/confidence and timestamps. Repeated starts return current state without increments.

- [ ] **Step 6: Implement atomic evidence and unlock**

Increment answer/hint counters, update nullable after snapshots, evaluate transition, store stable blocked reason/timestamps, and unlock only the first prerequisite-eligible subsequent step in the same transaction.

- [ ] **Step 7: Implement safe approval**

Verify teacher owns the class and every path key is a student in that class. Mark old approved rows `Superseded`, create new paths with `ClassID: classID.String()`, initialize all step rows, and roll back the entire class batch on any validation/write failure.

- [ ] **Step 8: Publish telemetry after commit**

Map transitions to `learning_path_step_started`, `learning_path_step_progressed`, `learning_path_step_completed`, or `learning_path_step_blocked`. Include IDs, order, before/after status, counters, optional mastery/confidence, and blocked reason. Log publisher failure without rollback.

- [ ] **Step 9: Run and commit**

Run: `go test ./internal/learningpath -v`.

Expected: PASS.

```bash
git add backend/internal/learningpath
git commit -m "feat: persist learning path step progress"
```

### Task 3: Telemetry Schema and Evidence Integration

**Files:**
- Modify: `backend/internal/telemetry/schema.go`
- Modify: `backend/internal/service/tutor_service.go`
- Modify: `backend/internal/service/tutor_adaptive.go`
- Modify: `backend/internal/handler/tutor.go`
- Create: `backend/internal/service/tutor_learning_path_progress_test.go`
- Modify: `backend/internal/handler/tutor_telemetry_test.go`

**Interfaces:**
- Consumes a narrow `LearningPathProgressUpdater` whose `ApplyEvidence` signature matches Task 2.
- Preserves all existing answer, hint, cant-do, and adaptive response contracts.

- [ ] **Step 1: Write failing fake-updater tests**

```go
type fakeProgressUpdater struct {
    inputs []learningpath.ApplyEvidenceInput
}
func (f *fakeProgressUpdater) ApplyEvidence(_ context.Context, in learningpath.ApplyEvidenceInput) (learningpath.ProgressStepView, error) {
    f.inputs = append(f.inputs, in)
    return learningpath.ProgressStepView{}, nil
}
```

Assert correct/incorrect answers, successful hints, cant-do, and adaptive downgrade create the correct evidence kind/reason; failed hints do not increment.

- [ ] **Step 2: Verify failure**

Run: `go test ./internal/service ./internal/handler -run 'LearningPathProgress|RequestHint|SubmitAnswer' -v`.

Expected: FAIL because no dependency/calls exist.

- [ ] **Step 3: Add optional dependency injection**

Add `WithLearningPathProgress(updater LearningPathProgressUpdater)` to the appropriate Tutor option. A nil updater must keep existing tests and runtime behavior valid.

- [ ] **Step 4: Apply evidence after primary persistence**

Call the updater after answer activity is saved, after successful hint generation, and after successful cant-do/adaptive operations. Log updater errors; do not change the primary API response or fabricate counters from frontend telemetry.

- [ ] **Step 5: Register event schemas**

Require shared properties `learning_path_id`, `topic_id`, `step_order`, `status_before`, `status_after`, `attempt_count`, `correct_count`, and `hint_count`; blocked events additionally require `blocked_reason`. Add schema validation tests.

- [ ] **Step 6: Run and commit**

Run: `go test ./internal/service ./internal/handler ./internal/telemetry -run 'LearningPathProgress|Telemetry|Schema' -v`.

Expected: PASS.

```bash
git add backend/internal/telemetry/schema.go backend/internal/service/tutor_service.go backend/internal/service/tutor_adaptive.go backend/internal/handler/tutor.go backend/internal/service/tutor_learning_path_progress_test.go backend/internal/handler/tutor_telemetry_test.go
git commit -m "feat: update path progress from learning evidence"
```

### Task 4: Student and Teacher Progress APIs

**Files:**
- Create: `backend/internal/handler/learning_path_progress.go`
- Create: `backend/internal/handler/learning_path_progress_test.go`
- Modify: `backend/internal/handler/tutor.go`
- Modify: `backend/cmd/server/main.go`

**Interfaces:**
- Produces `POST /student/learning-path/steps/:topicId/start`.
- Produces `GET /teacher/students/:studentId/learning-path/progress?classId=:classId`.
- Extends existing `GET /student/learning-path` with `progress` while preserving `ordered_steps`.

- [ ] **Step 1: Write failing Fiber tests**

Test authenticated student ID, invalid UUID (`400`), unmet prerequisites (`409`), teacher out-of-scope (`403`), empty compatible response, and successful summary fields.

- [ ] **Step 2: Verify failure**

Run: `go test ./internal/handler -run LearningPathProgress -v`.

Expected: FAIL because handlers are absent.

- [ ] **Step 3: Implement typed error mapping**

Map invalid input to `400`, forbidden ownership to `403`, missing path/step to `404`, and unmet prerequisite to `409`. Never accept student identity from request JSON.

- [ ] **Step 4: Replace direct student GET parsing**

Delegate to `GetStudentProgress`; merge original `ordered_steps` with `id`, `classId`, and `progress`. When no path exists, return `ordered_steps: []` and an empty progress summary.

- [ ] **Step 5: Wire dependencies and routes**

Construct the progress service after mastery/telemetry services in `main.go`, inject it into tutor wiring, and register both new routes beside current learning-path routes.

- [ ] **Step 6: Run and commit**

Run: `go test ./internal/handler ./cmd/server -run 'LearningPathProgress|SyntheticStartup' -v`.

Expected: PASS.

```bash
git add backend/internal/handler/learning_path_progress.go backend/internal/handler/learning_path_progress_test.go backend/internal/handler/tutor.go backend/cmd/server/main.go
git commit -m "feat: expose learning path progress APIs"
```

### Task 5: Real Classroom Approval

**Files:**
- Modify: `backend/internal/handler/tutor.go`
- Modify: `frontend/src/app/teacher/page.tsx`
- Modify: `frontend/src/app/teacher/components/LearningPathTab.tsx`
- Create: `frontend/src/app/teacher/components/LearningPathTab.test.tsx`

**Interfaces:**
- Teacher generation and approval bodies both contain `classId: string`.
- Backend approval delegates persistence to `ApprovePaths`.

- [ ] **Step 1: Write failing regression tests**

Backend tests reject missing/invalid/not-owned class IDs and mismatched students. Frontend tests select a classroom and assert generated/approved payloads contain its UUID and not `class-demo`.

- [ ] **Step 2: Verify failure**

Run backend: `go test ./internal/handler -run 'ApproveLearningPath|Classroom' -v`.

Run frontend: `npm test -- --run src/app/teacher/components/LearningPathTab.test.tsx`.

Expected: FAIL while production uses `class-demo`.

- [ ] **Step 3: Load and persist classroom selection**

Fetch `/teacher/classrooms`, restore `aurora_teacher_classroom` when valid, otherwise choose the first classroom, and pass classroom props to `LearningPathTab`. Disable path actions with a Vietnamese explanation if no classroom exists.

- [ ] **Step 4: Send real IDs in both requests**

Update `handleGenerateLearningPath` and `handleApproveLearningPath` request bodies. Preserve target topics, custom paths, telemetry, and toast behavior.

- [ ] **Step 5: Replace direct backend writes**

Parse `classId` from approval JSON and call `ApprovePaths(teacherID, classID, threadID, pathsToSave)` after FastAPI approval. Remove `config.DB.Where(...).Delete` and `classID := "class-demo"`.

- [ ] **Step 6: Verify and commit**

Run: `rg -n 'class-demo' backend frontend` and expect no production match. Re-run focused tests; expected PASS.

```bash
git add backend/internal/handler/tutor.go frontend/src/app/teacher/page.tsx frontend/src/app/teacher/components/LearningPathTab.tsx frontend/src/app/teacher/components/LearningPathTab.test.tsx
git commit -m "fix: attach learning paths to real classrooms"
```

### Task 6: Typed Student Progress Component

**Files:**
- Modify: `frontend/src/app/tutor/hub/api.ts`
- Create: `frontend/src/app/tutor/components/LearningPathProgress.tsx`
- Create: `frontend/src/app/tutor/components/LearningPathProgress.test.tsx`

**Interfaces:**
- Produces `LearningPathProgressResponse`, `LearningPathStepProgress`, and `startLearningPathStep(topicId)`.
- Component props are `progress`, `nodeNames`, `onStart`, and optional `startingTopicId`.

- [ ] **Step 1: Write failing rendering/action tests**

Render 2/5 completion, blocked-first next task, all four badges, attempts/correct/hints, mastery/confidence percentages, reason labels, enabled active/blocked actions, and disabled pending actions.

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run src/app/tutor/components/LearningPathProgress.test.tsx`.

Expected: FAIL because types/component are absent.

- [ ] **Step 3: Add API types and start call**

```ts
export const startLearningPathStep = (topicId: string) =>
  apiFetch(`/student/learning-path/steps/${topicId}/start`, {
    method: "POST",
  }) as Promise<LearningPathStepProgress>;
```

Keep `ordered_steps` in the response type and make `progress` optional for compatibility.

- [ ] **Step 4: Implement the component**

Use the established tutor colors/typography, a compact completion bar, “Việc cần làm tiếp theo” card, ordered timeline, evidence chips, and Vietnamese mappings for `low_accuracy`, `cant_do`, and `adaptive_downgrade`. Keep it usable within the current sidebar on desktop/mobile.

- [ ] **Step 5: Run and commit**

Run the focused Vitest command; expected PASS.

```bash
git add frontend/src/app/tutor/hub/api.ts frontend/src/app/tutor/components/LearningPathProgress.tsx frontend/src/app/tutor/components/LearningPathProgress.test.tsx
git commit -m "feat: render student learning path progress"
```

### Task 7: Integrate Inside Existing “Lộ Trình Học”

**Files:**
- Modify: `frontend/src/app/tutor/page.tsx`
- Modify: `frontend/src/app/tutor/components/LearningPathProgress.test.tsx`

**Interfaces:**
- Consumes extended `getLearningPath()` and `startLearningPathStep()`.
- Reuses `handleNodeClick`, `loadLearningPath`, answer/hint/cant-do flows, and current fallback cards.

- [ ] **Step 1: Add failing integration assertions**

Test that the path branch renders the progress component, invokes start before node selection, and still renders legacy `ordered_steps` when `progress` is absent.

- [ ] **Step 2: Verify failure**

Run: `npm test -- --run src/app/tutor/components/LearningPathProgress.test.tsx`.

Expected: FAIL until page wiring exists.

- [ ] **Step 3: Type state and render progress first**

Replace `any` learning-path state with `LearningPathProgressResponse | null`, derive topic names from `nodes`, and place `LearningPathProgress` above existing step cards inside `activeTab === "path"`.

- [ ] **Step 4: Implement start/continue**

Call the start endpoint, update local progress or reload it, then find the topic and call `handleNodeClick`. On `409`, reload and show the existing API error/toast without opening a locked node.

- [ ] **Step 5: Refresh after evidence**

After successful answer, hint, cant-do, and adaptive downgrade operations, invoke `loadLearningPath()` alongside mastery/log refresh. Guard overlapping GETs so stale responses do not overwrite newer progress.

- [ ] **Step 6: Run tests and browser check**

Run focused tests. Then use the webapp-testing workflow to check desktop and narrow widths, loading/error fallback, blocked card, and timeline interaction.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/tutor/page.tsx frontend/src/app/tutor/components/LearningPathProgress.test.tsx
git commit -m "feat: integrate progress into student learning path"
```

### Task 8: Full Verification

**Files:**
- Modify only feature-owned files for fixes found by verification.

**Interfaces:**
- Validates all design acceptance criteria and backward compatibility.

- [ ] **Step 1: Format and test backend**

Run from `backend`:

```bash
gofmt -w internal/model/learning_path_models.go internal/learningpath internal/handler/learning_path_progress.go
go test ./...
```

Expected: exit 0.

- [ ] **Step 2: Test and build frontend**

Run from `frontend`:

```bash
npm test -- --run
npm run lint
npm run build
```

Expected: exit 0. If the configured `next lint` command is unsupported by this Next version, report that existing script failure and run the repository's direct ESLint equivalent without changing unrelated lint configuration.

- [ ] **Step 3: Static scans**

Run from repository root:

```bash
rg -n 'class-demo' backend frontend
rg -n 'learning_path_step_(started|progressed|completed|blocked)' backend frontend
git diff --check
```

Expected: no production `class-demo`; all four events present; no whitespace errors.

- [ ] **Step 4: End-to-end smoke**

Approve a path for a real class, open the student path, start the next step, answer/request a hint, cross the `0.80/0.60` boundary in seeded data, confirm completion/unlock, then trigger cant-do and confirm blocked rendering.

- [ ] **Step 5: Commit verification fixes only**

```bash
git add backend/internal/model/learning_path_models.go backend/internal/learningpath backend/internal/config/db.go backend/internal/config/db_test.go backend/internal/telemetry/schema.go backend/internal/service/tutor_service.go backend/internal/service/tutor_adaptive.go backend/internal/service/tutor_learning_path_progress_test.go backend/internal/handler/tutor.go backend/internal/handler/tutor_telemetry_test.go backend/internal/handler/learning_path_progress.go backend/internal/handler/learning_path_progress_test.go backend/cmd/server/main.go frontend/src/app/tutor/hub/api.ts frontend/src/app/tutor/page.tsx frontend/src/app/tutor/components/LearningPathProgress.tsx frontend/src/app/tutor/components/LearningPathProgress.test.tsx frontend/src/app/teacher/page.tsx frontend/src/app/teacher/components/LearningPathTab.tsx frontend/src/app/teacher/components/LearningPathTab.test.tsx
git commit -m "test: verify learning path progress MVP"
```

Do not stage the concurrent icon/demo changes.

---

## Self-Review

- **Spec coverage:** Tasks 1-2 cover persistence/state transitions/lazy initialization; Task 3 covers evidence/telemetry; Task 4 covers student/teacher APIs; Task 5 fixes classroom identity; Tasks 6-7 add progress inside the existing student path; Task 8 verifies compatibility.
- **Plan completeness:** Every task names exact files, interfaces, commands, expected outcomes, and concrete test/implementation behavior.
- **Type consistency:** `ApplyEvidenceInput`, `ProgressStepView`, `LearningPathProgressView`, `LearningPathProgressUpdater`, `LearningPathProgressResponse`, and `startLearningPathStep` have one spelling throughout.
- **Scope:** Re-planning, alerts, XP/streaks, misconception profiles, and new routes/tabs in the student UI remain out of scope.
