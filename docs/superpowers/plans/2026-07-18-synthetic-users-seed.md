# Synthetic Users Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reset and recreate isolated synthetic teacher/student fixtures on every backend start, generate learning evidence, and calculate displayed BKT exclusively through the existing mastery pipeline.

**Architecture:** Move the destructive inline demo setup out of `cmd/server/main.go` into an isolated `internal/syntheticseed` service. The service owns a deterministic synthetic namespace, resets it transactionally, creates graph/question/activity records, then calls the existing mastery service after the transaction commits.

**Tech Stack:** Go, GORM, PostgreSQL, bcrypt, Python learning-path BKT API, Playwright.

## Global Constraints

- Synthetic seed is enabled unless `ENABLE_SYNTHETIC_DATA=false` (case-insensitive).
- Every enabled backend start resets synthetic records to the same fixture state.
- Real users and non-synthetic subjects/content must never be deleted or modified.
- Mastery probability and confidence must never be inserted directly; only answer events feed recalculation.
- `.codegraph/` remains untracked and outside all commits.

---

### Task 1: Configuration And Deterministic Scenarios

**Files:**
- Create: `backend/internal/syntheticseed/config.go`
- Create: `backend/internal/syntheticseed/scenario.go`
- Test: `backend/internal/syntheticseed/config_test.go`
- Test: `backend/internal/syntheticseed/scenario_test.go`

**Interfaces:**
- Produces: `Enabled(raw string) bool`, `DefaultConfig() Config`, and `GenerateAttempts(studentIndex, topicIndex, questionCount int) []Attempt`.
- `Attempt` contains `QuestionIndex int`, `Correct bool`, and `OccurredAtOffset time.Duration`; it contains no mastery fields.

- [ ] **Step 1: Write failing configuration tests**

```go
func TestEnabledDefaultsToTrueAndOnlyFalseDisables(t *testing.T) {
    require.True(t, Enabled(""))
    require.True(t, Enabled("true"))
    require.False(t, Enabled("FALSE"))
}
```

- [ ] **Step 2: Run configuration tests and verify RED**

Run: `go test ./internal/syntheticseed -run TestEnabled -count=1`
Expected: FAIL because `Enabled` does not exist.

- [ ] **Step 3: Implement configuration and stable account definitions**

```go
type Account struct { Email, Password, Name, Role string }
type Config struct { Subject string; Teacher Account; Students []Account; Seed int64 }

func Enabled(raw string) bool { return !strings.EqualFold(strings.TrimSpace(raw), "false") }
```

Use the approved `@aurora.local` accounts and subject `Synthetic - Toan dai so` as the ownership boundary.

- [ ] **Step 4: Write failing deterministic scenario tests**

Verify three students receive distinct strong/developing/struggling answer patterns, every question index is valid, and generated objects expose no mastery percentage.

- [ ] **Step 5: Implement deterministic scenario generation**

Use `rand.New(rand.NewSource(config.Seed + int64(studentIndex*100+topicIndex)))`; derive correct/incorrect outcomes from profile probabilities internal to the generator, then emit only `Attempt` events.

- [ ] **Step 6: Run task tests and commit**

Run: `go test ./internal/syntheticseed -count=1`
Expected: PASS.

Commit: `feat: define synthetic seed scenarios`

---

### Task 2: Transactional Namespace Reset And Fixture Creation

**Files:**
- Create: `backend/internal/syntheticseed/service.go`
- Create: `backend/internal/syntheticseed/service_test.go`
- Remove after replacement: `backend/cmd/server/demo_mastery_seed.go`
- Remove after replacement: `backend/cmd/server/demo_mastery_seed_test.go`

**Interfaces:**
- Consumes: `Config`, `GenerateAttempts`, `*gorm.DB`.
- Produces: `New(db *gorm.DB, config Config) *Service` and `ResetAndSeed(ctx context.Context) (Result, error)`.
- `Result` returns created user IDs, subject, and counts needed for logging/recalculation, but no fixed mastery values.

- [ ] **Step 1: Write a failing namespace-isolation test**

Create one real teacher/student and one real subject, run `ResetAndSeed`, and assert real rows remain byte-for-byte present while synthetic accounts/content are recreated.

- [ ] **Step 2: Run the isolation test and verify RED**

Run with `$env:DB_PORT='5436'; go test ./internal/syntheticseed -run TestResetAndSeedPreservesRealData -count=1`
Expected: FAIL because `Service` does not exist.

- [ ] **Step 3: Implement transaction-safe reset order**

Inside one GORM transaction:

1. Resolve synthetic user IDs by exact approved email allowlist and `@aurora.local` namespace.
2. Resolve synthetic node IDs by exact synthetic subject.
3. Delete dependent mastery histories/states, activity logs, student states, messages/sessions, question/rubric/tag rows, edges, nodes, teacher topics, and synthetic users.
4. Create bcrypt-hashed users, nodes, edges, questions, student state, sessions/messages, and generated `ActivityLog` answer events.

Return an error on any failed operation so the transaction rolls back.

- [ ] **Step 4: Write and pass reset-idempotency tests**

Run the service twice and assert user/node/question/activity counts and account IDs are valid after the second run, while no duplicate synthetic rows remain.

- [ ] **Step 5: Verify generated activity coverage**

Assert each student has evidence across at least three non-root topics and that activity actions are only `answer_correct` or `answer_incorrect` for BKT inputs.

- [ ] **Step 6: Commit**

Run: `$env:DB_PORT='5436'; go test ./internal/syntheticseed -count=1`
Expected: PASS.

Commit: `feat: reset and seed synthetic fixtures`

---

### Task 3: Startup Wiring And BKT Recalculation

**Files:**
- Modify: `backend/cmd/server/main.go`
- Modify: `backend/.env.example`
- Modify: `README.md`
- Test: `backend/cmd/server/main_test.go`

**Interfaces:**
- Consumes: `syntheticseed.Enabled`, `syntheticseed.Service.ResetAndSeed`, and `mastery.Service.RecalculateStudent`.
- Produces: startup behavior that resets fixtures, recalculates every synthetic student, and logs counts before registering HTTP routes.

- [ ] **Step 1: Write a failing startup orchestration test**

Extract `runSyntheticSeed(ctx, rawFlag, seeder, recalculator, logger) error` behind small interfaces. Assert `false` performs no calls and enabled mode recalculates every returned student.

- [ ] **Step 2: Run focused test and verify RED**

Run: `go test ./cmd/server -run TestRunSyntheticSeed -count=1`
Expected: FAIL because orchestration helper does not exist.

- [ ] **Step 3: Remove the old inline destructive demo block**

Delete the startup SQL that removes `student@aurora.edu.vn`, `teacher@aurora.edu.vn`, A/B/C accounts, and the old inline graph/question fixture. Replace it with the isolated service invocation.

- [ ] **Step 4: Recalculate mastery through the existing service**

For every `Result.Student` call:

```go
profile, err := masterySvc.RecalculateStudent(ctx, student.ID, result.Subject)
```

Treat recalculation failure as startup failure while synthetic data is enabled. Log the number of returned topic states, not their percentages.

- [ ] **Step 5: Document configuration and test credentials**

Add `ENABLE_SYNTHETIC_DATA=true` to `backend/.env.example`; document the four approved accounts and the reset-on-start behavior in `README.md`.

- [ ] **Step 6: Run backend verification and commit**

Run: `$env:DB_PORT='5436'; go test ./internal/... ./cmd/server`
Expected: PASS.

Commit: `feat: load synthetic users on backend startup`

---

### Task 4: Live API And Teacher UI Verification

**Files:**
- Create/modify: `frontend/tests/teacher_mastery_browser_smoke.py`
- Create: `tests/synthetic_users_integration.py`

**Interfaces:**
- Consumes: running frontend `localhost:3000`, Go API `localhost:8081/api`, and learning-path API `localhost:8000`.
- Produces: repeatable verification that synthetic authentication and API-derived BKT badges work end-to-end.

- [ ] **Step 1: Add API integration assertions**

The script logs in every synthetic account, lists teacher student progress, requests the synthetic B student's mastery profile, and asserts at least three topic states with evidence counts greater than zero.

- [ ] **Step 2: Keep browser test API-driven**

Authenticate through `/api/auth/login`, store the returned token/user, select the synthetic subject, inspect `synthetic.student.b@aurora.local`, and assert at least three `BKT <number>%` badges. Do not assert exact percentages.

- [ ] **Step 3: Restart services twice and verify reset behavior**

After each restart run:

```powershell
python tests/synthetic_users_integration.py
python frontend/tests/teacher_mastery_browser_smoke.py
```

Expected: both pass on both runs and profiles are non-empty without duplicate events.

- [ ] **Step 4: Run full project verification**

```powershell
cd learning-path; uv run pytest -q
cd ../backend; $env:DB_PORT='5436'; go test ./internal/... ./cmd/server
cd ..; python -m pytest tests/khang_duong_merge_smoke.py frontend/tests -q
cd frontend; npm run build
```

Expected: all suites and production build pass.

- [ ] **Step 5: Commit and push `khang`**

Commit: `test: verify synthetic users and mastery UI`

Push only after confirming `.codegraph/` is untracked and excluded from the commit.
