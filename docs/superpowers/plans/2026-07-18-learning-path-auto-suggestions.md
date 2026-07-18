# Automatic Learning Path Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically suggest up to three target topics and five weak students, generate teacher-only draft paths, and expose paths to students only after an authorized teacher approval.

**Architecture:** Add a deterministic suggestion module to the Python learning-path service, then let the authenticated Go backend resolve the teacher's single classroom, validate membership, proxy evidence, and persist draft/approved snapshots. The teacher frontend loads preview suggestions when the tab opens and sends explicit topic/student selections into the existing draft pipeline.

**Tech Stack:** Python 3, FastAPI, Pydantic, NetworkX, LangGraph, Go, Fiber, GORM, React, Next.js, TypeScript, Vitest.

## Global Constraints

- Support exactly one classroom per teacher in this release; return a configuration error for zero or multiple classrooms.
- Suggest at most three topics and five students.
- Never classify low-confidence or unknown states as weak.
- Never expose Draft paths through the student endpoint.
- Remove all `class-demo` and fixed demo-email fallbacks from learning-path create/approve.
- Reuse weighted BKT, reverse prerequisite traversal, root-cause ranking, and topological planning; do not add an LLM.

---

### Task 1: Deterministic Python suggestion engine

**Files:**
- Create: `learning-path/src/learning_path/suggestions.py`
- Modify: `learning-path/src/learning_path/schemas.py`
- Test: `learning-path/tests/test_suggestions.py`

**Interfaces:**
- Consumes: `CurriculumGraph`, `StudentTopicKnowledgeState`, `diagnose`, `rank_root_causes`, and `plan_path`.
- Produces: `suggest_from_states(request: LearningPathSuggestionRequest, states_by_student: dict[str, dict[str, StudentTopicKnowledgeState]], curriculum: CurriculumGraph, generated_at: datetime) -> LearningPathSuggestionResponse`.

- [ ] **Step 1: Write failing tests for topic scoring, branch deduplication, top-five ranking, and insufficient evidence**

Create fixtures with a small DAG and assert that the response selects the highest deterministic topic scores, removes a redundant ancestor with the same gap population, limits students to five, and keeps uncertain students only in `insufficient_evidence_students`.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd learning-path; python -m pytest tests/test_suggestions.py -q`

Expected: FAIL because `learning_path.suggestions` and suggestion schemas do not exist.

- [ ] **Step 3: Add suggestion schemas**

Add `SuggestedTopic`, `SuggestedStudent`, `LearningPathSuggestionRequest`, and `LearningPathSuggestionResponse` to `schemas.py`. Use snake_case fields matching the approved API contract and defaults `max_topics=3`, `max_students=5`.

- [ ] **Step 4: Implement the minimal deterministic engine**

For each topic, include only states whose confidence meets the request threshold. Calculate:

```python
score = gap_rate * average_deficit * average_confidence * (
    (1 + len(nx.descendants(graph, topic_id))) / (1 + len(curriculum.topics))
)
```

Sort by `(-score, topic_id)`, suppress an ancestor when its gap-student Jaccard overlap with an already selected descendant is at least `0.8`, then diagnose/plan each student against selected targets. Sort students by `(-help_priority, -blocked_target_count, student_id)` and retain five.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `cd learning-path; python -m pytest tests/test_suggestions.py tests/test_diagnosis.py tests/test_planner.py tests/test_class_insight.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add -- learning-path/src/learning_path/suggestions.py learning-path/src/learning_path/schemas.py learning-path/tests/test_suggestions.py
git commit -m "feat: rank learning path suggestions"
```

### Task 2: FastAPI suggestion endpoint

**Files:**
- Modify: `learning-path/src/learning_path/api.py`
- Test: `learning-path/tests/test_api_suggestions.py`

**Interfaces:**
- Consumes: `suggest_from_states` from Task 1 and existing quiz/paper calibration plus BKT functions.
- Produces: `POST /learning-path/suggestions`, accepting `request`, `raw_quiz`, `raw_paper`, and `as_of` and returning `LearningPathSuggestionResponse`.

- [ ] **Step 1: Write failing API tests**

Test a valid classroom request, empty evidence, and a cyclic curriculum. Assert the endpoint returns `algorithm_version == "learning-path-suggestions-v1"`, valid empty lists for insufficient data, and HTTP 422 with `graph_validation_error` for a cycle.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd learning-path; python -m pytest tests/test_api_suggestions.py -q`

Expected: FAIL with HTTP 404 for the missing endpoint.

- [ ] **Step 3: Implement evidence-to-state calculation and endpoint**

Calibrate evidence, ingest it through `EvidenceStore`, calculate each active student-topic state with `knowledge_state`, call `suggest_from_states`, and return its JSON model. Validate the curriculum DAG before ranking.

- [ ] **Step 4: Run API lifecycle suite**

Run: `cd learning-path; python -m pytest tests/test_api_suggestions.py tests/test_api_lifecycle.py tests/test_api.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add -- learning-path/src/learning_path/api.py learning-path/tests/test_api_suggestions.py
git commit -m "feat: expose learning path suggestions API"
```

### Task 3: Secure Go orchestration and draft persistence

**Files:**
- Modify: `backend/internal/model/models.go`
- Modify: `backend/internal/handler/tutor.go`
- Modify: `backend/cmd/server/main.go`
- Create: `backend/internal/handler/learning_path_test.go`

**Interfaces:**
- Consumes: classroom ownership from `model.Classroom.TeacherID`, student membership from `model.User.ClassroomID`, and Python `POST /learning-path/suggestions` plus existing create/approve endpoints.
- Produces: `GET /api/teacher/learning-path/suggestions`; secure create/approve handlers; `LearningPath.TeacherID` for draft ownership.

- [ ] **Step 1: Write failing handler/domain tests**

Use SQLite/Fiber fixtures to assert: zero/multiple classrooms return 409; suggestions include only classroom students; create rejects a student outside the classroom; no request falls back to demo emails; `approve=false` stores no Approved path; another teacher cannot approve a thread; an approved path becomes visible to the correct student.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd backend; go test ./internal/handler -run LearningPath -count=1`

Expected: FAIL because the suggestion route and ownership checks do not exist.

- [ ] **Step 3: Add ownership metadata and shared helpers**

Add `TeacherID uuid.UUID` to `model.LearningPath`. Implement helpers that resolve exactly one classroom for a teacher, list its student IDs, validate requested IDs as a subset, and convert activity logs to `RawQuizEvidence`.

- [ ] **Step 4: Implement suggestions proxy and secure create**

Register `GET /teacher/learning-path/suggestions`. Proxy the single classroom, its students, and their evidence to Python. In `CreateLearningPath`, ignore arbitrary teacher/class identity, use the resolved classroom, require non-empty explicit students and targets, validate membership, call Python, and persist returned paths as `Draft` rows tied to teacher, class, and thread.

- [ ] **Step 5: Secure approval and student visibility**

Require Draft rows for the same teacher/thread. If `approve=false`, resume Python but do not save Approved rows. If approved, validate every custom-path student and topological prerequisite order, then transactionally replace only that student's path in the same class and store `Approved` with the teacher ID.

- [ ] **Step 6: Run handler and model suites**

Run: `cd backend; go test ./internal/handler ./internal/model ./internal/syntheticseed -count=1`

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- backend/internal/model/models.go backend/internal/handler/tutor.go backend/internal/handler/learning_path_test.go backend/cmd/server/main.go
git commit -m "feat: secure learning path draft approval"
```

### Task 4: Teacher tab preview and explicit selection

**Files:**
- Create: `frontend/src/app/teacher/components/learningPathTypes.ts`
- Create: `frontend/src/app/teacher/components/LearningPathTab.test.tsx`
- Modify: `frontend/src/app/teacher/components/LearningPathTab.tsx`
- Modify: `frontend/src/app/teacher/page.tsx`

**Interfaces:**
- Consumes: `GET /teacher/learning-path/suggestions` and secure create/approve payloads from Task 3.
- Produces: automatic preview load on tab entry, selectable suggested topics/students, and explicit Draft payloads.

- [ ] **Step 1: Write failing component tests**

Mock suggestions with `confirmed_gap_rate` and `help_priority`. Assert the UI renders percentages/priorities without `NaN`, checks suggested topic/student controls by default, shows insufficient-evidence students separately, and invokes generation with the selected IDs.

- [ ] **Step 2: Run tests and verify RED**

Run: `cd frontend; npm test -- --run src/app/teacher/components/LearningPathTab.test.tsx`

Expected: FAIL because suggestion props and controls do not exist.

- [ ] **Step 3: Add strict frontend contracts and state**

Define interfaces for suggestion response, topics, students, class insight, paths, and steps. Add `learningPathSuggestions`, `loadingSuggestions`, `selectedLearningPathStudents`, and a tab-entry effect that loads suggestions once and initializes both selections.

- [ ] **Step 4: Render preview and fix response field names**

Render the suggested topic/student cards before Draft results. Display `confirmed_gap_rate` and `help_priority`, root-cause reason, and insufficient-evidence warning. Keep all controls usable on desktop and mobile.

- [ ] **Step 5: Send explicit create payload**

Change generation to send:

```typescript
{
  studentIds: selectedLearningPathStudents,
  targetTopicIds: selectedTargetTopics,
}
```

Disable generation when either selection is empty. Preserve choices after a transient API error.

- [ ] **Step 6: Run component tests and frontend checks**

Run: `cd frontend; npm test -- --run src/app/teacher/components/LearningPathTab.test.tsx; npm run lint`

Expected: PASS with no lint errors introduced by these files.

- [ ] **Step 7: Commit**

Run:

```powershell
git add -- frontend/src/app/teacher/components/learningPathTypes.ts frontend/src/app/teacher/components/LearningPathTab.test.tsx frontend/src/app/teacher/components/LearningPathTab.tsx frontend/src/app/teacher/page.tsx
git commit -m "feat: preview personalized learning path suggestions"
```

### Task 5: End-to-end verification

**Files:**
- Modify only if a verified defect is found in files from Tasks 1-4.

**Interfaces:**
- Consumes: all implemented APIs and UI.
- Produces: evidence that preview, Draft, approval, and student visibility work together.

- [ ] **Step 1: Run Python suite**

Run: `cd learning-path; python -m pytest -q`

Expected: PASS.

- [ ] **Step 2: Run Go suite**

Run: `cd backend; go test ./... -count=1`

Expected: PASS.

- [ ] **Step 3: Run frontend tests and build**

Run: `cd frontend; npm test -- --run; npm run build`

Expected: PASS.

- [ ] **Step 4: Verify lifecycle manually or with browser automation**

Log in as teacher, open the learning-path tab, confirm suggestions auto-load, create a Draft for selected students, edit one path, approve it, then log in as the selected and an unselected student. The selected student must see the approved path; the unselected student must not receive that Draft.

- [ ] **Step 5: Record final status**

Report exact passing commands and any environmental test that could not run. Do not claim completion without fresh verification output.
