# Create Exam Main Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the complete create-exam workflow into the main Go/PostgreSQL backend and expose it as a new teacher-dashboard tab in the Next.js frontend.

**Architecture:** Add a bounded `internal/exam` domain using GORM models stored in the main PostgreSQL database, with Fiber handlers using the existing JWT identity. Reuse `Node` and `Question` as topics and bank questions, snapshot their data into exams, and keep lifecycle, idempotent callbacks, audit, and DOCX export server-side. Add a focused `ExamBuilderTab` and typed frontend API layer rather than extending the already-large teacher page with business logic.

**Tech Stack:** Go 1.26.3, Fiber v3, GORM, PostgreSQL 16, `shopspring/decimal`, `stretchr/testify`, Go standard-library ZIP/XML for DOCX, Next.js 16, React 19, TypeScript, Tailwind CSS, Vitest, React Testing Library, Python Playwright.

## Global Constraints

- Main runtime is Go/Fiber/GORM/PostgreSQL plus Next.js; FastAPI/SQLite is reference-only.
- Reuse `Node` for topics and `Question` for bank questions.
- Teacher identity always comes from JWT `sub`; never trust a teacher ID in request payloads.
- Every teacher mutation requires `expectedVersion` and increments version exactly once.
- Scores use exact fixed-point decimals with at most two fractional digits; never use floating-point arithmetic.
- Manual questions remain exam-local and are never written back to `Question`.
- A first-submission callback creates one immutable grading snapshot and locks content.
- Only a valid grading-completed callback may transition an exam to `done`.
- DOCX is supported; PDF is out of scope.
- Preserve the independent `create_exam_backend` module and keep its 25 tests passing.
- Do not rewrite, rebase, amend, or force-push published history.

---

### Task 1: Go toolchain, score type, exam models, and PostgreSQL test isolation

**Files:**

- Modify: `backend/go.mod`
- Modify: `backend/go.sum`
- Create: `backend/internal/model/exam_models.go`
- Modify: `backend/internal/config/db.go:49`
- Create: `backend/internal/testutil/postgres.go`
- Create: `backend/internal/model/exam_models_test.go`

**Interfaces:**

- Produces: `model.Score` backed by `decimal.Decimal`.
- Produces: `Exam`, `ExamQuestion`, `ExamRubricItem`, `ExamSnapshot`,
  `ExamGradingProgress`, `ExamInternalEvent`, `ExamExport`, `ExamAuditLog`.
- Produces: `testutil.OpenPostgres(t) *gorm.DB` with one disposable PostgreSQL
  schema per test.

- [ ] **Step 1: Install the project Go version and add the decimal dependency**

Run on Windows if `go version` is unavailable:

```powershell
winget install --id GoLang.Go --exact --accept-package-agreements --accept-source-agreements
```

Restart the terminal, then run:

```powershell
go version
cd backend
go get github.com/shopspring/decimal@v1.4.0
go get github.com/stretchr/testify@v1.11.1
```

Expected: Go is available and `go.mod` contains
`github.com/shopspring/decimal v1.4.0` plus
`github.com/stretchr/testify v1.11.1`.

- [ ] **Step 2: Write the failing migration and score tests**

Create `backend/internal/model/exam_models_test.go`:

```go
package model_test

import (
    "testing"

    "backend/internal/model"
    "backend/internal/testutil"
)

func TestExamModelsMigrateWithExpectedConstraints(t *testing.T) {
    db := testutil.OpenPostgres(t)
    err := db.AutoMigrate(
        &model.User{},
        &model.Node{},
        &model.Question{},
        &model.Exam{},
        &model.ExamQuestion{},
        &model.ExamRubricItem{},
        &model.ExamSnapshot{},
        &model.ExamGradingProgress{},
        &model.ExamInternalEvent{},
        &model.ExamExport{},
        &model.ExamAuditLog{},
    )
    if err != nil {
        t.Fatal(err)
    }
    for _, table := range []string{
        "exams", "exam_questions", "exam_rubric_items", "exam_snapshots",
        "exam_grading_progresses", "exam_internal_events", "exam_exports",
        "exam_audit_logs",
    } {
        if !db.Migrator().HasTable(table) {
            t.Fatalf("missing table %s", table)
        }
    }
}

func TestScoreRejectsMoreThanTwoDecimalPlaces(t *testing.T) {
    if _, err := model.ParseScore("1.234"); err == nil {
        t.Fatal("expected scale validation error")
    }
    score, err := model.ParseScore("10.00")
    if err != nil || score.String() != "10.00" {
        t.Fatalf("unexpected score: %v %v", score, err)
    }
}
```

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
cd backend
go test ./internal/model -run "TestExamModels|TestScore" -v
```

Expected: compile failure because the exam models, `ParseScore`, and
`testutil.OpenPostgres` do not exist.

- [ ] **Step 4: Implement PostgreSQL test isolation**

Create `backend/internal/testutil/postgres.go` with:

```go
package testutil

func OpenPostgres(t *testing.T) *gorm.DB
```

The helper must:

1. Build a DSN from `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_PORT`, and
   `DB_SSLMODE`, using main-backend defaults except database
   `aurora_exam_test`.
2. Connect first to `postgres`, create `aurora_exam_test` when absent.
3. Run `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"` in `aurora_exam_test`.
4. Generate schema name `exam_test_<uuid without hyphens>`.
5. `CREATE SCHEMA` using a validated identifier.
6. Reconnect with `search_path=<generated schema>`.
7. Register `t.Cleanup` that closes the test pool and drops the schema with
   `CASCADE`.

No test may use `aurora_dev`.

- [ ] **Step 5: Implement exact scores and GORM models**

In `backend/internal/model/exam_models.go`:

```go
type Score struct {
    decimal.Decimal
}

func ParseScore(raw string) (Score, error)
func MustScore(raw string) Score
func (s Score) String() string
func (s Score) MarshalJSON() ([]byte, error)
func (s *Score) UnmarshalJSON(data []byte) error
func (s Score) Value() (driver.Value, error)
func (s *Score) Scan(value any) error
func (Score) GormDataType() string
func (Score) GormDBDataType(*gorm.DB, *schema.Field) string
```

`ParseScore` must reject non-positive values where the caller requires a
positive score, but the base type itself accepts zero for summation. It must
reject more than two decimal places and absolute values greater than
`99999.99`. `GormDBDataType` returns `numeric(7,2)` for PostgreSQL.

Define the eight GORM models exactly as section 4 of the design spec. Use:

- UUID primary keys with `default:uuid_generate_v4()`.
- `CreatedBy uuid.UUID` with an index.
- `gorm:"uniqueIndex:idx_exam_position"` on exam question position.
- `gorm:"uniqueIndex:idx_rubric_position"` on rubric position.
- `gorm:"uniqueIndex:idx_exam_event_key"` on event type and idempotency key.
- `type:text` for JSON snapshots, matching the main backend’s JSON-string
  storage pattern.
- `DeletedAt gorm.DeletedAt` only on `Exam`.

- [ ] **Step 6: Add models to production AutoMigrate**

Append all eight exam models to `config.ConnectDB()`’s `AutoMigrate` list.

- [ ] **Step 7: Run GREEN and regression**

Run:

```powershell
cd backend
go test ./internal/model -v
go test ./internal/service -v
```

Expected: model tests pass and existing guardrail tests remain green.

- [ ] **Step 8: Commit**

```powershell
git add backend/go.mod backend/go.sum backend/internal/model backend/internal/config/db.go backend/internal/testutil
git commit -m "feat(exams): add PostgreSQL exam models"
```

---

### Task 2: Domain errors, repository, and owned exam CRUD

**Files:**

- Create: `backend/internal/exam/domain.go`
- Create: `backend/internal/exam/repository.go`
- Create: `backend/internal/exam/service.go`
- Create: `backend/internal/exam/service_crud_test.go`

**Interfaces:**

- Consumes: Task 1 models and `model.Score`.
- Produces: `exam.DomainError`, stable error codes, request/result types.
- Produces: `exam.Repository` with transaction-aware GORM operations.
- Produces: `exam.Service.Create`, `List`, `Get`, `Patch`, `Delete`, `Audit`.

- [ ] **Step 1: Write failing CRUD, ownership, and optimistic-lock tests**

Create tests that seed two teacher users and assert:

```go
created, err := svc.Create(teacherA.ID, exam.CreateInput{
    Title: "Kiểm tra phân số",
    Subject: "Toán đại số",
    GradeLevel: "Lớp 5",
    DurationMinutes: 45,
    Instructions: "Không sử dụng tài liệu.",
    TotalPoints: model.MustScore("10.00"),
})
require.NoError(t, err)
require.Equal(t, 1, created.Version)
require.Equal(t, model.ExamStatusDrafting, created.Status)

_, err = svc.Get(teacherB.ID, created.ID)
requireDomainCode(t, err, "exam_not_found")

patched, err := svc.Patch(teacherA.ID, created.ID, exam.PatchInput{
    Title: ptr("Kiểm tra phân số nâng cao"),
    ExpectedVersion: 1,
})
require.NoError(t, err)
require.Equal(t, 2, patched.Version)

_, err = svc.Patch(teacherA.ID, created.ID, exam.PatchInput{
    Title: ptr("Ghi đè cũ"),
    ExpectedVersion: 1,
})
requireDomainCode(t, err, "version_conflict")
```

Also assert:

- List returns only the actor’s exams and supports status/search.
- Delete succeeds only for an unlocked `drafting` exam at the expected version.
- Create, patch, and delete write audit entries.
- Request values outside the documented length/range contract are rejected.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
cd backend
go test ./internal/exam -run "CRUD|Ownership|Version|Delete|Audit" -v
```

Expected: compile failure because `internal/exam` does not exist.

- [ ] **Step 3: Implement domain contracts**

`domain.go` must define:

```go
type DomainError struct {
    Code string
    Message string
    Field string
    Status int
    Meta map[string]any
}

type CreateInput struct {
    Title string
    Subject string
    GradeLevel string
    DurationMinutes int
    Instructions string
    TotalPoints model.Score
}

type PatchInput struct {
    Title *string
    DurationMinutes *int
    Instructions *string
    TotalPoints *model.Score
    ExpectedVersion int
}
```

Add explicit validators:

- title: 1–300 trimmed runes.
- subject: 1–255 trimmed runes.
- grade level: 1–50 trimmed runes.
- duration: 1–600.
- instructions: at most 10,000 runes.
- total points: positive.

Define constants for statuses and stable error codes from the spec.

- [ ] **Step 4: Implement repository transaction primitives**

`repository.go` exposes:

```go
type Repository struct { db *gorm.DB }
func NewRepository(db *gorm.DB) *Repository
func (r *Repository) Transaction(fn func(tx *Repository) error) error
func (r *Repository) OwnedExam(id, actor uuid.UUID) (*model.Exam, error)
func (r *Repository) ExamDetail(id, actor uuid.UUID) (*Detail, error)
func (r *Repository) LockOwnedExam(id, actor uuid.UUID) (*model.Exam, error)
func (r *Repository) AppendAudit(entry *model.ExamAuditLog) error
```

`LockOwnedExam` uses `clause.Locking{Strength: "UPDATE"}`. Not-found and
ownership mismatch both become `exam_not_found`.

- [ ] **Step 5: Implement CRUD service**

Every mutation follows:

1. Start transaction.
2. Lock owned exam.
3. Check `expectedVersion`.
4. Check mutable status/lock.
5. Apply one mutation.
6. Increment version exactly once using
   `WHERE id = ? AND version = ?`.
7. Append audit in the same transaction.
8. Return fresh detail.

Use audit actions `exam_created`, `exam_updated`, and `exam_deleted`.

- [ ] **Step 6: Run GREEN and full package tests**

Run:

```powershell
cd backend
go test ./internal/exam -v
go test ./internal/... -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add backend/internal/exam
git commit -m "feat(exams): add owned exam CRUD"
```

---

### Task 3: Main-bank adapters and exam question authoring

**Files:**

- Modify: `backend/internal/exam/domain.go`
- Modify: `backend/internal/exam/repository.go`
- Modify: `backend/internal/exam/service.go`
- Create: `backend/internal/exam/service_questions_test.go`

**Interfaces:**

- Consumes: `model.Node` and `model.Question`.
- Produces: `Service.ListBankQuestions`, `GetBankQuestion`, `ListTopics`.
- Produces: `AddBankQuestion`, `AddManualQuestion`, `PatchQuestion`,
  `DeleteQuestion`, `ReorderQuestions`.

- [ ] **Step 1: Write failing bank snapshot tests**

Seed one node and one `Question` with four options. Assert:

```go
bank, err := svc.ListBankQuestions(exam.BankFilter{
    Subject: "Toán đại số",
    NodeID: &node.ID,
    Difficulty: "medium",
    Search: "phân số",
})
require.NoError(t, err)
require.Len(t, bank, 1)

detail, err := svc.AddBankQuestion(teacher.ID, created.ID, exam.AddBankQuestionInput{
    QuestionID: bank[0].ID,
    Points: model.MustScore("2.00"),
    ExpectedVersion: 1,
})
require.NoError(t, err)
require.Equal(t, 2, detail.Version)
require.Equal(t, []uuid.UUID{node.ID}, detail.Questions[0].TopicNodeIDs)
require.Equal(t, "choice-0", *detail.Questions[0].CorrectChoiceID)
```

Update and soft-delete the source `Question`, reload the exam, and assert its
snapshot is unchanged.

- [ ] **Step 2: Write failing manual authoring and reorder tests**

Cover:

- Manual single-choice with unique choice IDs and valid correct answer.
- Manual essay with no choices and at least one topic.
- Topic from another subject returns `topic_not_allowed`.
- Editing topic IDs on a bank-sourced question returns
  `bank_topic_immutable`.
- Reorder requires every question ID exactly once.
- Delete compacts positions to `0..n-1`.
- Every successful operation increments version once; stale version conflicts.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
cd backend
go test ./internal/exam -run "Bank|Manual|Question|Reorder" -v
```

Expected: missing-method compile failures.

- [ ] **Step 4: Implement bank/topic queries**

Use GORM joins:

```go
db.Model(&model.Question{}).
    Select("questions.*, nodes.subject, nodes.name AS node_name").
    Joins("JOIN nodes ON nodes.id = questions.node_id AND nodes.deleted_at IS NULL").
    Where("questions.deleted_at IS NULL")
```

Apply optional subject/node/difficulty/search filters. Topic listing returns
non-deleted nodes for exactly one subject, ordered by name.

Map existing options to:

```go
type Choice struct {
    ID string `json:"choiceId"`
    Content string `json:"content"`
}
```

IDs are `choice-0`, `choice-1`, and so on; correct ID uses
`Question.CorrectOption`.

- [ ] **Step 5: Implement question mutations**

Inputs:

```go
type AddBankQuestionInput struct {
    QuestionID uuid.UUID
    Points model.Score
    ExpectedVersion int
}

type ManualQuestionInput struct {
    QuestionType string
    Content string
    Points model.Score
    TopicNodeIDs []uuid.UUID
    Choices []Choice
    CorrectChoiceID *string
    ExpectedVersion int
}

type ReorderQuestionsInput struct {
    ExamQuestionIDs []uuid.UUID
    ExpectedVersion int
}
```

For reorder, avoid unique-position collisions by first assigning temporary
positions `position + 100000`, then assigning final positions in request order
inside the same transaction.

- [ ] **Step 6: Run GREEN and regression**

Run:

```powershell
cd backend
go test ./internal/exam -v
go test ./internal/... -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add backend/internal/exam
git commit -m "feat(exams): author questions from the main bank"
```

---

### Task 4: Rubric CRUD, validation, and prepare transitions

**Files:**

- Create: `backend/internal/exam/validation.go`
- Modify: `backend/internal/exam/domain.go`
- Modify: `backend/internal/exam/repository.go`
- Modify: `backend/internal/exam/service.go`
- Create: `backend/internal/exam/validation_test.go`
- Create: `backend/internal/exam/service_rubric_test.go`

**Interfaces:**

- Produces: `ValidateDetail(detail Detail, topics TopicLookup) []ValidationError`.
- Produces: rubric CRUD/reorder service methods.
- Produces: `Validate`, `Prepare`, and `ReturnToDraft`.

- [ ] **Step 1: Write table-driven failing validation tests**

Create one test case per stable code:

```go
tests := []struct{
    name string
    mutate func(*exam.Detail)
    code string
}{
    {"empty exam", removeQuestions, "exam_empty"},
    {"score mismatch", changeQuestionTotal, "score_mismatch"},
    {"invalid choices", duplicateChoiceIDs, "invalid_choice_set"},
    {"missing answer", removeCorrectChoice, "missing_correct_choice"},
    {"essay rubric missing", removeRubric, "rubric_incomplete"},
    {"rubric sum mismatch", changeRubricTotal, "rubric_score_mismatch"},
    {"manual topic missing", removeManualTopics, "topic_required"},
    {"foreign topic", addForeignSubjectTopic, "topic_not_allowed"},
}
```

Assert error fields include the relevant `examQuestionId` or `rubricItemId`
and exact `expected`/`actual` score strings for mismatches.

- [ ] **Step 2: Write failing rubric and transition tests**

Cover:

- Rubric only allowed on essay questions.
- Each rubric requires description, positive points, and valid topics.
- CRUD/reorder increments exam version once.
- Draft may temporarily contain incomplete rubric.
- `Prepare` rejects validation errors with HTTP-domain status 422.
- Valid draft transitions to `preparing_exam`.
- Unlocked preparing exam remains editable and can return to draft.
- Invalid transitions return `invalid_transition`.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
cd backend
go test ./internal/exam -run "Validation|Rubric|Prepare|Draft" -v
```

Expected: compile failures for missing validation and rubric methods.

- [ ] **Step 4: Implement pure validation**

`validation.go` must implement all eleven rules from spec section 7.2 and
perform all score sums with `decimal.Decimal`. Topic lookup must be built in
one query and keyed by UUID; validation must not issue one query per rubric.

Public types:

```go
type ValidationError struct {
    Code string `json:"code"`
    Message string `json:"message"`
    Field string `json:"field"`
    ExamQuestionID *uuid.UUID `json:"examQuestionId,omitempty"`
    RubricItemID *uuid.UUID `json:"rubricItemId,omitempty"`
    Expected string `json:"expected,omitempty"`
    Actual string `json:"actual,omitempty"`
}
```

- [ ] **Step 5: Implement rubric CRUD/reorder**

Use the same transaction/version pattern as Task 3. Reorder uses temporary
positions before final positions. Return `rubric_not_allowed` for
single-choice questions.

- [ ] **Step 6: Implement validation and transitions**

`Validate` returns:

```go
type ValidationResult struct {
    Valid bool `json:"valid"`
    Errors []ValidationError `json:"errors"`
}
```

`Prepare` and `ReturnToDraft` accept `VersionInput`. `Prepare` loads a locked
detail, validates, and moves to `preparing_exam`; `ReturnToDraft` only accepts
unlocked `preparing_exam`.

- [ ] **Step 7: Run GREEN and regression**

Run:

```powershell
cd backend
go test ./internal/exam -v
go test ./internal/... -v
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```powershell
git add backend/internal/exam
git commit -m "feat(exams): validate rubrics and prepare exams"
```

---

### Task 5: Immutable grading lock and idempotent callbacks

**Files:**

- Create: `backend/internal/exam/callbacks.go`
- Modify: `backend/internal/exam/domain.go`
- Modify: `backend/internal/exam/repository.go`
- Modify: `backend/internal/exam/service.go`
- Create: `backend/internal/exam/callbacks_test.go`

**Interfaces:**

- Produces: `Service.FirstSubmission` and `Service.GradingCompleted`.
- Produces: canonical JSON helper used for idempotency.

- [ ] **Step 1: Write failing first-submission tests**

For a valid prepared exam:

```go
result, err := svc.FirstSubmission(exam.ID, "submission-1", exam.FirstSubmissionInput{
    TotalSubmissions: 30,
})
require.NoError(t, err)
require.True(t, result.Locked)
require.Equal(t, 30, result.TotalSubmissions)
```

Then assert:

- Exactly one `grading_lock` snapshot exists.
- Snapshot JSON includes metadata, ordered questions, choices, answers,
  rubrics, and topic IDs.
- Patch/reorder/return-to-draft returns `exam_locked`.
- Same key and same canonical payload returns byte-equivalent result.
- Same key with changed payload returns `idempotency_conflict`.
- Same key reused for another exam also conflicts.

- [ ] **Step 2: Write failing grading progress tests**

Cover:

- Grading before lock returns `exam_not_locked`.
- `graded > total`, `scored > graded`, or negative counts return
  `invalid_grading_counts`.
- Counts may not decrease.
- Total must match the first-submission total.
- Partial progress keeps `preparing_exam`.
- Only `graded == scored == total > 0` moves to `done`.
- Retry of a completed callback is idempotent.
- Teacher mutation remains locked after `done`.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
cd backend
go test ./internal/exam -run "Submission|Grading|Idempot" -v
```

Expected: missing callback methods.

- [ ] **Step 4: Implement canonical event processing**

Canonical JSON uses `encoding/json` on structs with fixed field order. In one
transaction:

1. Query `(event_type, idempotency_key)`.
2. Existing identical payload returns stored result.
3. Existing different payload returns `idempotency_conflict`.
4. Lock exam row.
5. Validate state and monotonic counts.
6. Apply snapshot/progress/status update.
7. Append audit.
8. Insert event with payload and result.
9. Commit.

First submission does not increment teacher-edit version. Grading completion
does not increment teacher-edit version.

- [ ] **Step 5: Run GREEN and regression**

Run:

```powershell
cd backend
go test ./internal/exam -v
go test ./internal/... -v
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```powershell
git add backend/internal/exam
git commit -m "feat(exams): lock exams and track grading callbacks"
```

---

### Task 6: Versioned DOCX exporter and authenticated downloads

**Files:**

- Create: `backend/internal/exam/exporter.go`
- Modify: `backend/internal/exam/domain.go`
- Modify: `backend/internal/exam/repository.go`
- Modify: `backend/internal/exam/service.go`
- Create: `backend/internal/exam/exporter_test.go`
- Create: `backend/internal/exam/service_export_test.go`
- Modify: `.gitignore`

**Interfaces:**

- Produces: `Exporter.Export(snapshot Detail, options ExportOptions, destination string) error`.
- Produces: `ExportDOCX`, `ListExports`, and `ExportFile`.

- [ ] **Step 1: Write failing OpenXML package tests**

Generate both styles into a temp directory and open the file with
`archive/zip`. Assert entries:

- `[Content_Types].xml`
- `_rels/.rels`
- `word/document.xml`
- `word/_rels/document.xml.rels`
- `word/styles.xml`

Read `word/document.xml` and assert it contains escaped title, ordered
questions, choices, `ĐÁP ÁN VÀ BAREM`, rubric descriptions, score strings, and
topic UUIDs. A compact export with answer/rubric disabled must omit that
section.

- [ ] **Step 2: Write failing service export tests**

Cover:

- Invalid exam cannot export.
- Stale version conflicts.
- Export record stores current version and safe `.docx` file name.
- JSON result omits physical path.
- Other teacher cannot list/download.
- Failed DB insert removes the generated file.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
cd backend
go test ./internal/exam -run "DOCX|Export" -v
```

Expected: exporter and service methods are missing.

- [ ] **Step 4: Implement DOCX with the standard library**

`exporter.go` must write a valid minimal WordprocessingML ZIP:

- A4 section size and 2 cm margins.
- Arial 12 pt for standard, 10.5 pt for compact.
- Centered title and metadata.
- `Câu N (x điểm).` and ordered choices.
- Five blank answer lines for standard essay, two for compact.
- Page break before answer/rubric section.
- XML escaping through `encoding/xml`, never string interpolation of raw user
  content.

File names:

```go
func SafeDOCXName(title string, version int) string
```

Normalize Vietnamese diacritics with `golang.org/x/text/unicode/norm`, keep
ASCII alphanumeric/hyphens, cap slug at 80 chars, and return
`<slug>-v<version>.docx`.

- [ ] **Step 5: Implement export service**

Flow:

1. Lock owned exam and check expected version.
2. Load detail and validate.
3. Create immutable `export` snapshot.
4. Write to `<exportDir>/<exportID>/<safeName>`.
5. Insert export and audit rows only after successful write.
6. Remove the file and directory if transaction persistence fails.

Add `backend/data/exam-exports/` to `.gitignore`.

- [ ] **Step 6: Run GREEN and regression**

Run:

```powershell
cd backend
go test ./internal/exam -v
go test ./internal/... -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```powershell
git add backend/internal/exam .gitignore
git commit -m "feat(exams): export versioned DOCX files"
```

---

### Task 7: Fiber handlers, role middleware, routes, and environment config

**Files:**

- Create: `backend/internal/middleware/role.go`
- Create: `backend/internal/middleware/role_test.go`
- Create: `backend/internal/handler/exam.go`
- Create: `backend/internal/handler/exam_test.go`
- Modify: `backend/cmd/server/main.go:56`
- Modify: `backend/.env.example`
- Modify: `backend/internal/config/db.go`

**Interfaces:**

- Consumes: Task 2–6 `exam.Service`.
- Produces: all `/api/teacher/exams`, `/api/teacher/exam-bank`, and
  `/internal/exams` routes from the spec.

- [ ] **Step 1: Write failing role middleware tests**

Build signed JWTs for teacher and student claims. Assert:

- Teacher passes `RequireRole("teacher")`.
- Student gets 403 with code `teacher_required`.
- Missing parsed token gets 401.

- [ ] **Step 2: Write failing handler contract tests**

Create a Fiber test app with the real test database and JWT middleware. Cover:

- Teacher create/list/get.
- Student rejected.
- Actor ID comes from token even when payload includes an unknown field.
- Unknown JSON field returns 400 `invalid_request`.
- Version conflict returns 409 and stable code.
- Validation returns 200 `{valid:false, errors:[...]}`.
- DOCX response has correct content type and `Content-Disposition`.
- Internal callback rejects missing/wrong token.
- Internal callback requires `Idempotency-Key`.

- [ ] **Step 3: Run tests and verify RED**

Run:

```powershell
cd backend
go test ./internal/middleware ./internal/handler -run "Role|Exam" -v
```

Expected: missing middleware/handler compile failures.

- [ ] **Step 4: Implement `RequireRole`**

Read the already-parsed JWT from `c.Locals("user")`. Require exact string claim
and return JSON:

```json
{"error":{"code":"teacher_required","message":"Chỉ giáo viên được truy cập mục này."}}
```

- [ ] **Step 5: Implement strict request binding and error mapping**

`ExamHandler` uses a JSON decoder that rejects unknown fields and maps:

- validation/bad request → 400
- unauthorized → 401
- wrong role/ownership-sensitive forbidden → 403 only where appropriate
- not found/ownership hiding → 404
- lock/version/idempotency/state conflict → 409
- domain validation list → 422 when used by prepare/export

All teacher handlers read `userID` from Fiber locals.

- [ ] **Step 6: Register services and routes**

In `main.go`:

```go
examRepo := exam.NewRepository(config.DB)
examSvc := exam.NewService(
    examRepo,
    exam.NewDOCXExporter(),
    config.ExamExportDir(),
)
examHandler := handler.NewExamHandler(examSvc, os.Getenv("EXAM_INTERNAL_TOKEN"))
```

Create a teacher subgroup:

```go
teacherExams := api.Group("/teacher", middleware.RequireRole("teacher"))
```

Register every API path from design section 6. Internal callbacks are outside
JWT middleware and use the internal token dependency.

- [ ] **Step 7: Add configuration**

`backend/.env.example`:

```dotenv
EXAM_INTERNAL_TOKEN=change-me-for-production
EXAM_EXPORT_DIR=./data/exam-exports
```

`config.ExamExportDir()` resolves the env value relative to the backend working
directory and creates it with owner-only write permissions when possible.
Startup must fail if `EXAM_INTERNAL_TOKEN` is empty outside an explicit
`APP_ENV=development`.

- [ ] **Step 8: Run GREEN and backend regression**

Run:

```powershell
cd backend
go test ./... -v
go vet ./...
```

Expected: tests and vet pass.

- [ ] **Step 9: Commit**

```powershell
git add backend/internal/middleware backend/internal/handler backend/cmd/server/main.go backend/.env.example backend/internal/config
git commit -m "feat(exams): expose teacher exam APIs"
```

---

### Task 8: Typed frontend exam API, score helpers, and test harness

**Files:**

- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/features/exams/types.ts`
- Create: `frontend/src/features/exams/api.ts`
- Create: `frontend/src/features/exams/helpers.ts`
- Create: `frontend/src/features/exams/helpers.test.ts`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**

- Produces: frontend types matching Go JSON exactly.
- Produces: `examApi` methods for every teacher authoring route.
- Produces: `sumQuestionPoints`, `moveItem`, `validationIndex`.
- Produces: `apiFetchBlob`.

- [ ] **Step 1: Add Vitest and write failing helper tests**

Run:

```powershell
cd frontend
npm install --save-dev vitest@4.1.10 jsdom@29.1.1
```

Add script:

```json
"test": "vitest run"
```

Tests:

```ts
expect(sumQuestionPoints([{ points: "1.25" }, { points: "2.75" }]))
  .toBe("4.00");
expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
expect(validationIndex(errors).byQuestion.get("q1")).toHaveLength(2);
```

Use integer cents in helpers; never `parseFloat` for score totals.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
cd frontend
npm test -- src/features/exams/helpers.test.ts
```

Expected: module-not-found failure.

- [ ] **Step 3: Implement types and helpers**

Define:

```ts
export type ExamStatus = "drafting" | "preparing_exam" | "done";
export type ExamQuestionType = "single_choice" | "essay";
export type ExamSourceType = "question_bank" | "manual";
```

Add complete `ExamDetail`, `ExamQuestion`, `ExamRubricItem`,
`ValidationError`, `ExamExport`, `BankQuestion`, and input types using
camelCase fields returned by Go.

`sumQuestionPoints` parses `/^\d{1,5}(\.\d{1,2})?$/` into cents and formats two
digits.

- [ ] **Step 4: Implement typed API and blob download**

Extend `apiFetch` support with:

```ts
export async function apiFetchBlob(
  endpoint: string,
  options: ApiOptions = {},
): Promise<{ blob: Blob; fileName: string }>;
```

It reuses auth/error handling, reads `Content-Disposition`, and never attempts
JSON parsing on success. `examApi` wraps all paths so the component does not
concatenate URLs.

- [ ] **Step 5: Run GREEN, typecheck, and build**

Run:

```powershell
cd frontend
npm test
npx tsc --noEmit
npm run build
```

Expected: tests, typecheck, and build pass.

- [ ] **Step 6: Commit**

```powershell
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/features/exams frontend/src/lib/api.ts
git commit -m "feat(exams): add typed frontend exam client"
```

---

### Task 9: Exam builder component and teacher sidebar integration

**Files:**

- Create: `frontend/src/app/teacher/components/ExamBuilderTab.tsx`
- Create: `frontend/src/app/teacher/components/ExamBuilderTab.test.tsx`
- Create: `frontend/src/app/teacher/components/exams/ExamListPanel.tsx`
- Create: `frontend/src/app/teacher/components/exams/ExamCanvas.tsx`
- Create: `frontend/src/app/teacher/components/exams/QuestionBankPanel.tsx`
- Create: `frontend/src/app/teacher/components/exams/QuestionEditor.tsx`
- Create: `frontend/src/app/teacher/components/exams/RubricEditor.tsx`
- Create: `frontend/src/app/teacher/components/exams/ExamToolbar.tsx`
- Create: `frontend/src/app/teacher/navigation.ts`
- Create: `frontend/src/app/teacher/navigation.test.ts`
- Modify: `frontend/src/app/teacher/page.tsx:23`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/vitest.config.ts`

**Interfaces:**

- Consumes: Task 8 `examApi`, types, and helpers.
- Produces: `ExamBuilderTab` and sidebar tab ID `exam-builder`.

- [ ] **Step 1: Write the failing Playwright smoke before UI wiring**

Create `tests/exam_builder_smoke.py` with the complete flow described in Task
10. Run it once against the current teacher dashboard and verify it fails at
the missing `Tạo đề kiểm tra` sidebar tab.

- [ ] **Step 2: Add component-test dependencies**

Run:

```powershell
cd frontend
npm install --save-dev @testing-library/react@16.3.2 @testing-library/user-event@14.6.1 @testing-library/jest-dom@6.9.1
```

Configure Vitest with `environment: "jsdom"` and a setup file importing
`@testing-library/jest-dom/vitest`.

- [ ] **Step 3: Write failing navigation and component tests**

Navigation test asserts:

```ts
expect(teacherNavigation).toContainEqual(
  expect.objectContaining({ id: "exam-builder", label: "Tạo đề kiểm tra" }),
);
```

Component tests, with `examApi` mocked only at the HTTP boundary, assert:

- Initial load lists exams.
- Clicking `Tạo đề mới` opens metadata form.
- Selecting a subject loads bank questions/topics.
- Adding a bank question updates version and score meter.
- Drag/reorder sends every question ID.
- A 409 `version_conflict` reloads detail and shows toast.
- Validation errors render beside the matching question/rubric.
- Locked/done exam disables mutations.
- Export invokes `apiFetchBlob` and revokes the object URL.

- [ ] **Step 4: Run tests and verify RED**

Run:

```powershell
cd frontend
npm test -- src/app/teacher/navigation.test.ts src/app/teacher/components/ExamBuilderTab.test.tsx
```

Expected: missing component/navigation modules.

- [ ] **Step 5: Implement focused UI components**

Responsibilities:

- `ExamListPanel`: search/status filters, selection, create action.
- `ExamCanvas`: sortable question cards, score meter, selection.
- `QuestionBankPanel`: subject/node/difficulty/search filters and add action.
- `QuestionEditor`: metadata/manual question/choice editing.
- `RubricEditor`: essay rubric rows, topics, points, reorder.
- `ExamToolbar`: status/version, validate, prepare, return, export.
- `ExamBuilderTab`: state orchestration and API calls only.

Use HTML drag events already used by the project; do not add a drag-and-drop
dependency. All Vietnamese copy must match the spec’s state meanings.

- [ ] **Step 6: Integrate the sidebar and main content**

Refactor sidebar labels into `teacherNavigation`, add Lucide `FilePenLine`, add
`"exam-builder"` to `ActiveTab`, include title/subtitle mapping, and render:

```tsx
<ExamBuilderTab subjects={subjects} />
```

The tab must be available after login without first selecting a subject;
subject is selected inside exam metadata.

- [ ] **Step 7: Run GREEN and frontend regression**

Run:

```powershell
cd frontend
npm test
npx tsc --noEmit
npm run build
```

Expected: tests, typecheck, and production build pass.

- [ ] **Step 8: Commit**

```powershell
git add frontend/src/app/teacher frontend/package.json frontend/package-lock.json frontend/vitest.config.ts
git commit -m "feat(exams): add teacher exam builder tab"
```

---

### Task 10: End-to-end smoke, runtime documentation, and final regression

**Files:**

- Create: `tests/exam_builder_smoke.py`
- Modify: `README.md`
- Modify: `run.ps1`
- Modify: `backend/.env.example`

**Interfaces:**

- Consumes: complete backend and frontend.
- Produces: repeatable browser evidence and local startup instructions.

- [ ] **Step 1: Confirm the Task 9 Playwright smoke contract**

`tests/exam_builder_smoke.py`, created and observed RED in Task 9, must:

1. Open `http://127.0.0.1:3000/login`.
2. Click teacher demo login.
3. Click sidebar `Tạo đề kiểm tra`.
4. Create a 10-point exam.
5. Add one bank question.
6. Add one manual essay.
7. Add rubric rows and topics so totals equal 10.
8. Drag the essay above the bank question.
9. Validate and prepare.
10. Export DOCX and assert suggested filename ends in `.docx`.
11. Save screenshots to a temp directory only when a step fails.

Do not replace it with a second smoke script; Task 10 runs the same contract
against the complete live system.

- [ ] **Step 2: Update local startup**

`run.ps1` must:

- Set/display Go backend port consistently as `8081`.
- Start PostgreSQL, Go backend, FastAPI learning-path, and Next.js.
- Not start `create_exam_backend`.
- Check that `EXAM_INTERNAL_TOKEN` exists in `backend/.env`.
- Print the exam API and frontend URLs.

README must document:

- New teacher tab.
- `EXAM_INTERNAL_TOKEN` and `EXAM_EXPORT_DIR`.
- Main bank mapping from `Node`/`Question`.
- Callback examples with both required headers.
- DOCX support and PDF exclusion.
- Test commands below.

- [ ] **Step 3: Run backend verification**

Run:

```powershell
cd backend
gofmt -w internal/exam internal/handler/exam.go internal/handler/exam_test.go internal/middleware/role.go internal/middleware/role_test.go internal/model/exam_models.go internal/testutil/postgres.go
go test ./... -count=1 -v
go vet ./...
```

Expected: zero failures and zero vet findings.

- [ ] **Step 4: Run module regression**

Run from repository root:

```powershell
python -m pytest create_exam_backend/tests -q
```

Expected: `25 passed`.

- [ ] **Step 5: Run frontend verification**

Run:

```powershell
cd frontend
npm test
npx tsc --noEmit
npm run build
```

Expected: all tests pass, TypeScript exits 0, Next.js production build exits
0.

- [ ] **Step 6: Run browser smoke against live services**

Start services with `run.ps1`, then:

```powershell
python tests/exam_builder_smoke.py
```

Expected: `Create exam main integration smoke test passed`.

- [ ] **Step 7: Verify working tree and generated artifacts**

Run:

```powershell
git status --short
git diff --check
```

Expected:

- No `.docx`, PostgreSQL data, export data, `.next`, `node_modules`, or test
  screenshots are tracked.
- Only intended source/docs changes remain.
- No whitespace errors.

- [ ] **Step 8: Commit**

```powershell
git add README.md run.ps1 backend/.env.example tests/exam_builder_smoke.py
git commit -m "docs(exams): document integrated exam workflow"
```

---

## Coverage matrix

| Spec requirement | Tasks |
|---|---|
| Go/Fiber/GORM/PostgreSQL runtime | 1, 2, 7 |
| Main `Node`/`Question` data reuse | 3 |
| Snapshot bank questions | 3 |
| Manual question authoring | 3 |
| Rubric and topic tagging | 4 |
| Exact score validation | 1, 4 |
| Ownership and JWT teacher role | 2, 7 |
| Optimistic locking | 2–4, 6 |
| Draft/preparing/done lifecycle | 4, 5 |
| Immutable first-submission snapshot | 5 |
| Idempotent internal callbacks | 5, 7 |
| Versioned DOCX | 6, 7 |
| Teacher sidebar tab | 9 |
| Concurrency/error UX | 8, 9 |
| Browser flow | 10 |
| Python-module regression | 10 |

## Definition of Done

- Every new behavior was introduced by a test that was observed failing for
  the expected missing behavior.
- All Go tests and `go vet` pass against a disposable PostgreSQL test schema.
- All frontend unit/component tests, TypeScript checking, and production build
  pass.
- The existing 25 `create_exam_backend` tests remain green.
- Playwright completes the teacher create/reorder/validate/prepare/export flow.
- A clean main runtime does not require the FastAPI create-exam service.
- No generated DOCX, database, build, dependency, or screenshot artifacts are
  tracked.
