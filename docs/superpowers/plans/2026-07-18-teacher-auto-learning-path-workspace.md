# Teacher Auto Learning Path Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automatic-first teacher learning-path workspace that uses the current subject, drafts paths for reliable severe gaps, supports individual/bulk approval, and retains manual creation.

**Architecture:** Go owns classroom/subject authorization, reads persisted mastery, classifies candidates, filters evidence, persists reviewable draft metadata, and orchestrates the Python planner. Python accepts per-student targets so automatic drafts do not form a class-wide cross-product. React loads the workspace from the current Teacher Hub subject and renders a decision queue plus a manual creation sheet.

**Tech Stack:** Go 1.x, Fiber v3, GORM/PostgreSQL, Python/FastAPI/Pydantic/LangGraph, Next.js 16, React 19, TypeScript, Vitest, Playwright.

## Global Constraints

- Automatic eligibility is strictly `mastery < 0.40` and `confidence > 0.60`.
- Step completion remains mastery `>= 0.80` and confidence `>= 0.60`.
- The tab uses `selectedSubject`; it never renders another subject picker.
- Automatic targets are student-specific and current-subject-specific.
- Manual creation requires at least one classroom student and one non-root current-subject topic.
- Individual approval must leave sibling drafts pending.
- Existing learning-path and `ordered_steps` consumers remain compatible.
- Preserve the established Teacher Hub visual language and responsive behavior.

---

### Task 1: Candidate Classification and Subject-Scoped Evidence

**Files:**
- Create: `backend/internal/learningpath/recommendations.go`
- Create: `backend/internal/learningpath/recommendations_test.go`
- Modify: `backend/internal/handler/tutor.go`
- Test: `backend/internal/handler/learning_path_test.go`

**Interfaces:**
- Produces: `learningpath.ClassifyRecommendations(states []RecommendationState) RecommendationResult`
- Produces: `learningPathEvidence(studentIDs []string, subject string) ([]RawQuizEvidence, error)`
- Consumes: `model.StudentTopicMastery`, `model.Node`, classroom student IDs.

- [ ] **Step 1: Write boundary-first recommendation tests**

```go
func TestClassifyRecommendationsUsesStrictThresholds(t *testing.T) {
    result := ClassifyRecommendations([]RecommendationState{
        {StudentID: "s1", TopicID: "t1", Mastery: .399, Confidence: .601},
        {StudentID: "s2", TopicID: "t1", Mastery: .40, Confidence: .90},
        {StudentID: "s3", TopicID: "t1", Mastery: .20, Confidence: .60},
    })
    require.Len(t, result.Reliable, 1)
    require.Equal(t, "s1", result.Reliable[0].StudentID)
    require.Len(t, result.InsufficientEvidence, 1)
    require.Equal(t, "s3", result.InsufficientEvidence[0].StudentID)
}

func TestClassifyRecommendationsKeepsTopicsMappedToStudents(t *testing.T) {
    result := ClassifyRecommendations([]RecommendationState{
        {StudentID: "s1", TopicID: "a", Mastery: .10, Confidence: .80},
        {StudentID: "s2", TopicID: "b", Mastery: .20, Confidence: .70},
    })
    require.Equal(t, []string{"a"}, result.TargetsByStudent["s1"])
    require.Equal(t, []string{"b"}, result.TargetsByStudent["s2"])
}
```

- [ ] **Step 2: Run recommendation tests and verify RED**

Run: `cd backend && go test ./internal/learningpath -run 'TestClassifyRecommendations'`

Expected: FAIL because the recommendation types and classifier do not exist.

- [ ] **Step 3: Implement the pure classifier**

```go
const AutoDraftMasteryThreshold = 0.40
const AutoDraftConfidenceThreshold = 0.60

type RecommendationState struct {
    StudentID, TopicID string
    Mastery, Confidence float64
}

type RecommendationResult struct {
    Reliable []RecommendationState
    InsufficientEvidence []RecommendationState
    TargetsByStudent map[string][]string
}

func ClassifyRecommendations(states []RecommendationState) RecommendationResult {
    result := RecommendationResult{TargetsByStudent: map[string][]string{}}
    for _, state := range states {
        if state.Mastery >= AutoDraftMasteryThreshold {
            continue
        }
        if state.Confidence > AutoDraftConfidenceThreshold {
            result.Reliable = append(result.Reliable, state)
            result.TargetsByStudent[state.StudentID] = append(result.TargetsByStudent[state.StudentID], state.TopicID)
        } else {
            result.InsufficientEvidence = append(result.InsufficientEvidence, state)
        }
    }
    return result
}
```

- [ ] **Step 4: Add a failing subject-evidence test**

Seed two activity logs for the same student in different subjects and assert `learningPathEvidence(ids, "Toan")` returns only the Toan log.

Run: `cd backend && $env:DB_PORT='5436'; go test ./internal/handler -run TestLearningPathEvidenceFiltersSubject`

Expected: FAIL because the helper does not accept/filter subject.

- [ ] **Step 5: Filter evidence and mastery candidates by current subject**

Change the activity query to:

```go
config.DB.Where(
    "student_id IN ? AND subject = ? AND action IN ?",
    studentIDs, subject, []string{"answer_correct", "answer_incorrect"},
).Order("created_at").Find(&logs)
```

Load candidate mastery rows by joining `student_topic_masteries` to `nodes` and filtering `nodes.subject = ?`, `nodes.is_root = false`, and classroom student IDs.

- [ ] **Step 6: Run focused and full backend tests**

Run: `cd backend && $env:DB_PORT='5436'; go test ./internal/learningpath ./internal/handler`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/learningpath/recommendations.go backend/internal/learningpath/recommendations_test.go backend/internal/handler/tutor.go backend/internal/handler/learning_path_test.go
git commit -m "feat: classify automatic learning path candidates"
```

---

### Task 2: Per-Student Planner Targets

**Files:**
- Modify: `learning-path/src/learning_path/schemas.py`
- Modify: `learning-path/src/learning_path/graph.py`
- Modify: `learning-path/src/learning_path/class_insight.py`
- Test: `learning-path/tests/test_planner.py`
- Test: `learning-path/tests/test_api.py`

**Interfaces:**
- Produces: `LearningPathRequest.target_topic_ids_by_student: dict[str, list[str]]`.
- Keeps: legacy `target_topic_ids: list[str]` behavior.

- [ ] **Step 1: Write failing planner/API tests**

```python
def test_pipeline_uses_student_specific_targets():
    request = LearningPathRequest(
        class_id="c", student_ids=["s1", "s2"], target_topic_ids=[],
        target_topic_ids_by_student={"s1": ["a"], "s2": ["b"]}, teacher_id="t",
    )
    assert request.targets_for("s1") == ["a"]
    assert request.targets_for("s2") == ["b"]

def test_legacy_shared_targets_remain_supported():
    request = LearningPathRequest(
        class_id="c", student_ids=["s1"], target_topic_ids=["a"], teacher_id="t",
    )
    assert request.targets_for("s1") == ["a"]
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd learning-path && pytest tests/test_planner.py tests/test_api.py -q`

Expected: FAIL because `target_topic_ids_by_student` and `targets_for` do not exist.

- [ ] **Step 3: Extend the schema compatibly**

```python
class LearningPathRequest(BaseModel):
    target_topic_ids: list[str] = Field(default_factory=list)
    target_topic_ids_by_student: dict[str, list[str]] = Field(default_factory=dict)

    def targets_for(self, student_id: str) -> list[str]:
        return self.target_topic_ids_by_student.get(student_id, self.target_topic_ids)
```

Validate that every mapping key is in `student_ids` and every student resolves to at least one target for create-path requests.

- [ ] **Step 4: Use a student-scoped request in `process_student`**

```python
targets = request.targets_for(sid)
student_request = request.model_copy(update={"target_topic_ids": targets})
d = diagnose(curriculum, states, targets)
path = plan_path(student_request, d, r, curriculum, states, student_id=sid, ...)
```

Class insight may use the stable union of per-student targets for class-level summaries, while student diagnosis/planning always uses its own targets.

- [ ] **Step 5: Run the Python suite**

Run: `cd learning-path && pytest -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add learning-path/src/learning_path/schemas.py learning-path/src/learning_path/graph.py learning-path/src/learning_path/class_insight.py learning-path/tests/test_planner.py learning-path/tests/test_api.py
git commit -m "feat: support per-student learning path targets"
```

---

### Task 3: Idempotent Automatic Draft Endpoint

**Files:**
- Modify: `backend/internal/model/models.go`
- Modify: `backend/internal/config/db.go`
- Create: `backend/internal/handler/learning_path_auto.go`
- Create: `backend/internal/handler/learning_path_auto_test.go`
- Modify: `backend/internal/handler/tutor.go`
- Modify: `backend/cmd/server/main.go`

**Interfaces:**
- Adds: `POST /api/teacher/learning-path/auto-drafts`.
- Adds model metadata: `Subject`, `Source`, `AnalysisID`, `EvidenceFingerprint`.
- Returns: analysis summary, drafts, and insufficient-evidence rows.

- [ ] **Step 1: Write failing handler/service tests**

Cover:

```go
func TestAutoDraftRejectsEmptySubject(t *testing.T) {
    app, _ := newLearningPathAutoTestApp(t)
    response, err := app.Test(teacherJSONRequest("POST", "/teacher/learning-path/auto-drafts", `{}`))
    require.NoError(t, err)
    require.Equal(t, fiber.StatusBadRequest, response.StatusCode)
}

func TestAutoDraftReusesEvidenceFingerprint(t *testing.T) {
    app, store := newLearningPathAutoTestApp(t)
    first := requireAutoDraftResponse(t, app, "Toan")
    second := requireAutoDraftResponse(t, app, "Toan")
    require.Equal(t, first.AnalysisID, second.AnalysisID)
    require.Equal(t, int64(1), store.AutomaticBatchCount(t, first.AnalysisID))
}

func TestAutoDraftDoesNotCrossAssignStudentTargets(t *testing.T) {
    app, planner := newLearningPathAutoTestApp(t)
    requireAutoDraftResponse(t, app, "Toan")
    require.Equal(t, map[string][]string{"s1": {"a"}, "s2": {"b"}}, planner.LastTargetsByStudent())
}
```

`newLearningPathAutoTestApp` wires a Fiber app to a test PostgreSQL database plus a recording planner client; `teacherJSONRequest` injects authenticated teacher locals using the existing handler-test pattern.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd backend && $env:DB_PORT='5436'; go test ./internal/handler -run TestAutoDraft`

Expected: FAIL because the endpoint and metadata do not exist.

- [ ] **Step 3: Extend `LearningPath` metadata**

```go
Subject             string `gorm:"type:varchar(255);index" json:"subject"`
Source              string `gorm:"type:varchar(20);index" json:"source"`
AnalysisID          string `gorm:"type:varchar(100);index" json:"analysisId"`
EvidenceFingerprint string `gorm:"type:varchar(64);index" json:"evidenceFingerprint"`
```

Keep existing status values. Use `Draft`, `Approved`, `Skipped`, and `Superseded` for review lifecycle.

- [ ] **Step 4: Build deterministic analysis input**

Hash sorted tuples of student ID, topic ID, mastery version/value, confidence, and subject using SHA-256. Before calling Python, query an existing automatic `Draft` batch with the same teacher/class/subject/fingerprint and return it.

- [ ] **Step 5: Call the planner with per-student targets**

Set:

```go
TargetTopicIDs: nil,
TargetTopicIDsByStudent: result.TargetsByStudent,
TargetMasteryThreshold: 0.80,
MinimumConfidenceThreshold: 0.60,
```

Persist one draft row per generated student path with source `automatic`, subject, analysis ID, and fingerprint. Return reliable evidence details even if the planner returns no path for a candidate.

- [ ] **Step 6: Register the route and verify idempotency**

```go
teacherGroup.Post("/learning-path/auto-drafts", tutorHandler.CreateAutomaticLearningPathDrafts)
```

Run: `cd backend && $env:DB_PORT='5436'; go test ./internal/handler ./internal/model`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/model/models.go backend/internal/config/db.go backend/internal/handler/learning_path_auto.go backend/internal/handler/learning_path_auto_test.go backend/internal/handler/tutor.go backend/cmd/server/main.go
git commit -m "feat: generate automatic learning path drafts"
```

---

### Task 4: Individual, Bulk, Skip, and Manual Review Mutations

**Files:**
- Modify: `backend/internal/handler/tutor.go`
- Modify: `backend/internal/handler/learning_path_auto.go`
- Test: `backend/internal/handler/learning_path_auto_test.go`
- Modify: `backend/cmd/server/main.go`
- Modify: `frontend/src/app/teacher/components/learningPathRequest.ts`
- Test: `frontend/src/app/teacher/components/learningPathRequest.test.ts`

**Interfaces:**
- Extends approval body with `studentIds?: string[]`.
- Adds: `POST /api/teacher/learning-path/:threadId/skip` with `{studentIds}`.
- Manual request becomes `{subject, studentIds, targetTopicIds}`.

- [ ] **Step 1: Write failing partial approval tests**

Seed two draft rows in one analysis and assert approving `s1` creates/activates only `s1`, initializes its progress, and leaves `s2` as `Draft`. Add a retry assertion that no duplicate approved path/progress rows appear.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd backend && $env:DB_PORT='5436'; go test ./internal/handler -run 'TestApproveLearningPathSubset|TestSkipLearningPathSubset'`

Expected: FAIL because approval currently finalizes the whole thread.

- [ ] **Step 3: Make Go persistence authoritative for partial review**

Filter allowed draft rows by the optional `studentIds`. In one transaction:

1. validate all selected students belong to the batch;
2. supersede each student's older approved path for the same class/subject;
3. update selected drafts to `Approved` and save edited `custom_paths`;
4. initialize step progress;
5. leave unselected drafts unchanged.

Notify FastAPI approval only when no `Draft` rows remain for the thread. This avoids finalizing sibling drafts prematurely.

- [ ] **Step 4: Add skip mutation**

Update only selected owned `Draft` rows to `Skipped`. If no reviewable rows remain, finalize/reject the planner thread as appropriate.

- [ ] **Step 5: Require subject in manual creation**

Validate selected topics with:

```go
var topicCount int64
config.DB.Model(&model.Node{}).
    Where("id IN ? AND subject = ? AND is_root = ?", req.TargetTopicIDs, req.Subject, false).
    Count(&topicCount)
```

Reject when the count differs from the unique requested topic count. Store source `manual` and subject on draft rows.

- [ ] **Step 6: Update frontend request helper test-first**

```ts
expect(buildLearningPathRequest("Toan", ["s1"], ["t1"])).toEqual({
  subject: "Toan", studentIds: ["s1"], targetTopicIds: ["t1"],
});
```

Run: `cd frontend && npm test -- --run src/app/teacher/components/learningPathRequest.test.ts`

Expected: FAIL before changing the helper, then PASS after adding `subject`.

- [ ] **Step 7: Run focused suites and commit**

Run:

```bash
cd backend && DB_PORT=5436 go test ./internal/handler ./internal/learningpath
cd ../frontend && npm test -- --run src/app/teacher/components/learningPathRequest.test.ts
```

Commit:

```bash
git add backend frontend/src/app/teacher/components/learningPathRequest.ts frontend/src/app/teacher/components/learningPathRequest.test.ts
git commit -m "feat: review learning path drafts independently"
```

---

### Task 5: Automatic-First Teacher Workspace UI

**Files:**
- Create: `frontend/src/app/teacher/components/learningPathWorkspaceApi.ts`
- Create: `frontend/src/app/teacher/components/learningPathWorkspaceApi.test.ts`
- Rewrite: `frontend/src/app/teacher/components/LearningPathTab.tsx`
- Create: `frontend/src/app/teacher/components/LearningPathTab.test.tsx`
- Modify: `frontend/src/app/teacher/page.tsx`

**Interfaces:**
- `loadAutomaticDrafts(subject: string)`
- `approveDrafts(threadId: string, studentIds: string[], paths: Record<string, unknown>)`
- `skipDrafts(threadId: string, studentIds: string[])`
- `createManualDraft(subject: string, studentIds: string[], topicIds: string[])`

- [ ] **Step 1: Write API helper tests**

Assert exact endpoints and payloads, especially that automatic load and manual creation always include the current subject and individual approval includes one student ID.

- [ ] **Step 2: Run helper tests and verify RED**

Run: `cd frontend && npm test -- --run src/app/teacher/components/learningPathWorkspaceApi.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement typed API helpers and response types**

Define `AutomaticDraftResponse`, `DraftView`, `WeakTopicView`, and `InsufficientEvidenceView`. Keep network calls outside the visual component.

- [ ] **Step 4: Write component behavior tests**

Test:

- current subject chip renders and no subject selector exists;
- reliable drafts and insufficient evidence render separately;
- individual approve calls only that student's ID;
- bulk approve excludes skipped/approved drafts;
- manual sheet requires a student and topic;
- subject change reloads and removes stale cards.

- [ ] **Step 5: Run component tests and verify RED**

Run: `cd frontend && npm test -- --run src/app/teacher/components/LearningPathTab.test.tsx`

Expected: FAIL against the old topic-first component.

- [ ] **Step 6: Build the redesigned component**

Use the established rounded Teacher Hub cards and variables. Structure:

```tsx
<WorkspaceHeader subject={selectedSubject} onRefresh={reload} onManualCreate={openSheet} />
<SummaryStrip summary={workspace.summary} />
<DraftQueue drafts={pendingDrafts} onApprove={approveOne} onApproveAll={approveAll} />
<EvidenceQueue items={workspace.insufficientEvidence} />
<ManualPathSheet students={studentsProgress} topics={nonRootNodes} />
```

The intervention queue is the signature element. Keep motion to one staggered queue reveal and respect reduced motion.

- [ ] **Step 7: Integrate with `TeacherDashboard`**

Pass `selectedSubject`, nodes, and students. Remove the old requirement to select target topics before analysis. Keep draft step reorder/delete behavior and connect it to the new draft map.

- [ ] **Step 8: Run frontend verification and commit**

Run:

```bash
cd frontend
npm test -- --run
npm run build
npx eslint src/app/teacher/components/LearningPathTab.tsx src/app/teacher/components/learningPathWorkspaceApi.ts src/app/teacher/page.tsx
```

Expected: tests/build pass and ESLint reports zero errors.

Commit:

```bash
git add frontend/src/app/teacher
git commit -m "feat: redesign teacher learning path workspace"
```

---

### Task 6: Full-Stack Verification and Documentation

**Files:**
- Create temporarily: `tests/teacher_auto_learning_path_e2e.py`
- Modify only if failures expose a regression: files owned by Tasks 1-5.

**Interfaces:**
- Uses feature backend `8082`, feature frontend `3001`, PostgreSQL `5436`, and learning-path service `8000`.

- [ ] **Step 1: Write the failing browser/API scenario**

The Playwright script must:

1. log in as the synthetic teacher;
2. set the current subject in local storage/UI;
3. open the learning-path tab;
4. verify automatic drafts appear without selecting subject/students/topics;
5. assert every automatic weak topic has mastery `< .40` and confidence `> .60`;
6. approve one student and verify a sibling stays pending;
7. approve remaining drafts;
8. create and approve a manual draft;
9. verify approved student paths and initialized progress;
10. fail on browser console errors or HTTP responses `>= 400`.

- [ ] **Step 2: Run E2E and fix only observed root causes**

Run: `$env:PYTHONUTF8='1'; python tests/teacher_auto_learning_path_e2e.py`

Expected: PASS with screenshot path and IDs printed.

- [ ] **Step 3: Verify persisted state and telemetry**

Query PostgreSQL for automatic/manual source, subject, draft/approved status, one remaining sibling after individual approval, progress rows, and learning-path review telemetry.

- [ ] **Step 4: Remove temporary executable/script artifacts**

Remove the temporary E2E script unless it is generalized enough for stable repository use. Stop only feature processes started during verification.

- [ ] **Step 5: Run final verification**

```bash
cd backend && DB_PORT=5436 go test ./...
cd ../learning-path && pytest -q
cd ../frontend && npm test -- --run && npm run build
```

Also run targeted ESLint and `git diff --check`.

- [ ] **Step 6: Commit final regression fixes**

```bash
git add backend/internal/handler backend/internal/learningpath backend/internal/model backend/cmd/server learning-path/src/learning_path learning-path/tests frontend/src/app/teacher
git commit -m "test: verify automatic teacher learning paths"
```

Do not create an empty commit when verification requires no production changes.
