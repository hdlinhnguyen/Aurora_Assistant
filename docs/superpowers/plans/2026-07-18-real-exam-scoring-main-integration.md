# Real Exam Scoring Main Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the manual whole-exam grading workflow into the main Go/PostgreSQL backend and expose it through a focused teacher-dashboard tab in the Next.js frontend.

**Architecture:** Add a bounded `internal/scoring` domain that reads the immutable `grading_lock` snapshot produced by `internal/exam`, stores one whole-exam submission per student, calculates every score server-side, and versions approvals. Create a batch and lock its exam atomically through an in-process exam gateway; record monotonic progress through the same gateway rather than loopback HTTP.

**Tech Stack:** Go 1.26.3, Fiber v3, GORM, PostgreSQL 16, `shopspring/decimal` through `model.Score`, `stretchr/testify`, Next.js 16, React 19, TypeScript 5.9, Tailwind CSS, Vitest, React Testing Library, Python Playwright.

## Global Constraints

- Complete and verify create-exam implementation Tasks 1–9 before starting Task 3 of this plan.
- Required create-exam interfaces are `model.Score`, `exam.Detail`, `exam.Service.FirstSubmission`, `exam.Service.GradingCompleted`, teacher exam HTTP APIs, typed `examApi`, and `teacherNavigation`.
- Main runtime is Go/Fiber/GORM/PostgreSQL plus Next.js; `Real_exam_scoring_backend` remains reference-only.
- Grading is manual only. Do not add upload, OCR, Datalab, Qwen, evidence blocks, provider modes, or Python runtime dependencies.
- One grading batch owns one immutable `grading_lock` snapshot and the complete student list for one exam.
- One scoring submission represents the whole exam for one student.
- Teacher identity always comes from JWT `sub`; never trust teacher identity or awarded points from request bodies.
- Student selection is limited to `User` records whose role is exactly `student`; class/enrollment is out of scope.
- Scores use `model.Score` and exact decimal arithmetic; never use `float32` or `float64`.
- Every result mutation requires `expectedVersion` and increments submission version exactly once.
- Initial `unanswered` with `Reviewed=false` is distinct from explicit `unanswered` with `Reviewed=true`.
- Approval snapshots are immutable. Revisions never delete or overwrite older approvals.
- Preserve existing user changes and the independent Python module.
- Do not rewrite, rebase, amend, squash, or force-push published history.

## Dependency Gate

Before Task 3, run:

```powershell
cd backend
go test ./internal/exam ./internal/model -count=1
cd ../frontend
npm test
npx tsc --noEmit
```

Expected:

- `internal/exam` contains working question/rubric authoring, validation,
  `FirstSubmission`, `GradingCompleted`, handlers, and routes.
- `frontend/src/features/exams/` and
  `frontend/src/app/teacher/navigation.ts` exist.
- All commands exit 0.

If the create-exam implementation changed the public names above, update only
the adapter signatures in Task 3 and the imported frontend exam types in Task
7. Do not duplicate create-exam data or bypass its state machine.

## File Structure

Backend:

- `backend/internal/model/scoring_models.go`: GORM persistence models only.
- `backend/internal/scoring/domain.go`: public inputs, outputs, statuses, and
  stable errors.
- `backend/internal/scoring/snapshot.go`: parse and validate grading snapshot.
- `backend/internal/scoring/calculator.go`: pure score derivation.
- `backend/internal/scoring/repository.go`: PostgreSQL queries and row locks.
- `backend/internal/scoring/service.go`: batch creation and read operations.
- `backend/internal/scoring/results.go`: autosave result mutations.
- `backend/internal/scoring/approval.go`: approval, revision, progress, and
  immutable history.
- `backend/internal/exam/scoring_gateway.go`: narrow in-process adapter over
  exam lock/progress behavior.
- `backend/internal/handler/scoring.go`: Fiber transport.

Frontend:

- `frontend/src/features/scoring/types.ts`: API contracts.
- `frontend/src/features/scoring/api.ts`: typed HTTP client.
- `frontend/src/features/scoring/errors.ts`: stable error-to-UX mapping.
- `frontend/src/app/teacher/components/ExamScoringTab.tsx`: orchestration only.
- `frontend/src/app/teacher/components/scoring/*.tsx`: focused UI units.

---

### Task 1: Scoring persistence models and migration

**Files:**

- Create: `backend/internal/model/scoring_models.go`
- Create: `backend/internal/model/scoring_models_test.go`
- Modify: `backend/internal/config/db.go`

**Interfaces:**

- Consumes: `model.Score`, `model.Exam`, `model.ExamSnapshot`, and `model.User`.
- Produces: seven scoring GORM models and their PostgreSQL constraints.

- [ ] **Step 1: Write the failing migration test**

Create `backend/internal/model/scoring_models_test.go`:

```go
package model_test

import (
    "testing"

    "backend/internal/model"
    "backend/internal/testutil"

    "github.com/stretchr/testify/require"
)

func TestScoringModelsMigrateWithExpectedConstraints(t *testing.T) {
    db := testutil.OpenPostgres(t)
    require.NoError(t, db.AutoMigrate(
        &model.User{},
        &model.Exam{},
        &model.ExamQuestion{},
        &model.ExamRubricItem{},
        &model.ExamSnapshot{},
        &model.GradingBatch{},
        &model.ScoringSubmission{},
        &model.ScoringQuestionResult{},
        &model.ScoringRubricResult{},
        &model.ScoringApprovalSnapshot{},
        &model.ScoringAuditLog{},
        &model.ScoringInternalEvent{},
    ))

    for _, table := range []string{
        "grading_batches",
        "scoring_submissions",
        "scoring_question_results",
        "scoring_rubric_results",
        "scoring_approval_snapshots",
        "scoring_audit_logs",
        "scoring_internal_events",
    } {
        require.Truef(t, db.Migrator().HasTable(table), "missing table %s", table)
    }
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
cd backend
go test ./internal/model -run TestScoringModels -v
```

Expected: compile failure because the seven scoring models do not exist.

- [ ] **Step 3: Implement the persistence models**

Create `backend/internal/model/scoring_models.go` with these exact types:

```go
package model

import (
    "time"

    "github.com/google/uuid"
)

const (
    GradingBatchStatusGrading   = "grading"
    GradingBatchStatusCompleted = "completed"

    ScoringSubmissionStatusGrading  = "grading"
    ScoringSubmissionStatusApproved = "approved"
    ScoringSubmissionStatusRevision = "revision"

    ScoringResultCorrect    = "correct"
    ScoringResultIncorrect  = "incorrect"
    ScoringResultUnanswered = "unanswered"
)

type GradingBatch struct {
    ID                  uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
    ExamID              uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex" json:"examId"`
    ExamSnapshotID      uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex" json:"examSnapshotId"`
    CreatedBy           uuid.UUID  `gorm:"type:uuid;not null;index:idx_grading_batch_owner_status,priority:1" json:"createdBy"`
    Status              string     `gorm:"type:varchar(20);not null;index:idx_grading_batch_owner_status,priority:2" json:"status"`
    TotalSubmissions    int        `gorm:"not null;check:chk_batch_total,total_submissions > 0" json:"totalSubmissions"`
    ApprovedSubmissions int        `gorm:"not null;default:0;check:chk_batch_approved,approved_submissions >= 0 AND approved_submissions <= total_submissions" json:"approvedSubmissions"`
    CreatedAt           time.Time  `json:"createdAt"`
    CompletedAt         *time.Time `json:"completedAt"`
    Exam                Exam       `gorm:"foreignKey:ExamID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
    ExamSnapshot        ExamSnapshot `gorm:"foreignKey:ExamSnapshotID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
    Creator             User       `gorm:"foreignKey:CreatedBy;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
}

type ScoringSubmission struct {
    ID                       uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
    GradingBatchID           uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_batch_student,priority:1;index:idx_submission_batch_status,priority:1" json:"gradingBatchId"`
    StudentID                uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_batch_student,priority:2" json:"studentId"`
    Status                   string     `gorm:"type:varchar(20);not null;index:idx_submission_batch_status,priority:2" json:"status"`
    Version                  int        `gorm:"not null;default:1" json:"version"`
    AwardedPoints            Score      `gorm:"not null" json:"awardedPoints"`
    EffectiveApprovalVersion int        `gorm:"not null;default:0" json:"effectiveApprovalVersion"`
    ApprovedBy               *uuid.UUID `gorm:"type:uuid" json:"approvedBy"`
    ApprovedAt               *time.Time `json:"approvedAt"`
    CreatedAt                time.Time  `json:"createdAt"`
    UpdatedAt                time.Time  `json:"updatedAt"`
    Batch                    GradingBatch `gorm:"foreignKey:GradingBatchID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
    Student                  User       `gorm:"foreignKey:StudentID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
}

type ScoringQuestionResult struct {
    SubmissionID  uuid.UUID `gorm:"type:uuid;primaryKey" json:"submissionId"`
    ExamQuestionID uuid.UUID `gorm:"type:uuid;primaryKey" json:"examQuestionId"`
    Status        string    `gorm:"type:varchar(20);not null" json:"status"`
    Reviewed      bool      `gorm:"not null;default:false" json:"reviewed"`
    AwardedPoints Score     `gorm:"not null" json:"awardedPoints"`
    UpdatedBy     uuid.UUID `gorm:"type:uuid;not null" json:"updatedBy"`
    UpdatedAt     time.Time `json:"updatedAt"`
    Submission    ScoringSubmission `gorm:"foreignKey:SubmissionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
    ExamQuestion  ExamQuestion `gorm:"foreignKey:ExamQuestionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
}

type ScoringRubricResult struct {
    SubmissionID   uuid.UUID `gorm:"type:uuid;primaryKey" json:"submissionId"`
    ExamRubricItemID uuid.UUID `gorm:"type:uuid;primaryKey" json:"examRubricItemId"`
    Status         string    `gorm:"type:varchar(20);not null" json:"status"`
    Reviewed       bool      `gorm:"not null;default:false" json:"reviewed"`
    AwardedPoints  Score     `gorm:"not null" json:"awardedPoints"`
    UpdatedBy      uuid.UUID `gorm:"type:uuid;not null" json:"updatedBy"`
    UpdatedAt      time.Time `json:"updatedAt"`
    Submission     ScoringSubmission `gorm:"foreignKey:SubmissionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
    ExamRubricItem ExamRubricItem `gorm:"foreignKey:ExamRubricItemID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
}

type ScoringApprovalSnapshot struct {
    ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
    SubmissionID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_submission_approval_version,priority:1" json:"submissionId"`
    ApprovalVersion int       `gorm:"not null;uniqueIndex:idx_submission_approval_version,priority:2" json:"approvalVersion"`
    ResultJSON      string    `gorm:"type:text;not null" json:"resultJson"`
    TotalPoints     Score     `gorm:"not null" json:"totalPoints"`
    ApprovedBy      uuid.UUID `gorm:"type:uuid;not null" json:"approvedBy"`
    ApprovedAt      time.Time `json:"approvedAt"`
    Submission      ScoringSubmission `gorm:"foreignKey:SubmissionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
}

type ScoringAuditLog struct {
    ID                uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
    BatchID           uuid.UUID  `gorm:"type:uuid;not null;index" json:"batchId"`
    SubmissionID      *uuid.UUID `gorm:"type:uuid;index:idx_scoring_audit_submission_time,priority:1" json:"submissionId"`
    Action            string     `gorm:"type:varchar(60);not null" json:"action"`
    ActorID           uuid.UUID  `gorm:"type:uuid;not null" json:"actorId"`
    PreviousValueJSON string     `gorm:"type:text" json:"previousValueJson"`
    NewValueJSON      string     `gorm:"type:text" json:"newValueJson"`
    OccurredAt        time.Time  `gorm:"index:idx_scoring_audit_submission_time,priority:2" json:"occurredAt"`
    Batch             GradingBatch `gorm:"foreignKey:BatchID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
    Submission        *ScoringSubmission `gorm:"foreignKey:SubmissionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
}

type ScoringInternalEvent struct {
    ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
    EventType      string    `gorm:"type:varchar(40);not null;uniqueIndex:idx_scoring_event_key,priority:1" json:"eventType"`
    IdempotencyKey string    `gorm:"type:varchar(200);not null;uniqueIndex:idx_scoring_event_key,priority:2" json:"idempotencyKey"`
    PayloadJSON    string    `gorm:"type:text;not null" json:"payloadJson"`
    ResultJSON     string    `gorm:"type:text;not null" json:"resultJson"`
    ProcessedAt    time.Time `json:"processedAt"`
}
```

The relation fields and check tags above are required; do not rely on implicit
GORM relationship inference.

- [ ] **Step 4: Add production migration**

Append all seven models to `config.ConnectDB()`’s `AutoMigrate` list in the
dependency order used by the test.

- [ ] **Step 5: Run GREEN and regression**

Run:

```powershell
cd backend
gofmt -w internal/model/scoring_models.go internal/model/scoring_models_test.go
go test ./internal/model -run "ScoringModels|ExamModels" -v
go test ./internal/... -count=1
```

Expected: migration tests and existing backend tests pass.

- [ ] **Step 6: Commit**

```powershell
git add backend/internal/model/scoring_models.go backend/internal/model/scoring_models_test.go backend/internal/config/db.go
git commit -m "feat(scoring): add PostgreSQL scoring models"
```

---

### Task 2: Snapshot contract and pure score calculator

**Files:**

- Create: `backend/internal/scoring/domain.go`
- Create: `backend/internal/scoring/snapshot.go`
- Create: `backend/internal/scoring/calculator.go`
- Create: `backend/internal/scoring/snapshot_test.go`
- Create: `backend/internal/scoring/calculator_test.go`

**Interfaces:**

- Produces: `ParseGradingSnapshot(model.ExamSnapshot) (*GradingSnapshot, error)`.
- Produces: `ScoreSingleChoice`, `DeriveEssay`, and `SumQuestions`.
- Produces: stable scoring statuses and `DomainError`.

- [ ] **Step 1: Write failing snapshot tests**

Create tests with a serialized create-exam detail and assert:

```go
func TestParseGradingSnapshotRejectsWrongPurpose(t *testing.T) {
    _, err := scoring.ParseGradingSnapshot(model.ExamSnapshot{
        Purpose: "export",
        SnapshotJSON: `{}`,
    })
    require.ErrorIs(t, err, scoring.ErrInvalidSnapshot)
}

func TestParseGradingSnapshotBuildsOrderedWholeExam(t *testing.T) {
    snapshot := validSnapshotFixture(t)
    parsed, err := scoring.ParseGradingSnapshot(snapshot)
    require.NoError(t, err)
    require.Equal(t, model.MustScore("10.00"), parsed.TotalPoints)
    require.Equal(t, []uuid.UUID{questionA, questionB}, []uuid.UUID{
        parsed.Questions[0].ID,
        parsed.Questions[1].ID,
    })
    require.Len(t, parsed.Questions[1].Rubrics, 2)
}
```

Add table cases for duplicate question IDs, duplicate rubric IDs, rubric on a
single-choice question, rubric total mismatch, and exam total mismatch.

- [ ] **Step 2: Write failing calculator tests**

Use these assertions:

```go
require.Equal(t, "4.00", scoring.ScoreSingleChoice("correct", model.MustScore("4.00")).String())
require.Equal(t, "0.00", scoring.ScoreSingleChoice("incorrect", model.MustScore("4.00")).String())
require.Equal(t, "0.00", scoring.ScoreSingleChoice("unanswered", model.MustScore("4.00")).String())

essay := scoring.DeriveEssay([]scoring.RubricScore{
    {Status: "correct", Reviewed: true, Points: model.MustScore("2.00")},
    {Status: "incorrect", Reviewed: true, Points: model.MustScore("1.00")},
})
require.Equal(t, "incorrect", essay.Status)
require.True(t, essay.Reviewed)
require.Equal(t, "2.00", essay.AwardedPoints.String())
```

Also assert that an initial `unanswered, Reviewed=false` is incomplete while
an explicit `unanswered, Reviewed=true` is complete.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
cd backend
go test ./internal/scoring -run "Snapshot|Score|Essay|Reviewed" -v
```

Expected: compile failure because `internal/scoring` does not exist.

- [ ] **Step 4: Implement domain contracts**

Define in `domain.go`:

```go
type DomainError struct {
    Code string         `json:"code"`
    Message string      `json:"message"`
    Field string        `json:"field,omitempty"`
    Status int          `json:"-"`
    Meta map[string]any `json:"meta,omitempty"`
}

type GradingSnapshot struct {
    SnapshotID uuid.UUID
    ExamID uuid.UUID
    TotalPoints model.Score
    Questions []SnapshotQuestion
}

type SnapshotQuestion struct {
    ID uuid.UUID
    QuestionType string
    Points model.Score
    Position int
    Rubrics []SnapshotRubric
}

type SnapshotRubric struct {
    ID uuid.UUID
    Points model.Score
    Position int
}

type RubricScore struct {
    Status string
    Reviewed bool
    Points model.Score
}

type DerivedQuestion struct {
    Status string
    Reviewed bool
    AwardedPoints model.Score
}
```

Define exact error codes from spec section 12 and sentinel
`ErrInvalidSnapshot`.

- [ ] **Step 5: Implement snapshot parsing**

`snapshot.go` must unmarshal the JSON shape emitted by create-exam
`FirstSubmission`, sort by position, and validate:

```go
func ParseGradingSnapshot(snapshot model.ExamSnapshot) (*GradingSnapshot, error)
```

The parser must reject:

- purpose other than `grading_lock`;
- duplicate or zero UUIDs;
- unsupported question types;
- rubric attached to non-essay questions;
- missing rubric on essay questions;
- non-positive question/rubric scores;
- rubric sum different from essay points;
- question sum different from exam total.

- [ ] **Step 6: Implement exact calculation**

`calculator.go` exposes:

```go
func ValidateResultStatus(status string) error
func ScoreSingleChoice(status string, points model.Score) model.Score
func DeriveEssay(rubrics []RubricScore) DerivedQuestion
func SumQuestions(questions []DerivedQuestion) model.Score
```

Use `decimal.Decimal.Add` through the embedded `model.Score.Decimal`. Never
convert to floating-point.

- [ ] **Step 7: Run GREEN**

```powershell
cd backend
gofmt -w internal/scoring
go test ./internal/scoring -run "Snapshot|Score|Essay|Reviewed" -v
go test ./internal/... -count=1
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```powershell
git add backend/internal/scoring
git commit -m "feat(scoring): validate snapshots and calculate scores"
```

---

### Task 3: Transactional exam gateway and grading batch creation

**Files:**

- Create: `backend/internal/exam/scoring_gateway.go`
- Modify: `backend/internal/exam/callbacks.go`
- Modify: `backend/internal/exam/domain.go`
- Create: `backend/internal/exam/scoring_gateway_test.go`
- Create: `backend/internal/scoring/repository.go`
- Create: `backend/internal/scoring/service.go`
- Create: `backend/internal/scoring/service_batch_test.go`

**Interfaces:**

- Consumes: verified create-exam callbacks and Task 1/2 types.
- Produces: `scoring.ExamGatewayFactory`.
- Produces: `Service.CreateBatch`, `ListBatches`, `GetBatch`, `ListStudents`,
  and `GetSubmission`.

- [ ] **Step 1: Verify the dependency gate**

Run the commands under “Dependency Gate”. Expected: all pass. Do not implement
a second snapshot or exam state machine if they fail.

- [ ] **Step 2: Write failing owner-aware gateway tests**

Test these calls:

```go
snapshot, err := gateway.LockForScoring(
    teacher.ID,
    preparedExam.ID,
    preparedExam.Version,
    2,
    "batch-lock-1",
)
require.NoError(t, err)
require.Equal(t, "grading_lock", snapshot.Purpose)

_, err = gateway.LockForScoring(
    otherTeacher.ID,
    preparedExam.ID,
    preparedExam.Version,
    2,
    "batch-lock-2",
)
requireDomainCode(t, err, "exam_not_found")
```

Also assert stale exam version returns `version_conflict` and a rollback of an
outer transaction leaves the exam unlocked.

- [ ] **Step 3: Add the narrow exam gateway**

In `internal/exam/scoring_gateway.go` define:

```go
type ScoringGateway interface {
    LockForScoring(
        actor uuid.UUID,
        examID uuid.UUID,
        expectedVersion int,
        totalSubmissions int,
        idempotencyKey string,
    ) (*model.ExamSnapshot, error)
    RecordScoringProgress(
        examID uuid.UUID,
        gradedSubmissions int,
        scoredSubmissions int,
        idempotencyKey string,
    ) error
}

func NewScoringGateway(db *gorm.DB) ScoringGateway
```

`LockForScoring` must share the private transaction implementation used by
`Service.FirstSubmission`, adding owner and expected-version checks before the
snapshot is created. `RecordScoringProgress` must share
`Service.GradingCompleted`. Both must use the supplied `*gorm.DB`; nested calls
inside an outer scoring transaction must remain rollback-safe.

In scoring define:

```go
type ExamGatewayFactory func(db *gorm.DB) exam.ScoringGateway
```

- [ ] **Step 4: Write failing batch service tests**

Seed one valid prepared exam, two student users, one teacher user, and one
non-student user. Assert:

```go
created, err := svc.CreateBatch(teacher.ID, CreateBatchInput{
    ExamID: examID,
    StudentIDs: []uuid.UUID{studentA.ID, studentB.ID},
    ExpectedExamVersion: examVersion,
    IdempotencyKey: "create-batch-1",
})
require.NoError(t, err)
require.Equal(t, 2, created.TotalSubmissions)
require.Equal(t, "grading", created.Status)
require.Len(t, created.Submissions, 2)
```

Cover duplicate student, wrong role, empty list, ownership mismatch, stale
version, duplicate batch, same idempotency payload, conflicting idempotency
payload, and rollback after forced submission insert failure.

- [ ] **Step 5: Implement repository primitives**

`repository.go` exposes:

```go
type Repository struct { db *gorm.DB }
func NewRepository(db *gorm.DB) *Repository
func (r *Repository) Transaction(fn func(*Repository) error) error
func (r *Repository) DB() *gorm.DB
func (r *Repository) LockOwnedBatch(batchID, actor uuid.UUID) (*model.GradingBatch, error)
func (r *Repository) LockOwnedSubmission(submissionID, actor uuid.UUID) (*model.ScoringSubmission, *model.GradingBatch, error)
```

Ownership queries join the batch on `created_by`. Ownership mismatch and
missing rows both return `submission_not_found` or `grading_batch_not_found`.

- [ ] **Step 6: Implement batch creation**

Define:

```go
type CreateBatchInput struct {
    ExamID uuid.UUID
    StudentIDs []uuid.UUID
    ExpectedExamVersion int
    IdempotencyKey string
}
```

Inside one repository transaction:

1. Canonicalize and check `create_batch` event.
2. Reject empty, duplicate, zero, or non-student IDs.
3. Call the transaction-bound exam gateway with total student count.
4. Parse the returned grading snapshot.
5. Insert one batch.
6. Insert one submission per student with zero score and version 1.
7. Insert one question result per snapshot question.
8. Insert one rubric result per snapshot rubric.
9. Initialize every result as `unanswered`, `Reviewed=false`, score zero.
10. Append `batch_created` audit.
11. Store canonical event result.

Implement list/get methods ordered by creation time, question position, and
student name.

- [ ] **Step 7: Run GREEN**

```powershell
cd backend
gofmt -w internal/exam/scoring_gateway.go internal/exam/scoring_gateway_test.go internal/scoring
go test ./internal/exam -run "ScoringGateway|Submission|Grading" -v
go test ./internal/scoring -run "Batch|Student|Idempot|Rollback" -v
go test ./internal/... -count=1
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```powershell
git add backend/internal/exam backend/internal/scoring
git commit -m "feat(scoring): create transactional grading batches"
```

---

### Task 4: Autosaved question and rubric results

**Files:**

- Create: `backend/internal/scoring/results.go`
- Create: `backend/internal/scoring/results_test.go`
- Modify: `backend/internal/scoring/domain.go`
- Modify: `backend/internal/scoring/repository.go`

**Interfaces:**

- Produces: `Service.UpdateQuestionResult` and `UpdateRubricResult`.
- Produces: whole-submission recalculation after each mutation.

- [ ] **Step 1: Write failing question-result tests**

Assert:

```go
detail, err := svc.UpdateQuestionResult(teacher.ID, submission.ID, question.ID, UpdateResultInput{
    Status: "correct",
    ExpectedVersion: 1,
})
require.NoError(t, err)
require.Equal(t, 2, detail.Version)
require.True(t, detail.Questions[0].Reviewed)
require.Equal(t, "4.00", detail.AwardedPoints.String())
```

Cover `incorrect`, explicit `unanswered`, unsupported status, essay direct
mutation, question outside snapshot, wrong owner, approved submission, and
stale version.

- [ ] **Step 2: Write failing rubric and concurrency tests**

Update two rubric rows and assert essay question status/score is derived.
Start two goroutines with the same expected version and assert exactly one
succeeds while the other returns `version_conflict`.

- [ ] **Step 3: Run tests and verify RED**

```powershell
cd backend
go test ./internal/scoring -run "QuestionResult|RubricResult|Concurrent" -v
```

Expected: missing result mutation methods.

- [ ] **Step 4: Implement result inputs and recalculation**

Define:

```go
type UpdateResultInput struct {
    Status string
    ExpectedVersion int
}
```

Each method must:

1. Validate status and expected version before opening a transaction.
2. Lock the owned submission and its batch.
3. Require submission status `grading` or `revision`.
4. Check expected version.
5. Parse the batch snapshot.
6. Verify question/rubric belongs to the snapshot.
7. Update status, `Reviewed=true`, awarded points, actor, and time.
8. Recalculate affected essay question when a rubric changes.
9. Recalculate the whole submission total.
10. Increment submission version once with `WHERE version = ?`.
11. Append result audit with canonical previous/new value.
12. Return fresh detail.

- [ ] **Step 5: Run GREEN**

```powershell
cd backend
gofmt -w internal/scoring
go test ./internal/scoring -run "QuestionResult|RubricResult|Concurrent" -v
go test ./internal/... -count=1
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add backend/internal/scoring
git commit -m "feat(scoring): autosave manual grading results"
```

---

### Task 5: Approval, revisions, immutable history, and exam progress

**Files:**

- Create: `backend/internal/scoring/approval.go`
- Create: `backend/internal/scoring/approval_test.go`
- Modify: `backend/internal/scoring/domain.go`
- Modify: `backend/internal/scoring/repository.go`

**Interfaces:**

- Produces: `Service.Approve`, `StartRevision`, `History`, and `Audit`.
- Consumes: transaction-bound `exam.ScoringGateway.RecordScoringProgress`.

- [ ] **Step 1: Write failing approval tests**

Cover:

```go
approved, err := svc.Approve(teacher.ID, submission.ID, ApprovalInput{
    ExpectedVersion: completed.Version,
    IdempotencyKey: "approve-a-v1",
})
require.NoError(t, err)
require.Equal(t, "approved", approved.Status)
require.Equal(t, 1, approved.EffectiveApprovalVersion)
require.Equal(t, "7.00", approved.AwardedPoints.String())
```

Assert an unreviewed single-choice or rubric result returns
`result_incomplete` with the first relevant ID. Assert the approval snapshot
JSON contains every question/rubric result and cannot be mutated through
service methods.

- [ ] **Step 2: Write failing progress and revision tests**

For a two-student batch:

- first approval records progress `1/2` and keeps exam `preparing_exam`;
- second approval records `2/2`, completes the batch, and moves exam to `done`;
- retry does not increment counts;
- start revision keeps `ApprovedSubmissions == 2`;
- revision approval creates version 2 and does not call progress again;
- old approval snapshot remains byte-identical.

- [ ] **Step 3: Run tests and verify RED**

```powershell
cd backend
go test ./internal/scoring -run "Approve|Progress|Revision|History" -v
```

Expected: missing approval and revision methods.

- [ ] **Step 4: Implement approval**

Define:

```go
type ApprovalInput struct {
    ExpectedVersion int
    IdempotencyKey string
}

type RevisionInput struct {
    ExpectedVersion int
    IdempotencyKey string
}
```

Approval transaction:

1. Check `approve_submission` event.
2. Lock submission and batch.
3. Require `grading` or `revision` and expected version.
4. Verify all single-choice question results and all rubric results have
   `Reviewed=true`.
5. Recalculate totals from snapshot.
6. Create canonical approval snapshot at effective version + 1.
7. Set submission `approved`, approval actor/time/version, and increment row
   version once.
8. On first approval only, increment batch approved count under row lock.
9. Call `RecordScoringProgress` with approved count for both graded/scored and
   deterministic key `scoring-progress:<batch-id>:<count>`.
10. When count equals total, set batch completed and append audit.
11. Store event result and commit.

- [ ] **Step 5: Implement revision and history**

`StartRevision`:

- requires current state `approved`;
- checks idempotency and expected version;
- changes state to `revision`;
- increments submission version once;
- leaves effective approval and batch progress unchanged;
- appends `revision_started`.

`History` returns approval snapshots ordered by version descending. `Audit`
returns submission and batch audit rows ordered by occurrence time.

- [ ] **Step 6: Run GREEN**

```powershell
cd backend
gofmt -w internal/scoring
go test ./internal/scoring -run "Approve|Progress|Revision|History" -v
go test ./internal/exam ./internal/scoring -count=1
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add backend/internal/scoring
git commit -m "feat(scoring): version approvals and complete grading"
```

---

### Task 6: Fiber handlers, role enforcement, and route wiring

**Files:**

- Create: `backend/internal/handler/scoring.go`
- Create: `backend/internal/handler/scoring_test.go`
- Modify: `backend/cmd/server/main.go`
- Modify: `backend/internal/config/db.go` only if the migration list changed
  during create-exam integration

**Interfaces:**

- Consumes: scoring service and create-exam teacher role middleware.
- Produces: every API route in spec section 9.

- [ ] **Step 1: Write failing handler tests**

Using Fiber test requests, cover:

- no JWT returns 401;
- student role returns 403;
- teacher can list scoring students;
- create batch requires `Idempotency-Key`;
- mutation parses UUID and expected version;
- domain 404/409/422 maps to structured error;
- response never accepts or returns client-supplied awarded points.

Assert the error body shape:

```json
{
  "error": {
    "code": "version_conflict",
    "message": "Scoring data has changed. Reload before saving.",
    "details": {
      "currentVersion": 4
    }
  }
}
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
cd backend
go test ./internal/handler -run Scoring -v
```

Expected: missing scoring handler.

- [ ] **Step 3: Implement handlers**

Create:

```go
type ScoringHandler struct {
    service *scoring.Service
}

func NewScoringHandler(service *scoring.Service) *ScoringHandler
```

Implement methods:

```go
ListStudents
CreateBatch
ListBatches
GetBatch
GetSubmission
UpdateQuestionResult
UpdateRubricResult
Approve
StartRevision
History
Audit
```

Parse actor only from `c.Locals("userID")`. Reject missing/invalid
idempotency keys and keys over 200 characters.

- [ ] **Step 4: Wire services and routes**

In `main.go` construct:

```go
scoringRepo := scoring.NewRepository(config.DB)
scoringSvc := scoring.NewService(
    scoringRepo,
    func(db *gorm.DB) exam.ScoringGateway {
        return exam.NewScoringGateway(db)
    },
)
scoringHandler := handler.NewScoringHandler(scoringSvc)
```

Register under protected teacher-role routes:

```text
GET  /api/teacher/scoring/students
POST /api/teacher/grading-batches
GET  /api/teacher/grading-batches
GET  /api/teacher/grading-batches/:batchId
GET  /api/teacher/scoring-submissions/:submissionId
PUT  /api/teacher/scoring-submissions/:submissionId/questions/:questionId
PUT  /api/teacher/scoring-submissions/:submissionId/rubrics/:rubricId
POST /api/teacher/scoring-submissions/:submissionId/approve
POST /api/teacher/scoring-submissions/:submissionId/revisions
GET  /api/teacher/scoring-submissions/:submissionId/history
GET  /api/teacher/scoring-submissions/:submissionId/audit
```

- [ ] **Step 5: Run GREEN and backend regression**

```powershell
cd backend
gofmt -w internal/handler/scoring.go internal/handler/scoring_test.go cmd/server/main.go
go test ./internal/handler -run Scoring -v
go test ./... -count=1
go vet ./...
```

Expected: tests and vet pass.

- [ ] **Step 6: Commit**

```powershell
git add backend/internal/handler/scoring.go backend/internal/handler/scoring_test.go backend/cmd/server/main.go backend/internal/config/db.go
git commit -m "feat(scoring): expose teacher grading APIs"
```

---

### Task 7: Typed frontend scoring client and error helpers

**Files:**

- Create: `frontend/src/features/scoring/types.ts`
- Create: `frontend/src/features/scoring/api.ts`
- Create: `frontend/src/features/scoring/errors.ts`
- Create: `frontend/src/features/scoring/api.test.ts`
- Create: `frontend/src/features/scoring/errors.test.ts`
- Modify: `frontend/src/lib/api.ts` only if create-exam did not already expose
  structured `ApiError`

**Interfaces:**

- Consumes: existing `apiFetch`, `ApiError`, and create-exam `examApi`.
- Produces: typed scoring API methods and UX error mapping.

- [ ] **Step 1: Write failing client tests**

Mock `apiFetch` and assert:

```ts
await scoringApi.createBatch(
  {
    examId: "exam-1",
    studentIds: ["student-1", "student-2"],
    expectedExamVersion: 7,
  },
  "batch-key-1",
);

expect(apiFetch).toHaveBeenCalledWith(
  "/teacher/grading-batches",
  expect.objectContaining({
    method: "POST",
    headers: expect.objectContaining({ "Idempotency-Key": "batch-key-1" }),
  }),
);
```

Assert update result sends only `status` and `expectedVersion`, never awarded
points.

- [ ] **Step 2: Run tests and verify RED**

```powershell
cd frontend
npm test -- src/features/scoring/api.test.ts src/features/scoring/errors.test.ts
```

Expected: missing scoring modules.

- [ ] **Step 3: Define complete TypeScript contracts**

Define literal unions:

```ts
export type ScoringResultStatus = "correct" | "incorrect" | "unanswered";
export type ScoringSubmissionStatus = "grading" | "approved" | "revision";
export type GradingBatchStatus = "grading" | "completed";
```

Add exact types for student option, batch summary/detail, submission detail,
question result, rubric result, approval history, audit row, create batch
input, update result input, approval input, and revision input. Represent
scores as strings.

- [ ] **Step 4: Implement typed API methods**

Expose:

```ts
listStudents(search?: string)
createBatch(input: CreateBatchInput, idempotencyKey: string)
listBatches(filter?: { status?: GradingBatchStatus; search?: string })
getBatch(batchId: string)
getSubmission(submissionId: string)
updateQuestionResult(submissionId: string, questionId: string, input: UpdateResultInput)
updateRubricResult(submissionId: string, rubricId: string, input: UpdateResultInput)
approve(submissionId: string, input: ApprovalInput, idempotencyKey: string)
startRevision(submissionId: string, input: RevisionInput, idempotencyKey: string)
history(submissionId: string)
audit(submissionId: string)
```

`errors.ts` maps stable codes to Vietnamese UX messages and exposes
`isVersionConflict(error): error is ApiError`.

- [ ] **Step 5: Run GREEN**

```powershell
cd frontend
npm test -- src/features/scoring
npx tsc --noEmit
npm run build
```

Expected: tests, typecheck, and build pass.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/scoring frontend/src/lib/api.ts
git commit -m "feat(scoring): add typed grading client"
```

---

### Task 8: Teacher grading workspace

**Files:**

- Create: `frontend/src/app/teacher/components/ExamScoringTab.tsx`
- Create: `frontend/src/app/teacher/components/ExamScoringTab.test.tsx`
- Create: `frontend/src/app/teacher/components/scoring/GradingBatchList.tsx`
- Create: `frontend/src/app/teacher/components/scoring/CreateGradingBatch.tsx`
- Create: `frontend/src/app/teacher/components/scoring/StudentSubmissionList.tsx`
- Create: `frontend/src/app/teacher/components/scoring/SubmissionScoringForm.tsx`
- Create: `frontend/src/app/teacher/components/scoring/QuestionScoringCard.tsx`
- Create: `frontend/src/app/teacher/components/scoring/RubricScoringRow.tsx`
- Create: `frontend/src/app/teacher/components/scoring/ScoringSummary.tsx`
- Modify: `frontend/src/app/teacher/navigation.ts`
- Modify: `frontend/src/app/teacher/navigation.test.ts`
- Modify: `frontend/src/app/teacher/page.tsx`

**Interfaces:**

- Consumes: scoring client, create-exam list API, and teacher navigation.
- Produces: active tab `exam-scoring` labelled `Chấm bài kiểm tra`.

- [ ] **Step 1: Write failing navigation and component tests**

Navigation assertion:

```ts
expect(teacherNavigation).toContainEqual(
  expect.objectContaining({
    id: "exam-scoring",
    label: "Chấm bài kiểm tra",
  }),
);
```

Component tests mock only the API boundary and cover:

- lists prepared exams and students;
- requires at least one selected student;
- shows the “cannot add students later” warning;
- creates a batch with a stable idempotency key;
- selects a student submission;
- renders single-choice and rubric three-state controls;
- sends current expected version on autosave;
- shows `Chưa lưu` and retry after network failure;
- reloads after 409;
- disables approval while any `Reviewed=false`;
- approved state is read-only;
- start revision re-enables controls;
- history shows approval versions.

- [ ] **Step 2: Run tests and verify RED**

```powershell
cd frontend
npm test -- src/app/teacher/navigation.test.ts src/app/teacher/components/ExamScoringTab.test.tsx
```

Expected: missing scoring tab and navigation entry.

- [ ] **Step 3: Implement focused components**

Responsibilities:

- `GradingBatchList`: status/search filters and batch selection.
- `CreateGradingBatch`: prepared-exam select, searchable student multi-select,
  immutable-list warning, and create action.
- `StudentSubmissionList`: student, effective score, status, and progress.
- `SubmissionScoringForm`: question list and autosave orchestration.
- `QuestionScoringCard`: `Đúng/Sai/Không làm` for single-choice and derived
  essay summary.
- `RubricScoringRow`: `Đạt/Không đạt/Không làm`.
- `ScoringSummary`: working/effective score, remaining count, version,
  approval, revision, and history actions.
- `ExamScoringTab`: top-level loading, selection, errors, and API calls only.

Reuse existing buttons, cards, badges, scroll areas, radio groups, skeletons,
and Sonner toasts. Do not add a new UI or drag-and-drop dependency.

- [ ] **Step 4: Implement autosave conflict behavior**

For each control:

1. Keep the last server detail.
2. Mark the changed row `saving`.
3. Send status plus current version.
4. Replace the complete local detail with the response.
5. On network error, retain the intended status as `unsaved` and expose retry.
6. On `version_conflict`, discard the unsaved mutation, reload detail, and
   show a Vietnamese conflict toast.

Generate one idempotency key per create/approve/revision user action and retain
it until that action succeeds or the user cancels.

- [ ] **Step 5: Wire teacher navigation**

Add `"exam-scoring"` to the shared `ActiveTab` type, add Lucide `ClipboardCheck`
navigation metadata, title/subtitle copy, and render:

```tsx
<ExamScoringTab />
```

The tab must not require selecting a knowledge-graph subject first.

- [ ] **Step 6: Run GREEN and frontend regression**

```powershell
cd frontend
npm test
npx tsc --noEmit
npm run build
```

Expected: all tests, typecheck, and production build pass.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/app/teacher frontend/src/features/scoring
git commit -m "feat(scoring): add teacher grading workspace"
```

---

### Task 9: Browser smoke, documentation, and final verification

**Files:**

- Create: `tests/real_exam_scoring_smoke.py`
- Modify: `README.md`
- Modify: `run.ps1`
- Modify: `backend/.env.example` only to remove obsolete scoring provider
  variables if another in-flight change added them

**Interfaces:**

- Consumes: complete create-exam and scoring integrations.
- Produces: repeatable live-system evidence and runtime documentation.

- [ ] **Step 1: Write the browser smoke and observe RED before UI completion**

The Playwright script must:

1. Start from `http://127.0.0.1:3000/login`.
2. Log in with the teacher demo account.
3. Create and prepare a valid exam if no prepared fixture exists.
4. Open `Chấm bài kiểm tra`.
5. Select the prepared exam and two demo students.
6. Create a grading batch.
7. Grade every single-choice/rubric result for student A and approve.
8. Assert batch progress is `1/2` and exam is not done.
9. Grade and approve student B.
10. Assert batch is completed and exam is done.
11. Start a revision for student A, change one result, and approve again.
12. Assert history contains versions 1 and 2 and progress remains `2/2`.
13. Save screenshots to a temporary directory only on failure.

Before Task 8 is implemented, run:

```powershell
python tests/real_exam_scoring_smoke.py
```

Expected: failure at the missing `Chấm bài kiểm tra` tab.

- [ ] **Step 2: Update runtime documentation**

README must state:

- scoring is available in the teacher tab;
- create-exam must be prepared before a batch is created;
- the complete student list is selected when the batch starts;
- all grading is manual and server-calculated;
- there is no upload, OCR, Datalab, or Qwen dependency;
- approved results support immutable revision history;
- exact backend/frontend/browser test commands.

`run.ps1` must not start `Real_exam_scoring_backend`.

- [ ] **Step 3: Run backend verification**

```powershell
cd backend
gofmt -w internal/model/scoring_models.go internal/scoring internal/exam/scoring_gateway.go internal/handler/scoring.go cmd/server/main.go
go test ./... -count=1 -v
go vet ./...
```

Expected: zero test failures and zero vet findings.

- [ ] **Step 4: Run Python regression oracles**

```powershell
cd ..
python -m pytest create_exam_backend/tests -q
python -m pytest Real_exam_scoring_backend/tests -q
```

Expected: both independent module suites pass unchanged.

- [ ] **Step 5: Run frontend verification**

```powershell
cd frontend
npm test
npx tsc --noEmit
npm run build
```

Expected: all tests, typecheck, and build pass.

- [ ] **Step 6: Run browser smoke against live services**

Start services with `run.ps1`, then:

```powershell
python tests/real_exam_scoring_smoke.py
```

Expected: `Real exam scoring integration smoke test passed`.

- [ ] **Step 7: Verify repository hygiene**

```powershell
git status --short
git diff --check
git ls-files | rg "(\.db$|data/scoring|playwright-report|test-results|\.next)"
```

Expected:

- no SQLite database, generated scoring data, screenshots, build output, or
  dependency directories are tracked;
- unrelated user changes remain untouched;
- no whitespace errors.

- [ ] **Step 8: Commit**

```powershell
git add README.md run.ps1 backend/.env.example tests/real_exam_scoring_smoke.py
git commit -m "docs(scoring): document integrated grading workflow"
```

---

## Coverage Matrix

| Spec requirement | Tasks |
|---|---|
| Go/Fiber/GORM/PostgreSQL runtime | 1, 3, 6 |
| Exact fixed-point scores | 1, 2, 4, 5 |
| Immutable exam snapshot | 2, 3 |
| One batch per exam | 1, 3 |
| One whole-exam submission per student | 1, 3 |
| Student role validation | 3, 6 |
| Three-state manual scoring | 2, 4 |
| Reviewed vs explicit unanswered | 1, 2, 4 |
| Server-side totals | 2, 4, 5 |
| Optimistic locking | 4, 6, 8 |
| Idempotent create/approve/revision | 3, 5, 7, 8 |
| Immutable approval history | 5, 8 |
| Revision without decreasing progress | 5 |
| Exam progress and done transition | 3, 5 |
| JWT teacher ownership | 3, 6 |
| Teacher scoring tab | 7, 8 |
| Autosave/conflict UX | 7, 8 |
| No OCR/Qwen runtime | 1–9 |
| Browser flow | 9 |
| Regression oracles | 9 |

## Definition of Done

- Every new backend behavior was introduced by a test observed failing for the
  expected reason.
- Create-exam dependency tests pass before scoring integration begins.
- All Go tests and `go vet` pass against isolated PostgreSQL test schemas.
- Frontend unit/component tests, TypeScript checking, and production build
  pass.
- Both independent Python module test suites remain green.
- Playwright completes batch creation, two-student grading, completion, and
  revision.
- Runtime does not start or call `Real_exam_scoring_backend`, Datalab, or Qwen.
- No generated databases, files, screenshots, or build output are tracked.
