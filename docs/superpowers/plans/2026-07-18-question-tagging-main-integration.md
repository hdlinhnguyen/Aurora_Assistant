# Question Tagging Main Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port manual multi-topic question and rubric tagging into the main Go/PostgreSQL backend and Next.js teacher question bank without changing or deleting existing question data.

**Architecture:** Add additive GORM models and a focused tagging service/handler beside the existing tutor service. The new teacher question-bank API uses typed DTOs, JWT-derived actors, relational mappings, virtual legacy state, and optimistic locking. The frontend keeps the existing teacher dashboard but delegates tagging to a self-contained side panel.

**Tech Stack:** Go 1.26, Fiber v3, GORM, PostgreSQL, UUID, Next.js 16, React 19, TypeScript, Tailwind CSS, existing Radix UI components.

## Global Constraints

- Keep `Question.NodeID`, `Node.Subject`, `OptionsJSON`, `CorrectOption`, legacy routes, and all existing records.
- Do not run or call FastAPI at runtime.
- Tagging is manual; never infer parent, child, or prerequisite topics.
- Topic validity is based on exact equality of the source node's `Subject`.
- The actor comes from JWT `sub`; mutation bodies never accept `updatedBy`.
- A question copied into an exam receives an independent snapshot; the current repository has no `ExamService`, so expose a snapshot-ready service result without inventing the whole exam module.
- Do not commit changes generated in `ai-log/`.

---

## File Structure

- `backend/internal/model/models.go`: additive question, rubric, mapping, and version models.
- `backend/internal/config/db.go`: register additive models with AutoMigrate.
- `backend/internal/service/tagging_service.go`: domain types, validation, effective-topic calculation, transactions, and snapshot-ready context.
- `backend/internal/service/tagging_service_test.go`: tagging behavior and concurrency tests.
- `backend/internal/handler/tagging.go`: typed Fiber DTOs, teacher authorization, actor extraction, and error responses.
- `backend/internal/handler/tagging_test.go`: HTTP status, JWT actor, and role tests.
- `backend/cmd/server/main.go`: construct the service/handler and register teacher routes.
- `frontend/src/lib/api.ts`: structured `ApiError` preserving status, code, details, and latest context.
- `frontend/src/app/teacher/components/QuestionTaggingPanel.tsx`: isolated tagging side panel.
- `frontend/src/app/teacher/components/QuestionBankTab.tsx`: add type filter, tag badges, and panel trigger.
- `frontend/src/app/teacher/page.tsx`: extend question types and connect selected question/panel state.

### Task 1: Additive Question and Tagging Models

**Files:**
- Modify: `backend/internal/model/models.go`
- Modify: `backend/internal/config/db.go`
- Test: `backend/internal/service/tagging_service_test.go`

**Interfaces:**
- Produces: `QuestionRubricItem`, `QuestionTopicMapping`, `QuestionRubricItemTopicMapping`, and `QuestionTaggingState`.
- Produces: `Question.QuestionType string` and `Question.GradeLevel string`.

- [ ] **Step 1: Write the failing model-default test**

```go
func TestLegacyQuestionDefaultsToMultipleChoice(t *testing.T) {
    db := openTaggingTestDB(t)
    migrateTaggingTestDB(t, db)
    question := model.Question{ID: uuid.New(), NodeID: uuid.New(), Content: "1+1?", OptionsJSON: `["1","2"]`, CorrectOption: 1}
    require.NoError(t, db.Create(&question).Error)
    var stored model.Question
    require.NoError(t, db.First(&stored, "id = ?", question.ID).Error)
    require.Equal(t, "multiple_choice", stored.QuestionType)
}
```

- [ ] **Step 2: Run the test and confirm the missing fields fail compilation**

Run: `cd backend; go test ./internal/service -run TestLegacyQuestionDefaultsToMultipleChoice -v`

Expected: FAIL because `QuestionType` and tagging models are undefined.

- [ ] **Step 3: Add the model fields and tables**

```go
type Question struct {
    // existing fields stay unchanged
    QuestionType string `gorm:"type:varchar(20);not null;default:'multiple_choice'" json:"questionType"`
    GradeLevel   string `gorm:"type:varchar(50)" json:"gradeLevel"`
}

type QuestionRubricItem struct {
    ID uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
    QuestionID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_question_rubric_position" json:"questionId"`
    Content string `gorm:"type:text;not null" json:"content"`
    Points float64 `gorm:"type:numeric(10,2);not null" json:"points"`
    Position int `gorm:"not null;uniqueIndex:idx_question_rubric_position" json:"position"`
    CreatedAt time.Time `json:"createdAt"`
    UpdatedAt time.Time `json:"updatedAt"`
}
```

Add mapping models with composite primary keys and `OnDelete:CASCADE` foreign keys.
Add every new model to `config.ConnectDB`'s `AutoMigrate` list after `Question`.

- [ ] **Step 4: Run the model test**

Run: `cd backend; go test ./internal/service -run TestLegacyQuestionDefaultsToMultipleChoice -v`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/internal/model/models.go backend/internal/config/db.go backend/internal/service/tagging_service_test.go backend/go.mod backend/go.sum
git commit -m "feat: add question tagging data models"
```

### Task 2: Implement Tagging Domain Service

**Files:**
- Create: `backend/internal/service/tagging_service.go`
- Modify: `backend/internal/service/tagging_service_test.go`

**Interfaces:**
- Consumes: additive models from Task 1.
- Produces: `NewTaggingService(db *gorm.DB) *TaggingService`.
- Produces: `GetContext(questionID uuid.UUID) (*TaggingContext, error)`.
- Produces: `SetQuestionTopics(questionID uuid.UUID, topicIDs []uuid.UUID, expectedVersion int, actorID uuid.UUID) (*TaggingContext, error)`.
- Produces: `SetRubricItemTopics(questionID, rubricID uuid.UUID, topicIDs []uuid.UUID, expectedVersion int, actorID uuid.UUID) (*TaggingContext, error)`.
- Produces: stable `DomainError` codes and `VersionConflict.LatestContext`.

- [ ] **Step 1: Write failing virtual-state and effective-topic tests**

```go
func TestGetContextUsesLegacyNodeAsVirtualTag(t *testing.T) {
    fixture := newTaggingFixture(t)
    ctx, err := fixture.service.GetContext(fixture.question.ID)
    require.NoError(t, err)
    require.Equal(t, 1, ctx.Version)
    require.Equal(t, []uuid.UUID{fixture.sourceNode.ID}, ctx.DirectTopicIDs)
}

func TestEssayEffectiveTopicsAreDeduplicatedUnion(t *testing.T) {
    fixture := newEssayTaggingFixture(t)
    ctx, err := fixture.service.SetRubricItemTopics(
        fixture.question.ID, fixture.rubric.ID,
        []uuid.UUID{fixture.sourceNode.ID, fixture.secondNode.ID},
        2, fixture.teacher.ID,
    )
    require.NoError(t, err)
    require.ElementsMatch(t, []uuid.UUID{fixture.sourceNode.ID, fixture.secondNode.ID}, topicIDs(ctx.EffectiveTopics))
}
```

- [ ] **Step 2: Run tests to verify failure**

Run: `cd backend; go test ./internal/service -run 'TestGetContextUsesLegacyNode|TestEssayEffectiveTopics' -v`

Expected: FAIL because `TaggingService` is undefined.

- [ ] **Step 3: Implement read context and virtual state**

Use `Question` joined to its source `Node` to derive subject. If no state row exists,
return version 1 with the legacy `NodeID`; do not write during a GET.

```go
type TaggingContext struct {
    Question QuestionSummary `json:"question"`
    RubricItems []RubricTaggingItem `json:"rubricItems"`
    AvailableTopics []model.Node `json:"availableTopics"`
    DirectTopicIDs []uuid.UUID `json:"directTopicIds"`
    EffectiveTopics []model.Node `json:"effectiveTopics"`
    Version int `json:"version"`
    UpdatedBy *uuid.UUID `json:"updatedBy"`
    UpdatedAt time.Time `json:"updatedAt"`
}
```

- [ ] **Step 4: Implement transactional replacement and versioning**

Within one `db.Transaction`:

1. Load the question and source node.
2. Validate no more than 200 unique topic UUIDs.
3. Load all topics and require the same subject.
4. Lock or create `QuestionTaggingState`.
5. Require `state.Version == expectedVersion`.
6. Delete only the edited mapping set and insert the replacement rows.
7. Update the state with `version = version + 1`, actor, and timestamp.
8. Build the response from the same transaction.

Use `clause.Locking{Strength: "UPDATE"}` for PostgreSQL. When a state does not exist,
create it at version 1 before applying the first replacement.

- [ ] **Step 5: Add validation, empty-set, and conflict tests**

Cover `topic_not_found`, `topic_subject_mismatch`, rubric ownership, empty direct
topics, preservation of a direct tag removed from a rubric, and two writes with the
same expected version.

- [ ] **Step 6: Run service tests**

Run: `cd backend; go test ./internal/service -run Tagging -v`

Expected: all tagging tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/internal/service/tagging_service.go backend/internal/service/tagging_service_test.go
git commit -m "feat: implement question tagging service"
```

### Task 3: Add Typed Teacher Tagging API

**Files:**
- Create: `backend/internal/handler/tagging.go`
- Create: `backend/internal/handler/tagging_test.go`
- Modify: `backend/cmd/server/main.go`

**Interfaces:**
- Consumes: `TaggingService` methods from Task 2.
- Produces: teacher tagging context, direct topic, rubric topic, and effective-topic routes.

- [ ] **Step 1: Write failing HTTP role and actor tests**

```go
func TestSetQuestionTopicsRejectsStudent(t *testing.T) {
    app := newTaggingTestApp(t)
    req := httptest.NewRequest(http.MethodPut, "/api/teacher/question-bank/questions/"+questionID+"/topics", strings.NewReader(`{"topicIds":[],"expectedVersion":1}`))
    req.Header.Set("Authorization", "Bearer "+studentToken)
    resp, err := app.Test(req)
    require.NoError(t, err)
    require.Equal(t, http.StatusForbidden, resp.StatusCode)
}
```

Also assert the persisted mapping's `CreatedBy` equals JWT `sub`, despite no actor
field in the JSON body.

- [ ] **Step 2: Run handler tests to verify failure**

Run: `cd backend; go test ./internal/handler -run Tagging -v`

Expected: FAIL because routes and handler do not exist.

- [ ] **Step 3: Implement handler DTOs and error mapper**

```go
type UpdateTopicsRequest struct {
    TopicIDs []uuid.UUID `json:"topicIds"`
    ExpectedVersion int `json:"expectedVersion"`
}

type APIError struct {
    Error struct {
        Code string `json:"code"`
        Message string `json:"message"`
        Details map[string]any `json:"details"`
    } `json:"error"`
    LatestContext *service.TaggingContext `json:"latestContext,omitempty"`
}
```

Add a helper that parses `c.Locals("user")`, requires claim `role == "teacher"`,
and parses `c.Locals("userID")`. Map domain errors to 404, 409, or 422.

- [ ] **Step 4: Register routes**

Construct `taggingSvc := service.NewTaggingService(config.DB)` and
`taggingHandler := handler.NewTaggingHandler(taggingSvc)`. Register all four
tagging routes under `/api/teacher/question-bank/questions`.

- [ ] **Step 5: Run handler and service tests**

Run: `cd backend; go test ./internal/handler ./internal/service`

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/internal/handler/tagging.go backend/internal/handler/tagging_test.go backend/cmd/server/main.go
git commit -m "feat: expose teacher question tagging API"
```

### Task 4: Extend the Shared Question Bank for Essays and Rubrics

**Files:**
- Create: `backend/internal/service/question_bank_service.go`
- Create: `backend/internal/service/question_bank_service_test.go`
- Create: `backend/internal/handler/question_bank.go`
- Modify: `backend/cmd/server/main.go`

**Interfaces:**
- Produces: typed list/detail/create/update question methods.
- Produces: rubric create/update/delete/reorder methods.
- Preserves: every existing tutor question route.

- [ ] **Step 1: Write failing validation tests**

Test that a multiple-choice question requires two choices and a valid answer, an
essay persists `OptionsJSON = "[]"` and `CorrectOption = -1`, a rubric can only be
added to an essay, and an essay with rubric cannot be changed to multiple choice.

- [ ] **Step 2: Run tests and verify failure**

Run: `cd backend; go test ./internal/service -run QuestionBank -v`

Expected: FAIL because `QuestionBankService` is undefined.

- [ ] **Step 3: Implement typed service and DTOs**

Use exact create/update DTOs rather than `map[string]interface{}`. List questions
by joining the source node and accept `subject`, `nodeId`, `type`, `difficulty`,
and case-insensitive `search` filters.

- [ ] **Step 4: Implement rubric transaction and reorder**

Reorder accepts the complete ordered rubric UUID list, verifies exact membership,
and updates positions in a transaction using temporary negative positions to
avoid the unique constraint.

- [ ] **Step 5: Add teacher routes without removing legacy routes**

Register question bank CRUD and rubric routes under
`/api/teacher/question-bank/questions`.

- [ ] **Step 6: Run backend tests**

Run: `cd backend; go test ./...`

Expected: PASS, including existing guardrail tests.

- [ ] **Step 7: Commit**

```powershell
git add backend/internal/service/question_bank_service.go backend/internal/service/question_bank_service_test.go backend/internal/handler/question_bank.go backend/cmd/server/main.go
git commit -m "feat: support essay questions and rubrics"
```

### Task 5: Preserve Structured API Errors in the Frontend

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Produces: `ApiError extends Error` with `status`, `code`, `details`, and `latestContext`.
- Preserves: existing call sites that read `error.message`.

- [ ] **Step 1: Add the structured error type**

```ts
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
    public readonly latestContext?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
```

- [ ] **Step 2: Throw `ApiError` for non-2xx responses**

Read `errorData.error.code`, `errorData.error.details`, and
`errorData.latestContext`; retain the existing Vietnamese message mapping.

- [ ] **Step 3: Run frontend build**

Run: `cd frontend; npm run build`

Expected: Next.js production build succeeds.

- [ ] **Step 4: Commit**

```powershell
git add frontend/src/lib/api.ts
git commit -m "feat: preserve structured API errors"
```

### Task 6: Build the Question Tagging Side Panel

**Files:**
- Create: `frontend/src/app/teacher/components/QuestionTaggingPanel.tsx`
- Modify: `frontend/src/app/teacher/components/QuestionBankTab.tsx`
- Modify: `frontend/src/app/teacher/page.tsx`

**Interfaces:**
- Consumes: tagging context and update routes from Task 3.
- Consumes: `ApiError` from Task 5.
- Produces: `QuestionTaggingPanel({questionId, open, onOpenChange, onSaved})`.

- [ ] **Step 1: Define frontend types and panel state**

Define `TaggingTopic`, `RubricTaggingItem`, and `TaggingContext` with camelCase
properties matching the Go JSON contract. Load context only while the panel is
open.

- [ ] **Step 2: Render searchable multi-select groups**

Use the existing `Sheet`, `Checkbox`, `Input`, `Badge`, `Button`, and `ScrollArea`
components. Render direct topics first, rubric groups for essays, and a read-only
effective-topic section.

- [ ] **Step 3: Implement save and conflict behavior**

Each save sends the current context version. On success replace the whole context.
On `ApiError` with status 409 and `latestContext`, replace context, show a toast,
and do not retry automatically.

- [ ] **Step 4: Connect the panel to question cards**

Add a `Tags` button beside edit/delete. Add question-type filter and badges.
The page owns only `taggingQuestionId`; the panel owns fetched tagging data.

- [ ] **Step 5: Run frontend build**

Run: `cd frontend; npm run build`

Expected: production build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/app/teacher/components/QuestionTaggingPanel.tsx frontend/src/app/teacher/components/QuestionBankTab.tsx frontend/src/app/teacher/page.tsx
git commit -m "feat: add manual question tagging panel"
```

### Task 7: Regression and Documentation Verification

**Files:**
- Modify only files needed to fix discovered integration regressions.

**Interfaces:**
- Verifies all prior tasks as one system.

- [ ] **Step 1: Format code**

Run: `cd backend; gofmt -w internal/model/models.go internal/service/tagging_service.go internal/service/tagging_service_test.go internal/service/question_bank_service.go internal/service/question_bank_service_test.go internal/handler/tagging.go internal/handler/tagging_test.go internal/handler/question_bank.go cmd/server/main.go`

- [ ] **Step 2: Run complete backend tests**

Run: `cd backend; go test ./...`

Expected: PASS.

- [ ] **Step 3: Run reference module tests**

Run: `python -m pytest question_tagging_backend/tests -q`

Expected: `18 passed`.

- [ ] **Step 4: Build frontend**

Run: `cd frontend; npm run build`

Expected: Next.js production build succeeds.

- [ ] **Step 5: Inspect the final diff**

Run: `git diff --check`

Expected: no whitespace errors. Confirm no deletion of legacy routes/models and
no staged `ai-log` file.

- [ ] **Step 6: Commit final integration fixes**

```powershell
git add backend frontend
git commit -m "test: verify question tagging integration"
```
