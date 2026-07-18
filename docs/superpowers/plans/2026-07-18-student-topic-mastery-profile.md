# Student Topic Mastery Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist current and historical BKT mastery per student-topic and display it on the existing teacher and student knowledge trees.

**Architecture:** Python exposes a deterministic calculation endpoint using the existing evidence calibration and BKT modules. Go owns PostgreSQL persistence, authorization, recalculation orchestration, and public read APIs. The Next.js frontend consumes Go APIs, adds compact BKT badges to knowledge-tree nodes, and shows topic history in a reusable detail panel.

**Tech Stack:** Python 3, FastAPI, Pydantic, pytest, Go, Fiber v3, GORM, PostgreSQL, Next.js 16, React 19, TypeScript, Recharts.

## Global Constraints

- Go remains the only public authenticated API and the owner of profile persistence.
- Python calculates BKT states but does not write PostgreSQL profile tables.
- Teacher views are individual-student views; no class-average BKT appears on nodes.
- Student routes derive student identity from the authentication token.
- Missing evidence displays `Chua co du lieu` and must never be interpreted as a gap.
- Existing learning-path, progress, and knowledge-tree behavior must remain available.
- Preserve unrelated dirty-worktree changes, especially in `frontend/src/app/teacher/page.tsx`.

---

## File Structure

- `learning-path/src/learning_path/mastery_api.py`: request models and deterministic multi-topic calculation function.
- `learning-path/src/learning_path/api.py`: register `POST /mastery/calculate`.
- `learning-path/tests/test_mastery_api.py`: endpoint and calculation contract tests.
- `backend/internal/model/mastery_models.go`: current-state and immutable-history GORM models.
- `backend/internal/mastery/domain.go`: public domain types and validation constants.
- `backend/internal/mastery/repository.go`: transactional upsert/history persistence and profile reads.
- `backend/internal/mastery/client.go`: Python calculation HTTP client.
- `backend/internal/mastery/service.go`: evidence collection and recalculation orchestration.
- `backend/internal/mastery/*_test.go`: repository, client, and service tests.
- `backend/internal/handler/mastery.go`: teacher/student profile handlers.
- `backend/internal/handler/mastery_test.go`: routing, identity, and authorization tests.
- `backend/internal/config/db.go`: include mastery models in AutoMigrate.
- `backend/cmd/server/main.go`: construct mastery dependencies and register routes.
- `frontend/src/lib/mastery.ts`: shared profile types, labels, colors, and formatters.
- `frontend/src/app/components/MasteryTopicPanel.tsx`: reusable current-state and history UI.
- `frontend/src/app/components/KnowledgeTree.tsx`: render optional BKT badge and status dot.
- `frontend/src/app/teacher/page.tsx`: load selected student's profile/history and pass it to the tree/panel.
- `frontend/src/app/tutor/page.tsx`: load self profile/history and pass it to the tree/panel.
- `frontend/tests/mastery_profile_smoke.py`: source-level integration smoke checks consistent with existing frontend tests.

---

### Task 1: Python Mastery Calculation Endpoint

**Files:**
- Create: `learning-path/src/learning_path/mastery_api.py`
- Modify: `learning-path/src/learning_path/api.py`
- Test: `learning-path/tests/test_mastery_api.py`

**Interfaces:**
- Consumes: `calibrate_quiz`, `calibrate_paper`, `EvidenceStore`, and `knowledge_state` from the existing learning-path package.
- Produces: `calculate_mastery(body: MasteryCalculationBody) -> MasteryCalculationResponse` and `POST /mastery/calculate`.

- [ ] **Step 1: Write failing endpoint tests**

```python
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from learning_path.api import create_app


def quiz(evidence_id: str, topic_id: str, score: float) -> dict:
    return {
        "evidence_id": evidence_id,
        "student_id": "student-1",
        "session_id": "session-1",
        "question_id": evidence_id,
        "topic_id": topic_id,
        "score": score,
        "attempt_number": 1,
        "hints_used": 0,
        "grading_method": "auto",
        "occurred_at": "2026-07-18T00:00:00Z",
    }


def test_calculate_mastery_returns_one_state_per_requested_topic(curriculum):
    client = TestClient(create_app(curriculum))
    response = client.post("/mastery/calculate", json={
        "student_id": "student-1",
        "topic_ids": ["topic-a", "topic-b"],
        "raw_quiz": [quiz("e-1", "topic-a", 1.0)],
        "raw_paper": [],
        "as_of": "2026-07-18T01:00:00Z",
    })
    assert response.status_code == 200
    payload = response.json()
    assert set(payload["states"]) == {"topic-a", "topic-b"}
    assert payload["states"]["topic-a"]["student_id"] == "student-1"
    assert payload["states"]["topic-b"]["mastery_status"] == "unknown"


def test_calculate_mastery_deduplicates_evidence(curriculum):
    client = TestClient(create_app(curriculum))
    item = quiz("same-id", "topic-a", 1.0)
    payload = client.post("/mastery/calculate", json={
        "student_id": "student-1",
        "topic_ids": ["topic-a"],
        "raw_quiz": [item, item],
        "raw_paper": [],
        "as_of": datetime.now(timezone.utc).isoformat(),
    }).json()
    assert payload["states"]["topic-a"]["evidence_count"] == 1
```

- [ ] **Step 2: Run tests and verify the route is missing**

Run: `cd learning-path && uv run pytest tests/test_mastery_api.py -q`

Expected: FAIL because `/mastery/calculate` returns `404` or the new module does not exist.

- [ ] **Step 3: Implement deterministic calculation models and function**

```python
class MasteryCalculationBody(BaseModel):
    student_id: str
    topic_ids: list[str]
    raw_quiz: list[RawQuizEvidence] = Field(default_factory=list)
    raw_paper: list[RawPaperEvidence] = Field(default_factory=list)
    as_of: datetime


class MasteryCalculationResponse(BaseModel):
    student_id: str
    calculated_at: datetime
    states: dict[str, StudentTopicKnowledgeState]


def calculate_mastery(body: MasteryCalculationBody) -> MasteryCalculationResponse:
    store = EvidenceStore()
    calibrated = [calibrate_quiz(e, as_of=body.as_of) for e in body.raw_quiz]
    calibrated.extend(calibrate_paper(e, as_of=body.as_of) for e in body.raw_paper)
    store.ingest(calibrated)
    states = {
        topic_id: knowledge_state(
            body.student_id,
            topic_id,
            store.active_for(body.student_id, topic_id),
        )
        for topic_id in body.topic_ids
    }
    return MasteryCalculationResponse(
        student_id=body.student_id,
        calculated_at=body.as_of,
        states=states,
    )
```

Register in `create_app`:

```python
@app.post("/mastery/calculate", response_model=MasteryCalculationResponse)
def calculate_mastery_endpoint(body: MasteryCalculationBody) -> MasteryCalculationResponse:
    return calculate_mastery(body)
```

- [ ] **Step 4: Run endpoint and full Python tests**

Run: `cd learning-path && uv run pytest tests/test_mastery_api.py -q`

Expected: new tests PASS.

Run: `cd learning-path && uv run pytest -q`

Expected: all existing and new tests PASS.

- [ ] **Step 5: Commit Python calculation endpoint**

```bash
git add learning-path/src/learning_path/mastery_api.py learning-path/src/learning_path/api.py learning-path/tests/test_mastery_api.py
git commit -m "feat: expose topic mastery calculation endpoint"
```

---

### Task 2: Go Mastery Persistence Models and Repository

**Files:**
- Create: `backend/internal/model/mastery_models.go`
- Create: `backend/internal/mastery/domain.go`
- Create: `backend/internal/mastery/repository.go`
- Create: `backend/internal/mastery/repository_test.go`
- Modify: `backend/internal/config/db.go`

**Interfaces:**
- Consumes: GORM database connection and existing `model.User`/`model.Node` identifiers.
- Produces: `Repository.UpsertStates(ctx context.Context, states []TopicState) error`, `Repository.GetProfile(...)`, and `Repository.GetHistory(...)`.

- [ ] **Step 1: Write failing repository tests**

```go
func TestRepositoryUpsertCreatesCurrentAndHistory(t *testing.T) {
    db := testutil.OpenPostgres(t)
    repo := mastery.NewRepository(db)
    state := mastery.TopicState{
        StudentID: student.ID, TopicID: topic.ID,
        MasteryProbability: 0.76, ConfidenceScore: 0.68,
        Status: mastery.StatusLearning, EvidenceCount: 4,
        EffectiveEvidence: 3.2, Version: 1, CalculatedAt: now,
    }
    require.NoError(t, repo.UpsertStates(context.Background(), []mastery.TopicState{state}))
    profile, err := repo.GetProfile(context.Background(), student.ID, "Toan dai so")
    require.NoError(t, err)
    require.InDelta(t, 0.76, profile[topic.ID].MasteryProbability, 0.0001)
    history, err := repo.GetHistory(context.Background(), student.ID, topic.ID, mastery.RangeAll)
    require.NoError(t, err)
    require.Len(t, history, 1)
}


func TestRepositoryRetryDoesNotDuplicateHistory(t *testing.T) {
    require.NoError(t, repo.UpsertStates(ctx, []mastery.TopicState{state}))
    require.NoError(t, repo.UpsertStates(ctx, []mastery.TopicState{state}))
    history, err := repo.GetHistory(ctx, state.StudentID, state.TopicID, mastery.RangeAll)
    require.NoError(t, err)
    require.Len(t, history, 1)
}
```

- [ ] **Step 2: Run repository tests and verify missing types**

Run: `cd backend && go test ./internal/mastery -run TestRepository -v`

Expected: FAIL because the mastery package and repository do not exist.

- [ ] **Step 3: Add GORM models and migration**

```go
type StudentTopicMastery struct {
    ID                  uuid.UUID `gorm:"type:uuid;primaryKey"`
    StudentID           uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_student_topic_mastery"`
    TopicID             uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_student_topic_mastery"`
    MasteryProbability  float64   `gorm:"not null"`
    ConfidenceScore     float64   `gorm:"not null"`
    Consistency         float64   `gorm:"not null"`
    EvidenceCount       int       `gorm:"not null"`
    EffectiveEvidence   float64   `gorm:"not null"`
    MasteryStatus       string    `gorm:"type:varchar(30);not null"`
    EvidenceSummaryJSON string    `gorm:"type:text;not null"`
    SourceBreakdownJSON string    `gorm:"type:text;not null"`
    LastEvidenceAt      *time.Time
    Version             int       `gorm:"not null"`
    CalculatedAt        time.Time `gorm:"not null"`
    CreatedAt           time.Time
    UpdatedAt           time.Time
}
```

Create the history model with unique index
`idx_student_topic_mastery_history` across student, topic, and version. Add both
models to `config.ConnectDB` AutoMigrate.

- [ ] **Step 4: Implement transactional upsert and immutable history append**

```go
func (r *Repository) UpsertStates(ctx context.Context, states []TopicState) error {
    return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
        for _, state := range states {
            if err := validateState(state); err != nil { return err }
            current := modelFromState(state)
            if err := tx.Clauses(clause.OnConflict{
                Columns: []clause.Column{{Name: "student_id"}, {Name: "topic_id"}},
                DoUpdates: clause.AssignmentColumns(currentUpdateColumns),
            }).Create(&current).Error; err != nil { return err }
            history := historyModelFromState(state)
            if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&history).Error; err != nil { return err }
        }
        return nil
    })
}
```

Implement subject filtering by joining `nodes` on `topic_id` and history range
cutoffs for `30d`, `90d`, and `all`.

- [ ] **Step 5: Run repository tests**

Run: `cd backend && go test ./internal/mastery -run TestRepository -v`

Expected: PASS when the test PostgreSQL configured by `testutil` is available.

- [ ] **Step 6: Commit persistence layer**

```bash
git add backend/internal/model/mastery_models.go backend/internal/mastery/domain.go backend/internal/mastery/repository.go backend/internal/mastery/repository_test.go backend/internal/config/db.go
git commit -m "feat: persist student topic mastery history"
```

---

### Task 3: Go Python Client and Recalculation Service

**Files:**
- Create: `backend/internal/mastery/client.go`
- Create: `backend/internal/mastery/client_test.go`
- Create: `backend/internal/mastery/service.go`
- Create: `backend/internal/mastery/service_test.go`

**Interfaces:**
- Consumes: `POST /mastery/calculate`, activity logs, topic IDs, and `Repository.UpsertStates`.
- Produces: `Service.RecalculateStudent(ctx, studentID, subject) (*Profile, error)` and read methods used by handlers.

- [ ] **Step 1: Write failing client contract tests**

```go
func TestClientCalculateMapsPythonStates(t *testing.T) {
    server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        require.Equal(t, "/mastery/calculate", r.URL.Path)
        json.NewEncoder(w).Encode(map[string]any{
            "student_id": "student-1",
            "calculated_at": "2026-07-18T01:00:00Z",
            "states": map[string]any{"topic-1": map[string]any{
                "student_id": "student-1", "topic_id": "topic-1",
                "mastery_probability": 0.76, "confidence_score": 0.68,
                "consistency": 0.8, "evidence_count": 4,
                "effective_evidence": 3.2, "mastery_status": "learning",
                "evidence_summary": map[string]float64{},
                "source_breakdown": map[string]int{}, "version": 1,
            }},
        })
    }))
    defer server.Close()
    result, err := NewClient(server.URL, server.Client()).Calculate(ctx, request)
    require.NoError(t, err)
    require.InDelta(t, 0.76, result.States["topic-1"].MasteryProbability, 0.0001)
}
```

- [ ] **Step 2: Run client tests and verify failure**

Run: `cd backend && go test ./internal/mastery -run 'TestClient|TestService' -v`

Expected: FAIL because client and service constructors do not exist.

- [ ] **Step 3: Implement the bounded HTTP client**

```go
type Client struct { baseURL string; httpClient *http.Client }

func NewClient(baseURL string, httpClient *http.Client) *Client {
    if httpClient == nil { httpClient = &http.Client{Timeout: 10 * time.Second} }
    return &Client{baseURL: strings.TrimRight(baseURL, "/"), httpClient: httpClient}
}
```

Return typed errors for unavailable Python, non-2xx responses, malformed JSON,
out-of-range probabilities, and unknown statuses. Do not persist partial results.

- [ ] **Step 4: Write failing service tests for evidence mapping and persistence**

```go
func TestServiceRecalculateUsesAllSubjectTopicsAndEligibleLogs(t *testing.T) {
    calc := &fakeCalculator{response: calculationWithTwoTopics()}
    repo := &fakeRepository{}
    svc := NewService(db, repo, calc)
    profile, err := svc.RecalculateStudent(ctx, student.ID, "Toan dai so")
    require.NoError(t, err)
    require.Len(t, calc.request.TopicIDs, 2)
    require.Equal(t, "answer_correct", calc.request.RawQuiz[0].SourceAction)
    require.Len(t, repo.upserted, 2)
    require.Len(t, profile.Topics, 2)
}
```

- [ ] **Step 5: Implement recalculation orchestration**

Collect subject nodes and `answer_correct`/`answer_incorrect` activity logs.
Map each log ID to `evidence_id`, its node to `topic_id`, correct to `1.0`,
incorrect to `0.0`, and preserve `created_at`. Call Python once for all subject
topics, assign the next version per topic, persist in one transaction, then
return the refreshed profile.

- [ ] **Step 6: Run mastery package tests and commit**

Run: `cd backend && go test ./internal/mastery -v`

Expected: PASS with PostgreSQL available; pure client/service tests PASS without it.

```bash
git add backend/internal/mastery/client.go backend/internal/mastery/client_test.go backend/internal/mastery/service.go backend/internal/mastery/service_test.go
git commit -m "feat: orchestrate mastery recalculation"
```

---

### Task 4: Authenticated Go Mastery APIs

**Files:**
- Create: `backend/internal/handler/mastery.go`
- Create: `backend/internal/handler/mastery_test.go`
- Modify: `backend/cmd/server/main.go`

**Interfaces:**
- Consumes: mastery service read/recalculate methods and existing auth locals.
- Produces: teacher and student endpoints defined in the design spec.

- [ ] **Step 1: Write failing authorization and response tests**

```go
func TestStudentProfileUsesAuthenticatedUserID(t *testing.T) {
    svc := &fakeMasteryService{profile: sampleProfile()}
    app := testApp(handler.NewMasteryHandler(svc), "student-id", "student")
    req := httptest.NewRequest(http.MethodGet, "/student/mastery?subject=Toan%20dai%20so", nil)
    res, err := app.Test(req)
    require.NoError(t, err)
    require.Equal(t, fiber.StatusOK, res.StatusCode)
    require.Equal(t, uuid.MustParse("student-id"), svc.requestedStudentID)
}


func TestTeacherCannotReadStudentOutsideScope(t *testing.T) {
    svc := &fakeMasteryService{authorizeErr: mastery.ErrForbidden}
    res := performTeacherProfileRequest(app, otherStudentID)
    require.Equal(t, fiber.StatusForbidden, res.StatusCode)
}
```

- [ ] **Step 2: Run handler tests and verify missing handler**

Run: `cd backend && go test ./internal/handler -run TestMastery -v`

Expected: FAIL because mastery handlers/routes do not exist.

- [ ] **Step 3: Implement handlers with strict identity rules**

```go
func (h *MasteryHandler) GetStudentProfile(c fiber.Ctx) error {
    studentID, err := uuid.Parse(c.Locals("userID").(string))
    if err != nil { return fiber.NewError(fiber.StatusBadRequest, "invalid user id") }
    profile, err := h.service.GetProfile(c.Context(), studentID, c.Query("subject"))
    return writeMasteryResult(c, profile, err)
}
```

Teacher handlers parse `:studentId`, call the centralized teacher scope check,
and then call the same service methods. History handlers validate `range` as
`30d`, `90d`, or `all`.

- [ ] **Step 4: Wire dependencies and routes**

Construct the repository, Python client (`LEARNING_PATH_URL`, default
`http://127.0.0.1:8000`), service, and handler in `backend/cmd/server/main.go`.
Register:

```go
api.Get("/teacher/students/:studentId/mastery", masteryHandler.GetTeacherProfile)
api.Get("/teacher/students/:studentId/mastery/:topicId/history", masteryHandler.GetTeacherHistory)
api.Post("/teacher/students/:studentId/mastery/recalculate", masteryHandler.RecalculateTeacherProfile)
api.Get("/student/mastery", masteryHandler.GetStudentProfile)
api.Get("/student/mastery/:topicId/history", masteryHandler.GetStudentHistory)
```

- [ ] **Step 5: Run handler and compile-only backend tests**

Run: `cd backend && go test ./internal/handler -run TestMastery -v`

Expected: PASS.

Run: `cd backend && go test ./internal/... -run '^$'`

Expected: all packages compile.

- [ ] **Step 6: Commit APIs**

```bash
git add backend/internal/handler/mastery.go backend/internal/handler/mastery_test.go backend/cmd/server/main.go
git commit -m "feat: add mastery profile APIs"
```

---

### Task 5: Shared Frontend Mastery Model, Tree Badges, and Detail Panel

**Files:**
- Create: `frontend/src/lib/mastery.ts`
- Create: `frontend/src/app/components/MasteryTopicPanel.tsx`
- Modify: `frontend/src/app/components/KnowledgeTree.tsx`
- Test: `frontend/tests/mastery_profile_smoke.py`

**Interfaces:**
- Consumes: profile map keyed by topic ID and history arrays from Go APIs.
- Produces: optional `masteryByTopic` tree prop and reusable `MasteryTopicPanel`.

- [ ] **Step 1: Write failing frontend source smoke tests**

```python
def test_knowledge_tree_accepts_mastery_map():
    source = Path("frontend/src/app/components/KnowledgeTree.tsx").read_text(encoding="utf-8")
    assert "masteryByTopic" in source
    assert "BKT" in source


def test_mastery_panel_exposes_history_ranges():
    source = Path("frontend/src/app/components/MasteryTopicPanel.tsx").read_text(encoding="utf-8")
    assert '"30d"' in source
    assert '"90d"' in source
    assert '"all"' in source
```

- [ ] **Step 2: Run smoke tests and verify failure**

Run: `python -m pytest frontend/tests/mastery_profile_smoke.py -q`

Expected: FAIL because the component and prop do not exist.

- [ ] **Step 3: Add shared types and presentation helpers**

```ts
export type MasteryStatus = "unknown" | "uncertain" | "learning" | "confirmed_gap" | "mastered";

export interface TopicMastery {
  topicId: string;
  masteryProbability: number;
  confidenceScore: number;
  masteryStatus: MasteryStatus;
  evidenceCount: number;
  effectiveEvidence: number;
  sourceBreakdown: Record<string, number>;
  lastEvidenceAt: string | null;
  calculatedAt: string;
}

export const masteryPercent = (value: number) => Math.round(value * 100);
```

- [ ] **Step 4: Add a compact optional badge to KnowledgeTree**

Extend props with:

```ts
masteryByTopic?: Record<string, TopicMastery>;
```

For each node with mastery data, render a small badge containing
`BKT {masteryPercent(state.masteryProbability)}%` and a status dot. For nodes
without state, render no badge so existing teacher graph-editor screens remain
unchanged. Do not replace current locked/current/completed styling.

- [ ] **Step 5: Build the reusable detail panel**

`MasteryTopicPanel` accepts the selected node, current state, history range,
loading/error state, and `onRangeChange`. Use Recharts `ResponsiveContainer`,
`LineChart`, and `Line` for mastery/confidence. Include explicit empty states and
do not show teacher-only controls inside this shared component.

- [ ] **Step 6: Run smoke test and frontend build**

Run: `python -m pytest frontend/tests/mastery_profile_smoke.py -q`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: Next.js production build succeeds.

- [ ] **Step 7: Commit shared frontend components**

```bash
git add frontend/src/lib/mastery.ts frontend/src/app/components/MasteryTopicPanel.tsx frontend/src/app/components/KnowledgeTree.tsx frontend/tests/mastery_profile_smoke.py
git commit -m "feat: show BKT mastery on knowledge nodes"
```

---

### Task 6: Teacher Individual Student Mastery View

**Files:**
- Create: `frontend/src/app/teacher/components/StudentMasteryProfile.tsx`
- Modify: `frontend/src/app/teacher/page.tsx`
- Modify: `frontend/tests/mastery_profile_smoke.py`

**Interfaces:**
- Consumes: `GET /teacher/students/:studentId/mastery`, history API, selected student, nodes, and shared components.
- Produces: teacher-only recalculation action and individual profile view.

- [ ] **Step 1: Extend smoke tests for teacher endpoints and profile component**

```python
def test_teacher_profile_uses_teacher_scoped_mastery_api():
    source = Path("frontend/src/app/teacher/components/StudentMasteryProfile.tsx").read_text(encoding="utf-8")
    assert "/teacher/students/" in source
    assert "/mastery/recalculate" in source
    assert "MasteryTopicPanel" in source
```

- [ ] **Step 2: Run the new smoke test and verify failure**

Run: `python -m pytest frontend/tests/mastery_profile_smoke.py -q`

Expected: FAIL because `StudentMasteryProfile.tsx` does not exist.

- [ ] **Step 3: Implement the isolated teacher profile component**

The component loads the selected student's subject profile, maintains selected
topic and history range, passes `masteryByTopic` to `KnowledgeTree`, and opens
`MasteryTopicPanel` in the existing right column. Its recalculation button posts
to `/teacher/students/${studentId}/mastery/recalculate` and refreshes the profile.

```ts
const profile = await apiFetch(
  `/teacher/students/${studentId}/mastery?subject=${encodeURIComponent(subject)}`,
);
```

- [ ] **Step 4: Integrate with the existing student inspection view**

Modify the smallest possible branch around the existing `mode="view-only"`
knowledge tree. Preserve all current dirty-worktree edits. Replace only the tree
and right-side mastery responsibility with `StudentMasteryProfile`; keep activity
logs accessible through a simple `Hoat dong`/`Nang luc` toggle.

- [ ] **Step 5: Run smoke tests and build**

Run: `python -m pytest frontend/tests/mastery_profile_smoke.py -q`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: build succeeds without TypeScript errors.

- [ ] **Step 6: Commit teacher integration**

```bash
git add frontend/src/app/teacher/components/StudentMasteryProfile.tsx frontend/src/app/teacher/page.tsx frontend/tests/mastery_profile_smoke.py
git commit -m "feat: add teacher student mastery profile"
```

---

### Task 7: Student Self-Only Mastery Dashboard

**Files:**
- Create: `frontend/src/app/tutor/components/StudentMasteryDashboard.tsx`
- Modify: `frontend/src/app/tutor/page.tsx`
- Modify: `frontend/tests/mastery_profile_smoke.py`

**Interfaces:**
- Consumes: `/student/mastery` and `/student/mastery/:topicId/history` plus shared tree/panel components.
- Produces: self-only mastery display with no student ID in API requests.

- [ ] **Step 1: Add failing self-only API smoke test**

```python
def test_student_dashboard_uses_self_scoped_api():
    source = Path("frontend/src/app/tutor/components/StudentMasteryDashboard.tsx").read_text(encoding="utf-8")
    assert 'apiFetch(`/student/mastery?subject=' in source
    assert "/teacher/students/" not in source
    assert "studentId" not in source
```

- [ ] **Step 2: Run smoke tests and verify failure**

Run: `python -m pytest frontend/tests/mastery_profile_smoke.py -q`

Expected: FAIL because the student component does not exist.

- [ ] **Step 3: Implement the student dashboard component**

Load the self profile without accepting a student ID prop. Reuse
`MasteryTopicPanel`, omit recalculation controls, and show a short explanation
that confidence reflects how much evidence supports the estimate.

- [ ] **Step 4: Replace inferred frontend BKT values with persisted values**

Integrate the component around the student knowledge tree and remove the
hard-coded mastery/confidence fallbacks currently used for the profile display.
Keep existing learning-path routing behavior intact.

- [ ] **Step 5: Run frontend tests and build**

Run: `python -m pytest frontend/tests/mastery_profile_smoke.py -q`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: build succeeds.

- [ ] **Step 6: Commit student integration**

```bash
git add frontend/src/app/tutor/components/StudentMasteryDashboard.tsx frontend/src/app/tutor/page.tsx frontend/tests/mastery_profile_smoke.py
git commit -m "feat: add student mastery dashboard"
```

---

### Task 8: End-to-End Verification and Rollout Documentation

**Files:**
- Create: `tests/mastery_profile_integration.py`
- Modify: `README.md`
- Modify: `run.ps1`

**Interfaces:**
- Consumes: all Python, Go, and frontend deliverables.
- Produces: repeatable verification instructions and environment configuration.

- [ ] **Step 1: Add an integration smoke scenario**

The script authenticates as the demo teacher, triggers recalculation for a demo
student, reads the teacher profile, authenticates as that student, reads the
self profile, and asserts matching mastery/version for a shared topic. Skip with
a clear message when local services are not running.

- [ ] **Step 2: Document and configure the Python service URL**

Update `run.ps1` to set `LEARNING_PATH_URL=http://127.0.0.1:8000` for the Go
process. Update `README.md` with the mastery profile endpoints, recalculation
flow, and the requirement that PostgreSQL, Go, and Python services are running.

- [ ] **Step 3: Run focused verification**

Run: `cd learning-path && uv run pytest -q`

Expected: all Python tests PASS.

Run: `cd backend && go test ./internal/... -run '^$'`

Expected: all Go packages compile.

Run with PostgreSQL running: `cd backend && go test ./internal/mastery ./internal/handler -v`

Expected: all mastery and handler tests PASS.

Run: `python -m pytest frontend/tests/mastery_profile_smoke.py -q`

Expected: PASS.

Run: `cd frontend && npm run build`

Expected: production build succeeds.

- [ ] **Step 4: Run the live integration scenario when services are available**

Run: `python tests/mastery_profile_integration.py`

Expected: teacher and student APIs return the same persisted mastery state.

- [ ] **Step 5: Review scope and dirty-worktree safety**

Run: `git status --short` and `git diff --check`.

Expected: no whitespace errors; unrelated pre-existing changes remain present
and unmodified except where explicitly integrated.

- [ ] **Step 6: Commit rollout documentation and integration test**

```bash
git add tests/mastery_profile_integration.py README.md run.ps1
git commit -m "test: verify mastery profile workflow"
```
