# Synthetic Exam History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed two realistic historical exams and approved results for every synthetic student whenever the Go backend starts with synthetic data enabled.

**Architecture:** Add deterministic exam fixture definitions and score derivation helpers in a focused synthetic-seed file, then persist the complete exam, snapshot, grading, result, approval, and audit graph inside the existing reset-and-seed transaction. Keep the existing frontend and API handlers unchanged; seeded exams remain compatible with the scoring workspace's current `preparing_exam` query while their grading batches and submissions are completed and approved.

**Tech Stack:** Go, GORM, PostgreSQL, `shopspring/decimal` through `model.Score`, testify, existing exam/scoring models.

## Global Constraints

- Do not add pages, tabs, controls, or synthetic-only frontend branches.
- Seed one single-choice exam and one essay exam for the existing synthetic teacher and all three synthetic students.
- Use deterministic content and past timestamps; backend restarts must restore the same logical scenario.
- Derive essay scores from rubric results and submission totals from question results.
- Keep all persistence inside the existing `ResetAndSeed` transaction.
- Delete only records linked to synthetic users or synthetic exam IDs.
- Preserve `ENABLE_SYNTHETIC_DATA=false` behavior.
- Do not stage or modify unrelated telemetry/mastery worktree changes.

## File Structure

- Create `backend/internal/syntheticseed/exam_history.go`: deterministic exam definitions, student outcome profiles, exact score derivation, persistence, and synthetic exam cleanup.
- Create `backend/internal/syntheticseed/exam_history_test.go`: pure scenario tests plus database integration assertions for exams, submissions, results, approvals, timestamps, and reseeding.
- Modify `backend/internal/syntheticseed/service.go`: call cleanup/creation from the existing transaction, expose exam counts in `Result`, and leave knowledge-path seeding behavior intact.
- Modify `backend/internal/syntheticseed/service_test.go`: migrate exam/scoring tables and retain existing preservation/idempotency coverage.
- Modify `backend/cmd/server/synthetic_startup_test.go`: assert startup still reports seeded results while the disabled flag skips the seeder.

---

### Task 1: Define deterministic historical exam scenarios

**Files:**
- Create: `backend/internal/syntheticseed/exam_history.go`
- Test: `backend/internal/syntheticseed/exam_history_test.go`

**Interfaces:**
- Consumes: `model.Score`, `model.ScoringResultCorrect`, `model.ScoringResultIncorrect`, and `model.ScoringResultUnanswered`.
- Produces: `historicalExamFixtures(config Config, nodeIDs []uuid.UUID) []historicalExamFixture`, `deriveHistoricalOutcome(exam historicalExamFixture, studentIndex int) historicalOutcome`, and `validateHistoricalOutcome(exam historicalExamFixture, outcome historicalOutcome) error`.

- [ ] **Step 1: Write failing tests for both formats and distinct student outcomes**

```go
func TestHistoricalExamFixturesContainObjectiveAndEssayExams(t *testing.T) {
	nodes := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	fixtures := historicalExamFixtures(DefaultConfig(), nodes)
	require.Len(t, fixtures, 2)
	require.Equal(t, "single_choice", fixtures[0].Questions[0].QuestionType)
	require.Equal(t, "essay", fixtures[1].Questions[0].QuestionType)
	require.NotEmpty(t, fixtures[0].Questions[0].Choices)
	require.NotEmpty(t, fixtures[1].Questions[0].Rubrics)
}

func TestHistoricalOutcomesDeriveRubricAndSubmissionTotals(t *testing.T) {
	fixtures := historicalExamFixtures(DefaultConfig(), []uuid.UUID{uuid.New(), uuid.New(), uuid.New()})
	for _, exam := range fixtures {
		strong := deriveHistoricalOutcome(exam, 0)
		developing := deriveHistoricalOutcome(exam, 1)
		struggling := deriveHistoricalOutcome(exam, 2)
		require.NoError(t, validateHistoricalOutcome(exam, strong))
		require.NoError(t, validateHistoricalOutcome(exam, developing))
		require.NoError(t, validateHistoricalOutcome(exam, struggling))
		require.True(t, strong.Total.Decimal.GreaterThan(developing.Total.Decimal))
		require.True(t, developing.Total.Decimal.GreaterThan(struggling.Total.Decimal))
	}
}
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd backend && go test ./internal/syntheticseed -run 'TestHistorical' -count=1`

Expected: FAIL because the historical fixture types and functions do not exist.

- [ ] **Step 3: Implement minimal fixture and outcome types**

```go
type historicalExamFixture struct {
	Key, Title, Instructions string
	Age                      time.Duration
	DurationMinutes          int
	Questions                []historicalQuestionFixture
}

type historicalQuestionFixture struct {
	Key, QuestionType, Content string
	Points                     model.Score
	TopicNodeID                uuid.UUID
	Choices                    []historicalChoiceFixture
	CorrectChoiceID            string
	Rubrics                    []historicalRubricFixture
}

type historicalRubricFixture struct {
	Key, Description string
	Points           model.Score
}

type historicalResult struct {
	Status        string
	Reviewed      bool
	AwardedPoints model.Score
	Rubrics       []historicalResult
}

type historicalOutcome struct {
	Questions []historicalResult
	Total     model.Score
}
```

Define two deterministic 10-point fixtures:

- `synthetic-objective-history`: four 2.5-point single-choice fraction/decimal questions, 14 days old.
- `synthetic-essay-history`: two 5-point essay questions, each with 2-point and 3-point rubric items, 7 days old.

Use the three outcome profiles below:

```go
var objectiveStatuses = [][]string{
	{model.ScoringResultCorrect, model.ScoringResultCorrect, model.ScoringResultCorrect, model.ScoringResultCorrect},
	{model.ScoringResultCorrect, model.ScoringResultIncorrect, model.ScoringResultCorrect, model.ScoringResultIncorrect},
	{model.ScoringResultIncorrect, model.ScoringResultUnanswered, model.ScoringResultCorrect, model.ScoringResultIncorrect},
}

var essayRubricStatuses = [][][]string{
	{{model.ScoringResultCorrect, model.ScoringResultCorrect}, {model.ScoringResultCorrect, model.ScoringResultCorrect}},
	{{model.ScoringResultCorrect, model.ScoringResultIncorrect}, {model.ScoringResultIncorrect, model.ScoringResultCorrect}},
	{{model.ScoringResultIncorrect, model.ScoringResultIncorrect}, {model.ScoringResultCorrect, model.ScoringResultIncorrect}},
}
```

Calculate objective points with the question's points only for `correct`. Calculate each essay result from its rubric statuses, then sum question results for `historicalOutcome.Total`. `validateHistoricalOutcome` rejects count mismatches and totals that differ from their derived values.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `cd backend && go test ./internal/syntheticseed -run 'TestHistorical' -count=1`

Expected: PASS.

- [ ] **Step 5: Commit the deterministic scenario**

```bash
git add backend/internal/syntheticseed/exam_history.go backend/internal/syntheticseed/exam_history_test.go
git commit -m "test: define synthetic exam history scenarios"
```

---

### Task 2: Persist the complete exam and approved scoring graph

**Files:**
- Modify: `backend/internal/syntheticseed/exam_history.go`
- Modify: `backend/internal/syntheticseed/service.go`
- Modify: `backend/internal/syntheticseed/service_test.go`
- Test: `backend/internal/syntheticseed/exam_history_test.go`

**Interfaces:**
- Consumes: `historicalExamFixtures`, `deriveHistoricalOutcome`, the teacher/student rows created by `createSyntheticData`, and the non-root synthetic node IDs.
- Produces: `createHistoricalExamData(tx *gorm.DB, config Config, teacher model.User, students []model.User, nodeIDs []uuid.UUID, now time.Time) ([]model.Exam, int, error)` and `resetHistoricalExamData(tx *gorm.DB, teacherIDs []uuid.UUID) error`.

- [ ] **Step 1: Extend the test schema and write the failing persistence test**

Add these models to `setupSeedDatabase`:

```go
&model.Exam{}, &model.ExamQuestion{}, &model.ExamRubricItem{},
&model.ExamSnapshot{}, &model.ExamGradingProgress{}, &model.ExamInternalEvent{},
&model.ExamAuditLog{}, &model.GradingBatch{}, &model.ScoringSubmission{},
&model.ScoringQuestionResult{}, &model.ScoringRubricResult{},
&model.ScoringApprovalSnapshot{}, &model.ScoringAuditLog{}, &model.ScoringInternalEvent{},
```

Add the integration test:

```go
func TestResetAndSeedCreatesApprovedHistoricalResultsForEveryStudent(t *testing.T) {
	service := setupSeedDatabase(t)
	result, err := service.ResetAndSeed(context.Background())
	require.NoError(t, err)
	require.Equal(t, 2, result.ExamCount)
	require.Equal(t, 6, result.ApprovedSubmissionCount)

	var exams []model.Exam
	require.NoError(t, service.db.Where("created_by = ?", result.Teacher.ID).Order("created_at").Find(&exams).Error)
	require.Len(t, exams, 2)
	require.Equal(t, model.ExamStatusPreparingExam, exams[0].Status)
	require.NotNil(t, exams[0].LockedSnapshotID)
	require.True(t, exams[0].CreatedAt.Before(time.Now().UTC().Add(-24*time.Hour)))

	for _, student := range result.Students {
		var submissions []model.ScoringSubmission
		require.NoError(t, service.db.
			Joins("JOIN grading_batches ON grading_batches.id = scoring_submissions.grading_batch_id").
			Where("scoring_submissions.student_id = ? AND grading_batches.created_by = ?", student.ID, result.Teacher.ID).
			Find(&submissions).Error)
		require.Len(t, submissions, 2)
		for _, submission := range submissions {
			require.Equal(t, model.ScoringSubmissionStatusApproved, submission.Status)
			require.Equal(t, 1, submission.EffectiveApprovalVersion)
			var approvals int64
			require.NoError(t, service.db.Model(&model.ScoringApprovalSnapshot{}).
				Where("submission_id = ?", submission.ID).Count(&approvals).Error)
			require.EqualValues(t, 1, approvals)
		}
	}
}
```

- [ ] **Step 2: Run the persistence test and verify RED**

Run: `cd backend && go test ./internal/syntheticseed -run TestResetAndSeedCreatesApprovedHistoricalResultsForEveryStudent -count=1`

Expected: FAIL because `Result` has no exam counts and no historical exam graph is seeded.

- [ ] **Step 3: Add result metadata and invoke exam seeding inside the transaction**

Extend `Result`:

```go
ExamCount               int
ApprovedSubmissionCount int
```

After users, nodes, and questions are created in `createSyntheticData`, call:

```go
exams, approvedCount, err := createHistoricalExamData(
	tx, config, teacher, students, nodeIDs[1:], time.Now().UTC().Truncate(time.Minute),
)
if err != nil {
	return Result{}, err
}
```

Return `len(exams)` and `approvedCount` in `Result`.

- [ ] **Step 4: Implement exam graph persistence**

For each fixture:

1. Create a `model.Exam` with deterministic past `CreatedAt`/`UpdatedAt`, 10 points, version 1, and `model.ExamStatusPreparingExam` so the existing scoring workspace query can list it.
2. Create `model.ExamQuestion` and `model.ExamRubricItem` rows using JSON-encoded choices and topic IDs.
3. Marshal a scoring-compatible snapshot payload with `id`, `totalPoints`, `questions`, `questionType`, `points`, `position`, and `rubrics`; create `model.ExamSnapshot{Purpose: "grading_lock"}` and attach its ID to the exam.
4. Create `model.ExamGradingProgress` with total/graded/scored counts equal to the number of synthetic students.
5. For every student, create an individual completed `model.GradingBatch`, an approved `model.ScoringSubmission`, all reviewed question/rubric results, one `model.ScoringApprovalSnapshot`, and one `submission_approved` audit row.
6. Serialize the actual question/rubric result rows into `ScoringApprovalSnapshot.ResultJSON` using the same `{questions, rubrics}` shape as `scoring.Service.Approve`.

Use explicit past timestamps on every historical row and `model.MustScore` only for validated constants. Before persistence, call `validateHistoricalOutcome` and return a wrapped error containing the exam key and student index on failure.

- [ ] **Step 5: Implement dependency-ordered cleanup**

At the start of `resetSyntheticData`, find synthetic teacher IDs, then call `resetHistoricalExamData`. The function must load exam IDs owned by those teachers, batch IDs, submission IDs, question IDs, and rubric IDs, then delete in this order:

```text
scoring_approval_snapshots
scoring_audit_logs
scoring_question_results
scoring_rubric_results
scoring_submissions
grading_batches
scoring_internal_events linked by synthetic idempotency prefix
exam_internal_events
exam_grading_progress
exam_audit_logs
exam_snapshots
exam_rubric_items
exam_questions
exams (unscoped)
```

Every delete must be guarded by a non-empty ID slice or the deterministic `synthetic-seed:` idempotency prefix so real records cannot be removed.

- [ ] **Step 6: Run package tests and verify GREEN**

Run: `cd backend && go test ./internal/syntheticseed -count=1`

Expected: PASS, including the existing real-data preservation and idempotent reseed tests.

- [ ] **Step 7: Commit persistence and cleanup**

```bash
git add backend/internal/syntheticseed/exam_history.go backend/internal/syntheticseed/exam_history_test.go backend/internal/syntheticseed/service.go backend/internal/syntheticseed/service_test.go
git commit -m "feat: seed synthetic historical exam results"
```

---

### Task 3: Verify API compatibility and startup behavior

**Files:**
- Modify: `backend/cmd/server/synthetic_startup.go`
- Modify: `backend/cmd/server/synthetic_startup_test.go`
- Test: `backend/internal/syntheticseed/exam_history_test.go`

**Interfaces:**
- Consumes: `syntheticseed.Result.ExamCount` and `syntheticseed.Result.ApprovedSubmissionCount`.
- Produces: startup log metadata that confirms the historical fixtures loaded; no route or response contract changes.

- [ ] **Step 1: Write the failing startup assertion**

Update the fake result in `TestRunSyntheticSeedRecalculatesEveryStudent` to include:

```go
ExamCount: 2, ApprovedSubmissionCount: 6,
```

Then assert:

```go
require.Contains(t, logBuffer.String(), "exams=2")
require.Contains(t, logBuffer.String(), "approved_submissions=6")
```

Keep the disabled test assertion that `ResetAndSeed` is not called when the flag is `false`.

- [ ] **Step 2: Run the startup test and verify RED**

Run: `cd backend && go test ./cmd/server -run SyntheticSeed -count=1`

Expected: FAIL because the startup log omits exam metadata.

- [ ] **Step 3: Extend the existing startup log only**

Change the log format in `runSyntheticSeed` to:

```go
"synthetic data ready: users=%d nodes=%d questions=%d activities=%d mastery_topics=%d exams=%d approved_submissions=%d"
```

Append `result.ExamCount` and `result.ApprovedSubmissionCount`. Do not change startup control flow or the environment flag.

- [ ] **Step 4: Verify startup and package tests GREEN**

Run: `cd backend && go test ./cmd/server ./internal/syntheticseed -count=1`

Expected: PASS.

- [ ] **Step 5: Verify the full backend suite**

Run: `cd backend && go test ./... -count=1`

Expected: PASS. If PostgreSQL-backed packages are unavailable, record the exact connection failure and still run all pure/unit packages that do not require PostgreSQL.

- [ ] **Step 6: Verify formatting and diff hygiene**

Run:

```bash
cd backend && gofmt -w internal/syntheticseed/exam_history.go internal/syntheticseed/exam_history_test.go internal/syntheticseed/service.go internal/syntheticseed/service_test.go cmd/server/synthetic_startup.go cmd/server/synthetic_startup_test.go
cd .. && git diff --check
git status --short
```

Expected: no whitespace errors; only feature files are staged/committed, while unrelated telemetry/mastery changes remain untouched.

- [ ] **Step 7: Commit startup observability**

```bash
git add backend/cmd/server/synthetic_startup.go backend/cmd/server/synthetic_startup_test.go
git commit -m "chore: report synthetic exam fixtures at startup"
```

- [ ] **Step 8: Runtime smoke test existing APIs**

Restart the Go backend with synthetic data enabled, sign in as `synthetic.teacher@aurora.local`, and verify:

```text
GET /api/teacher/exams?status=preparing_exam -> two historical synthetic exams
GET /api/teacher/grading-batches -> six completed individual batches
GET /api/teacher/grading-batches/:id -> one approved synthetic submission
GET /api/teacher/scoring-submissions/:id -> reviewed question/rubric results and derived total
GET /api/teacher/scoring-submissions/:id/history -> one approval snapshot
```

Expected: the existing `ExamScoringTab` can select either exam and open approved results for all three students without frontend code changes.
