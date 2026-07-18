# Always-visible BKT Mastery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Return BKT states for every subject topic and render `BKT xx%` on every node in student-personalized knowledge trees.

**Architecture:** The Go mastery service merges persisted states with transient BKT prior states and includes zero-evidence calculator states in recalculation responses without persisting them. The shared `KnowledgeTree` uses a frontend prior only while API data is absent and always renders a BKT badge/ring outside teacher editing mode.

**Tech Stack:** Go, GORM, testify, React 19, TypeScript, Next.js, pytest source smoke tests, Playwright smoke tests.

## Global Constraints

- The BKT v1 prior is exactly `0.30`.
- Zero-evidence states have status `unknown`, confidence `0`, evidence count `0`, and are not persisted to current or history tables.
- Raw answer accuracy must never be labeled as BKT.
- `KnowledgeTree` in `teacher` editing mode must not display student BKT.
- Do not modify telemetry files, package manifests, or unrelated worktree changes.

---

### Task 1: Complete mastery profiles in the Go API

**Files:**
- Modify: `backend/internal/mastery/service.go`
- Modify: `backend/internal/mastery/service_test.go`

**Interfaces:**
- Consumes: `Service.subjectTopics`, `StateStore.GetProfile`, `TopicState`, and calculator `TopicStatePayload`.
- Produces: `func priorTopicState(studentID, topicID uuid.UUID, calculatedAt time.Time) TopicState` and complete `Profile.Topics` maps from `GetProfile` and `RecalculateStudent`.

- [ ] **Step 1: Write failing service tests**

Add a configurable profile to `fakeStore`, then add tests equivalent to:

```go
func TestServiceGetProfileAddsPriorForMissingSubjectTopics(t *testing.T) {
    studentID, knownTopicID, missingTopicID := uuid.New(), uuid.New(), uuid.New()
    store := &fakeStore{profile: Profile{StudentID: studentID, Subject: "Toan", Topics: map[string]TopicState{
        knownTopicID.String(): {StudentID: studentID, TopicID: knownTopicID, MasteryProbability: 0.72, Version: 2, Status: StatusLearning},
    }}}
    svc := &Service{store: store, subjectTopics: func(context.Context, uuid.UUID, string) ([]uuid.UUID, error) {
        return []uuid.UUID{knownTopicID, missingTopicID}, nil
    }}

    profile, err := svc.GetProfile(context.Background(), studentID, "Toan")

    require.NoError(t, err)
    require.Len(t, profile.Topics, 2)
    require.Equal(t, 0.3, profile.Topics[missingTopicID.String()].MasteryProbability)
    require.Equal(t, StatusUnknown, profile.Topics[missingTopicID.String()].Status)
    require.Zero(t, profile.Topics[missingTopicID.String()].EvidenceCount)
}
```

Add a recalculation test with one evidence-backed payload and one zero-evidence payload. Assert both appear in `profile.Topics`, while `fakeStore.states` contains only the evidence-backed state.

- [ ] **Step 2: Run tests and verify RED**

Run:

```powershell
Set-Location backend
go test ./internal/mastery -run "TestService(GetProfileAddsPrior|RecalculateReturnsPrior)" -count=1
```

Expected: FAIL because `GetProfile` returns only stored topics and recalculation drops zero-evidence states from the response.

- [ ] **Step 3: Add the BKT prior state helper and complete GetProfile**

Add:

```go
const initialMasteryProbability = 0.30

func priorTopicState(studentID, topicID uuid.UUID, calculatedAt time.Time) TopicState {
    return TopicState{
        StudentID: studentID, TopicID: topicID,
        MasteryProbability: initialMasteryProbability,
        ConfidenceScore: 0, Consistency: 1,
        EvidenceCount: 0, EffectiveEvidence: 0,
        Status: StatusUnknown,
        EvidenceSummary: map[string]float64{}, SourceBreakdown: map[string]int{},
        Version: 1, CalculatedAt: calculatedAt,
    }
}
```

Update `GetProfile` to load persisted profile plus subject topic IDs, initialize a non-nil topic map, and insert `priorTopicState` only for missing topic IDs. Preserve persisted states unchanged.

- [ ] **Step 4: Keep zero-evidence states in recalculation responses only**

In `RecalculateStudent`, convert every calculator payload into a `TopicState` and add it to `profile.Topics`. Append only states with `EvidenceCount > 0` to the slice passed to `UpsertStates` and `publishDecision`.

- [ ] **Step 5: Run mastery tests and verify GREEN**

Run:

```powershell
Set-Location backend
go test ./internal/mastery -count=1
```

Expected: PASS.

### Task 2: Always render BKT in personalized KnowledgeTree modes

**Files:**
- Modify: `frontend/src/lib/mastery.ts`
- Modify: `frontend/src/app/components/KnowledgeTree.tsx`
- Modify: `frontend/tests/mastery_profile_smoke.py`

**Interfaces:**
- Consumes: `TopicMastery`, `masteryPercent`, and `KnowledgeTreeProps.mode`.
- Produces: `BKT_INITIAL_MASTERY = 0.30` and unconditional personalized-tree BKT rendering.

- [ ] **Step 1: Write a failing frontend smoke test**

Extend `frontend/tests/mastery_profile_smoke.py` with assertions that:

```python
def test_personalized_tree_always_renders_bkt_prior() -> None:
    tree = read("frontend/src/app/components/KnowledgeTree.tsx")
    mastery = read("frontend/src/lib/mastery.ts")
    assert "BKT_INITIAL_MASTERY" in mastery
    assert "const showMastery = mode !== \"teacher\"" in tree
    assert 'BKT {displayedMasteryPercent}%' in tree
    assert 'bktState ? "BKT " : ""' not in tree
    assert "accuracyPercent" not in tree
```

- [ ] **Step 2: Run the smoke test and verify RED**

Run:

```powershell
python -m pytest frontend/tests/mastery_profile_smoke.py -q
```

Expected: FAIL because the prior constant and unconditional BKT rendering do not exist and accuracy is still used as a fallback.

- [ ] **Step 3: Add the shared frontend prior**

Add to `frontend/src/lib/mastery.ts`:

```ts
export const BKT_INITIAL_MASTERY = 0.3;
```

- [ ] **Step 4: Replace accuracy fallback with BKT prior**

In `KnowledgeTree.tsx`, import `BKT_INITIAL_MASTERY`. Replace the `nodeAccuracy`-based calculation with:

```ts
const bktState = masteryByTopic[node.id];
const displayedMasteryPercent = toMasteryPercent(
  bktState?.masteryProbability ?? BKT_INITIAL_MASTERY,
);
const showMastery = mode !== "teacher";
```

Render the ring, track, and badge whenever `showMastery` is true. Badge text must always be:

```tsx
BKT {displayedMasteryPercent}%
```

Use the neutral unknown color for a missing state while preserving existing colors for real BKT states.

- [ ] **Step 5: Run frontend smoke tests and verify GREEN**

Run:

```powershell
python -m pytest frontend/tests/mastery_profile_smoke.py -q
```

Expected: PASS.

### Task 3: Integration verification

**Files:**
- Modify only if a verified defect requires it: `frontend/tests/teacher_mastery_browser_smoke.py`

**Interfaces:**
- Consumes: the complete mastery API and shared `KnowledgeTree` rendering.
- Produces: evidence that API and browser behavior match the approved design.

- [ ] **Step 1: Format changed Go files**

Run:

```powershell
gofmt -w backend/internal/mastery/service.go backend/internal/mastery/service_test.go
```

- [ ] **Step 2: Run focused backend and frontend suites**

Run:

```powershell
Set-Location backend
go test ./internal/mastery ./internal/handler -count=1
Set-Location ..
python -m pytest frontend/tests/mastery_profile_smoke.py -q
```

Expected: all tests PASS.

- [ ] **Step 3: Run the live teacher browser smoke**

With the local services running, run:

```powershell
python frontend/tests/teacher_mastery_browser_smoke.py
```

Expected: PASS and at least three `BKT xx%` badges found.

- [ ] **Step 4: Run repository hygiene checks**

Run:

```powershell
git diff --check -- backend/internal/mastery/service.go backend/internal/mastery/service_test.go frontend/src/lib/mastery.ts frontend/src/app/components/KnowledgeTree.tsx frontend/tests/mastery_profile_smoke.py
git status --short
```

Expected: no whitespace errors; unrelated telemetry/package changes remain untouched.
