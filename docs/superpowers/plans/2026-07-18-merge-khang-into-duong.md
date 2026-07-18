# Merge Khang Into Duong Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `origin/khang` into `duong`, prioritize Khang's UI/Socratic/LaTeX experience, and preserve Duong's mastery, exam, scoring, and tagging architecture.

**Architecture:** Perform the merge on an isolated integration branch created from current `duong`. Resolve frontend conflicts semantically with Khang as the presentation baseline and Duong as the behavioral/API baseline; resolve backend conflicts with Duong as the baseline and selectively include Khang support tools. Verify the integration before merging it back into `duong`; never modify or push `khang`.

**Tech Stack:** Git, Go/Fiber/GORM/PostgreSQL, Python/FastAPI/pytest, Next.js/React/TypeScript, source smoke tests.

## Global Constraints

- Source branch is `origin/khang` at `b7d4064`; target branch is `duong`.
- Never commit, reset, force-push, or push `khang`.
- Khang wins UI layout, Socratic interactions, LaTeX rendering, and responsive presentation.
- Duong wins persisted BKT, mastery history, auth, exams, scoring, question tagging, structured API errors, and database models.
- Remove Khang's hard-coded BKT values; PostgreSQL mastery remains authoritative.
- Preserve the user's uncommitted `.gitignore`, AI log, and frontend test files.
- Do not retain generated `backend/server.exe` changes or temporary `tmp/pdfs/**` images.

---

## File Structure

- `.gitignore`: union of ignore rules from both branches.
- `backend/cmd/server/main.go`: merged route/service wiring.
- `backend/cmd/check_questions/main.go`: Khang question diagnostic utility.
- `backend/cmd/dump_mock/main.go`: Khang mock graph export utility.
- `backend/cmd/import_bank/main.go`: Khang question-bank import utility.
- `de1_bank.json`: Khang sample question bank.
- `frontend/public/mock_knowledge_tree.json`: Khang mock graph asset.
- `frontend/src/app/components/KnowledgeTree.tsx`: Khang visual tree plus Duong BKT interfaces.
- `frontend/src/app/teacher/components/QuestionBankTab.tsx`: Khang UI plus Duong tagging/rubric behavior.
- `frontend/src/app/teacher/components/StudentsProgressTab.tsx`: Khang student-progress UI additions.
- `frontend/src/app/teacher/page.tsx`: Khang teacher layout plus all Duong modules.
- `frontend/src/app/tutor/page.tsx`: Khang tutor/Socratic/LaTeX UI plus persisted mastery.
- `frontend/src/lib/api.ts`: Duong structured error contract plus compatible Khang change.
- `tests/khang_duong_merge_smoke.py`: merge-specific source invariants.

---

### Task 1: Create Isolated Merge and Record Conflicts

**Files:**
- Modify through merge: all files changed by `origin/khang`
- Test: `tests/khang_duong_merge_smoke.py`

**Interfaces:**
- Consumes: current `duong`, `origin/khang`, and the semantic merge spec.
- Produces: integration branch `merge-khang-into-duong` with a pending conflict resolution.

- [ ] **Step 1: Preserve the main checkout and create an isolated worktree**

```powershell
git status --short
git worktree add .worktrees/merge-khang-into-duong -b merge-khang-into-duong duong
```

Expected: the original dirty checkout is unchanged and the new worktree starts from current `duong`.

- [ ] **Step 2: Run the baseline suites in the integration worktree**

```powershell
cd learning-path; uv sync; uv run pytest -q
cd ../backend; go mod download; $env:DB_PORT='5436'; go test ./internal/...
cd ../frontend; npm ci; npm run build
```

Expected: baseline tests and build pass before merging Khang.

- [ ] **Step 3: Merge Khang without committing the conflicted result**

```powershell
git merge --no-commit --no-ff origin/khang
git status --short
```

Expected conflicts:

- `.gitignore`
- `frontend/src/app/components/KnowledgeTree.tsx`
- `frontend/src/app/teacher/components/QuestionBankTab.tsx`
- `frontend/src/app/teacher/page.tsx`
- `frontend/src/app/tutor/page.tsx`

- [ ] **Step 4: Remove generated source-branch artifacts from the merge**

```powershell
git restore --source=HEAD --staged --worktree backend/server.exe
git rm --cached --ignore-unmatch tmp/pdfs/ct_toan/page-14.png tmp/pdfs/ct_toan/page-43.png tmp/pdfs/ct_toan/page-61.png
```

Expected: the compiled Go binary is unchanged and temporary PDF images are not part of the target merge.

---

### Task 2: Resolve Backend, Ignore Rules, and API Client

**Files:**
- Modify: `.gitignore`
- Modify: `backend/cmd/server/main.go`
- Add: `backend/cmd/check_questions/main.go`
- Add: `backend/cmd/dump_mock/main.go`
- Add: `backend/cmd/import_bank/main.go`
- Modify: `frontend/src/lib/api.ts`
- Test: `tests/khang_duong_merge_smoke.py`

**Interfaces:**
- Consumes: Duong service wiring and Khang support commands.
- Produces: compile-safe backend with all Duong routes and Khang utilities.

- [ ] **Step 1: Write failing merge smoke tests for backend invariants**

```python
def test_server_keeps_mastery_exam_scoring_and_tagging_wiring():
    source = read("backend/cmd/server/main.go")
    assert "masteryprofile.NewService" in source
    assert "NewExamHandler" in source
    assert "NewScoringHandler" in source
    assert "NewTaggingHandler" in source


def test_khang_support_commands_are_present_without_tracked_server_binary():
    assert exists("backend/cmd/check_questions/main.go")
    assert exists("backend/cmd/dump_mock/main.go")
    assert exists("backend/cmd/import_bank/main.go")
    assert "backend/server.exe" not in tracked_files()
```

- [ ] **Step 2: Run smoke tests and verify the conflicted tree fails**

Run: `python -m pytest tests/khang_duong_merge_smoke.py -q`

Expected: FAIL because conflict markers or missing helper utilities prevent the invariants from passing.

- [ ] **Step 3: Resolve `.gitignore` as a union**

Keep these exact categories:

```gitignore
node_modules/
__pycache__/
*.pyc
.next/
.env
.env.*.local
scratch/
tmp/
backend/data/exam-exports/
.worktrees/
```

Also retain the existing document upload and workspace metadata rules.

- [ ] **Step 4: Resolve `backend/cmd/server/main.go` using Duong as baseline**

Retain these exact constructors/routes:

```go
masteryRepo := masteryprofile.NewRepository(config.DB)
masteryClient := masteryprofile.NewClient(envOrDefault("LEARNING_PATH_URL", "http://127.0.0.1:8000"), nil)
masterySvc := masteryprofile.NewService(config.DB, masteryRepo, masteryClient)
masteryHandler := handler.NewMasteryHandler(masterySvc)
```

Keep exam/scoring/tagging initialization and add only Khang's non-duplicate server behavior.

- [ ] **Step 5: Resolve `frontend/src/lib/api.ts` using Duong's error contract**

Retain:

```ts
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown,
    public readonly latestContext?: unknown,
  ) { super(message); }
}
```

Integrate Khang's compatible base URL or request behavior without removing auth cleanup, retries, or structured errors.

- [ ] **Step 6: Run backend compile and smoke tests**

```powershell
cd backend
go test ./internal/... -run '^$'
go test ./cmd/check_questions ./cmd/dump_mock ./cmd/import_bank
cd ..
python -m pytest tests/khang_duong_merge_smoke.py -q
```

Expected: all commands compile and backend smoke invariants pass.

---

### Task 3: Resolve Shared Tree and Question Bank UI

**Files:**
- Modify: `frontend/src/app/components/KnowledgeTree.tsx`
- Modify: `frontend/src/app/teacher/components/QuestionBankTab.tsx`
- Modify: `frontend/src/app/teacher/components/StudentsProgressTab.tsx`
- Add: `de1_bank.json`
- Add: `frontend/public/mock_knowledge_tree.json`
- Test: `tests/khang_duong_merge_smoke.py`

**Interfaces:**
- Consumes: Khang UI layout and Duong `TopicMastery` types/callbacks.
- Produces: shared components used by both teacher and student pages.

- [ ] **Step 1: Add failing smoke tests for shared UI invariants**

```python
def test_knowledge_tree_keeps_khang_ui_and_duong_mastery():
    source = read("frontend/src/app/components/KnowledgeTree.tsx")
    assert "masteryByTopic" in source
    assert '"BKT "' in source
    assert "mock_knowledge_tree" in source or "LayoutGrid" in source


def test_question_bank_keeps_tagging_and_khang_import_ui():
    source = read("frontend/src/app/teacher/components/QuestionBankTab.tsx")
    assert "handleTagQuestion" in source
    assert "rubric" in source.lower()
    assert "xlsx" in source.lower() or "excel" in source.lower()
```

- [ ] **Step 2: Run smoke tests and verify unresolved conflicts fail**

Run: `python -m pytest tests/khang_duong_merge_smoke.py -q`

Expected: FAIL while conflict markers remain.

- [ ] **Step 3: Resolve `KnowledgeTree.tsx` with Khang presentation baseline**

Preserve this prop contract:

```ts
masteryByTopic?: Record<string, TopicMastery>;
onNodeClick?: (node: NodeItem) => void;
onFocusedNodeChange?: (nodeId: string) => void;
```

Render Khang's preferred controls/layout, then render the Duong badge from persisted data:

```tsx
{bktState && (
  <span>BKT {toMasteryPercent(bktState.masteryProbability)}%</span>
)}
```

- [ ] **Step 4: Resolve question-bank and progress components**

Use Khang's visual arrangement. Keep Duong props and callbacks for question tagging, rubrics, essay questions, import/export, and student inspection.

- [ ] **Step 5: Run shared frontend smoke tests and TypeScript build**

```powershell
python -m pytest tests/khang_duong_merge_smoke.py frontend/tests -q
cd frontend
npm run build
```

Expected: smoke tests pass and Next.js TypeScript compilation succeeds.

---

### Task 4: Resolve Teacher Page With Khang UI Priority

**Files:**
- Modify: `frontend/src/app/teacher/page.tsx`
- Test: `tests/khang_duong_merge_smoke.py`

**Interfaces:**
- Consumes: merged shared components and all Duong teacher feature components.
- Produces: Khang-style teacher hub without dropping Duong modules.

- [ ] **Step 1: Add failing teacher-page completeness test**

```python
def test_teacher_page_uses_khang_layout_and_all_duong_modules():
    source = read("frontend/src/app/teacher/page.tsx")
    for marker in [
        "StudentMasteryProfile",
        "ExamBuilderTab",
        "ExamScoringTab",
        "QuestionTaggingPanel",
        "LearningPathTab",
        "MonitoringTab",
    ]:
        assert marker in source
    assert "renderLatex" in source or "MathJax" in source or "katex" in source.lower()
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `python -m pytest tests/khang_duong_merge_smoke.py::test_teacher_page_uses_khang_layout_and_all_duong_modules -q`

Expected: FAIL until the conflict is resolved semantically.

- [ ] **Step 3: Start from Khang's layout and reattach Duong modules**

Keep Khang navigation, headers, responsive layout, modal interactions, and LaTeX/Socratic UI. Reinsert each Duong component using its current props rather than copying old inline implementations.

- [ ] **Step 4: Verify teacher source and build**

```powershell
python -m pytest tests/khang_duong_merge_smoke.py frontend/tests -q
cd frontend
npm run build
```

Expected: teacher completeness test and TypeScript build pass.

---

### Task 5: Resolve Tutor Page With Persisted BKT

**Files:**
- Modify: `frontend/src/app/tutor/page.tsx`
- Test: `tests/khang_duong_merge_smoke.py`

**Interfaces:**
- Consumes: Khang Socratic/LaTeX workspace and Duong mastery APIs/components.
- Produces: Khang-style student experience backed by persisted mastery.

- [ ] **Step 1: Add failing tutor invariants**

```python
def test_tutor_page_keeps_khang_socratic_ui_and_real_mastery():
    source = read("frontend/src/app/tutor/page.tsx")
    assert "StudentMasteryDashboard" in source
    assert "masteryByTopic={masteryByTopic}" in source
    assert "/student/mastery?subject=" in source
    assert "renderLatex" in source or "parseLatex" in source or "dangerouslySetInnerHTML" in source
    forbidden = ["mastery: 0.94", "mastery: 0.28", "mastery: 0.45", "return { mastery: 0.15"]
    assert not any(marker in source for marker in forbidden)
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `python -m pytest tests/khang_duong_merge_smoke.py::test_tutor_page_keeps_khang_socratic_ui_and_real_mastery -q`

Expected: FAIL while the Khang hard-coded BKT implementation or conflict markers remain.

- [ ] **Step 3: Resolve with Khang UI as baseline**

Retain Khang Socratic workspace, math renderer, drawer, question flow, and responsive layout. Restore Duong state and API calls:

```ts
const [masteryByTopic, setMasteryByTopic] = useState<Record<string, TopicMastery>>({});
apiFetch(`/student/mastery?subject=${encodeURIComponent(selectedSubject)}`)
  .then((profile) => setMasteryByTopic(profile?.topics || {}));
```

Pass the map to `KnowledgeTree`, use persisted mastery/confidence in gauges, and mount `StudentMasteryDashboard`.

- [ ] **Step 4: Run tutor smoke tests and frontend build**

```powershell
python -m pytest tests/khang_duong_merge_smoke.py frontend/tests -q
cd frontend
npm run build
```

Expected: no hard-coded BKT markers and build succeeds.

---

### Task 6: Final Verification, Merge Into Duong, and Push

**Files:**
- Test: all changed source and existing suites

**Interfaces:**
- Consumes: fully resolved integration branch.
- Produces: verified merge commit on `duong`; `khang` unchanged.

- [ ] **Step 1: Verify no conflict or stale mastery markers remain**

```powershell
rg -n "^(<<<<<<<|=======|>>>>>>>)" .
rg -n "mastery: 0\.94|mastery: 0\.28|mastery: 0\.45|return \{ mastery: 0\.15" frontend/src/app/tutor/page.tsx
git diff --check
```

Expected: both searches return no matches and diff check is clean.

- [ ] **Step 2: Run the full verification suite**

```powershell
cd learning-path; uv run pytest -q
cd ../backend; $env:DB_PORT='5436'; go test ./internal/...
cd ..; python -m pytest tests/khang_duong_merge_smoke.py frontend/tests -q
cd frontend; npm run build
```

Expected: Python, Go, smoke tests, and production build all pass.

- [ ] **Step 3: Commit the resolved merge**

```powershell
git add -A
git commit
```

Expected: a merge commit with both parents, preserving `origin/khang` unchanged.

- [ ] **Step 4: Merge the integration branch into `duong`**

From the main checkout, temporarily stash uncommitted files, merge `merge-khang-into-duong`, rerun the full verification suite, then restore the stash.

- [ ] **Step 5: Confirm branch integrity and push only Duong**

```powershell
git rev-parse origin/khang
git push origin duong
```

Expected: `origin/khang` remains `b7d4064`; only `origin/duong` advances.
