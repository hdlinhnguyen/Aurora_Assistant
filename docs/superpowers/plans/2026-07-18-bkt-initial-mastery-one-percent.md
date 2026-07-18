# BKT Initial Mastery at One Percent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change every active BKT initial-mastery default from 30% to 1% without migrating existing synthetic mastery records.

**Architecture:** Keep the existing layer-specific constants and synchronize them at `0.01`. The Python learning-path service remains the calculation authority, while the Go backend and frontend retain matching fallbacks for topics without evidence.

**Tech Stack:** Python 3.13, pytest, Go 1.26, testify, TypeScript, Vitest

## Global Constraints

- Use the exact prior value `0.01` in Python, Go, and TypeScript.
- Do not add database migrations, batch recalculation, startup jobs, or environment configuration.
- Do not modify or restore the unrelated deletion of `3. CT_Toan.doc`.
- Existing synthetic mastery records remain unchanged until the normal recalculation flow runs.

---

### Task 1: Python BKT Calculation Prior

**Files:**
- Modify: `learning-path/tests/test_bkt.py:11`
- Modify: `learning-path/tests/test_bkt.py:34`
- Modify: `learning-path/src/learning_path/bkt.py:28`

**Interfaces:**
- Consumes: `BKTParams()` and `knowledge_state(..., params=BKTParams(), ...)`
- Produces: `BKTParams().p_l0 == 0.01` and a no-evidence state with `mastery_probability == 0.01`

- [ ] **Step 1: Write the failing prior test**

Update the parameter comment and make the existing no-evidence test assert the requested default explicitly:

```python
PARAMS = BKTParams()  # p_l0=0.01, p_t=0.1, p_s=0.1, p_g=0.2


def test_no_evidence_keeps_one_percent_prior_and_is_unknown():
    s = state([])
    assert PARAMS.p_l0 == pytest.approx(0.01)
    assert s.mastery_probability == pytest.approx(0.01)
    assert s.mastery_status == "unknown"
    assert s.confidence_score == 0.0
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
uv run --project learning-path pytest learning-path/tests/test_bkt.py::test_no_evidence_keeps_one_percent_prior_and_is_unknown -v
```

Expected: FAIL because `BKTParams().p_l0` is still `0.3`.

- [ ] **Step 3: Change the Python default**

In `BKTParams`, set:

```python
p_l0: float = 0.01  # biết trước khi có evidence
```

- [ ] **Step 4: Run the full BKT test module and verify GREEN**

Run:

```powershell
uv run --project learning-path pytest learning-path/tests/test_bkt.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit the Python change**

```powershell
git add -- learning-path/src/learning_path/bkt.py learning-path/tests/test_bkt.py
git commit -m "fix: start BKT mastery at one percent"
```

### Task 2: Go Missing-Topic Prior

**Files:**
- Modify: `backend/internal/mastery/service_test.go:101`
- Modify: `backend/internal/mastery/service.go:22`

**Interfaces:**
- Consumes: `Service.GetProfile` and `priorTopicState`
- Produces: missing subject topics with `MasteryProbability == 0.01`, `StatusUnknown`, and zero evidence

- [ ] **Step 1: Change the Go expectation to 1%**

In `TestServiceGetProfileAddsPriorForMissingSubjectTopics`, replace the current assertion with:

```go
require.Equal(t, 0.01, prior.MasteryProbability)
```

- [ ] **Step 2: Run the focused Go test and verify RED**

Run:

```powershell
go test ./internal/mastery -run TestServiceGetProfileAddsPriorForMissingSubjectTopics -count=1
```

from `backend`.

Expected: FAIL because the returned prior remains `0.3`.

- [ ] **Step 3: Change the Go fallback constant**

Set:

```go
const initialMasteryProbability = 0.01
```

- [ ] **Step 4: Run the Go mastery tests and verify GREEN**

Run:

```powershell
go test ./internal/mastery -count=1
```

from `backend`.

Expected: all tests pass. Do not change calculator fixture payloads that intentionally simulate arbitrary calculated values.

- [ ] **Step 5: Commit the Go change**

```powershell
git add -- backend/internal/mastery/service.go backend/internal/mastery/service_test.go
git commit -m "fix: align backend mastery prior to one percent"
```

### Task 3: Frontend Missing-State Prior

**Files:**
- Create: `frontend/src/lib/mastery.test.ts`
- Modify: `frontend/src/lib/mastery.ts:3`

**Interfaces:**
- Consumes: exported `BKT_INITIAL_MASTERY`
- Produces: frontend consumers receiving the fallback value `0.01`

- [ ] **Step 1: Add the failing frontend constant test**

Create `frontend/src/lib/mastery.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { BKT_INITIAL_MASTERY } from "./mastery";

describe("BKT_INITIAL_MASTERY", () => {
  it("starts topics without evidence at one percent", () => {
    expect(BKT_INITIAL_MASTERY).toBe(0.01);
  });
});
```

- [ ] **Step 2: Run the frontend test and verify RED**

Run:

```powershell
npm test -- --run src/lib/mastery.test.ts
```

from `frontend`.

Expected: FAIL because `BKT_INITIAL_MASTERY` is still `0.3`.

- [ ] **Step 3: Change the frontend fallback constant**

Set:

```typescript
export const BKT_INITIAL_MASTERY = 0.01;
```

- [ ] **Step 4: Run frontend verification and verify GREEN**

Run from `frontend`:

```powershell
npm test -- --run src/lib/mastery.test.ts
npm run build
```

Expected: the focused Vitest test passes and the Next.js production build exits successfully.

- [ ] **Step 5: Commit the frontend change**

```powershell
git add -- frontend/src/lib/mastery.ts frontend/src/lib/mastery.test.ts
git commit -m "fix: show one percent initial mastery"
```

### Task 4: Cross-Layer Verification

**Files:**
- Verify: `learning-path/src/learning_path/bkt.py`
- Verify: `backend/internal/mastery/service.go`
- Verify: `frontend/src/lib/mastery.ts`

**Interfaces:**
- Consumes: the three layer-specific initial mastery constants
- Produces: consistent `0.01` behavior across calculation and display fallbacks

- [ ] **Step 1: Confirm all active defaults are synchronized**

Run:

```powershell
rg -n "p_l0: float|initialMasteryProbability|BKT_INITIAL_MASTERY" learning-path backend frontend
```

Expected: each active default is `0.01`.

- [ ] **Step 2: Run focused backend and calculation suites again**

Run:

```powershell
uv run --project learning-path pytest learning-path/tests/test_bkt.py -q
```

Then run from `backend`:

```powershell
go test ./internal/mastery -count=1
```

Expected: both commands exit successfully with zero failures.

- [ ] **Step 3: Inspect the final diff without touching unrelated changes**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; `3. CT_Toan.doc` may remain deleted as the user's unrelated change.
