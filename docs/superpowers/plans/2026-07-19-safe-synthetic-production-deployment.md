# Safe Synthetic Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve real curriculum during recurring synthetic startup seeding, then deploy the verified frontend and backend to Vercel and Railway.

**Architecture:** Derive the owned synthetic curriculum IDs from the same deterministic catalog used to create the seed. Reset only records tied to those IDs or synthetic accounts, keep `ENABLE_SYNTHETIC_DATA=true`, and deploy a single pushed `main` revision to both platforms.

**Tech Stack:** Go 1.26, GORM/PostgreSQL, TypeScript, Next.js, Vitest, Railway, Vercel

## Global Constraints

- Synthetic cleanup must never select records solely by subject name.
- Real users and real curriculum must survive repeated backend startup seeds.
- Keep `ENABLE_SYNTHETIC_DATA=true` on Railway production.
- Do not stage or modify `artifacts/local-frontend.png` or unrelated files.
- Vercel production must use `https://aurora-go-production.up.railway.app/api`.

---

### Task 1: Protect real curriculum from synthetic reset

**Files:**
- Modify: `backend/internal/syntheticseed/service_test.go`
- Modify: `backend/internal/syntheticseed/curriculum.go`
- Modify: `backend/internal/syntheticseed/service.go`

**Interfaces:**
- Produces: `syntheticCurriculumNodeIDs() ([]uuid.UUID, error)` containing the deterministic root and closure topic IDs.
- Consumes: `stableSyntheticUUID`, `syntheticCurriculumCatalog`, `grade7TargetKeys`, and `resolveCurriculumClosure`.

- [ ] **Step 1: Extend the preservation regression test**

Change `TestResetAndSeedPreservesRealData` so the real node uses `DefaultConfig().Subject`. Add a real question tied to that node, a real edge, and real mastery/history rows. Run `ResetAndSeed` twice and assert every real record still exists.

- [ ] **Step 2: Run the focused test and verify it fails**

Run from `backend/`:

```powershell
$env:DB_PORT='5436'; go test ./internal/syntheticseed -run TestResetAndSeedPreservesRealData -count=1 -v
```

Expected: FAIL because subject-wide cleanup deletes the real node or its dependent rows.

- [ ] **Step 3: Add deterministic ownership helper**

Add `syntheticCurriculumNodeIDs` in `curriculum.go`. Resolve the curriculum closure, append `stableSyntheticUUID("curriculum", "root")`, then append `stableSyntheticUUID("curriculum", topic.StableKey)` for every closure topic.

- [ ] **Step 4: Restrict reset queries to owned IDs**

In `resetSyntheticData`, replace the `subject IN ?` node query with `id IN ?` using `syntheticCurriculumNodeIDs`. Delete edges with `source_id IN ? OR target_id IN ?`; remove the subject-wide edge delete. Keep dependent question and mastery cleanup scoped to the same node IDs.

- [ ] **Step 5: Run focused and package tests**

Run:

```powershell
$env:DB_PORT='5436'; go test ./internal/syntheticseed -count=1
$env:DB_PORT='5436'; go test ./cmd/server -run Synthetic -count=1
```

Expected: PASS.

### Task 2: Verify and commit frontend/backend source

**Files:**
- Modify: `frontend/src/app/tutor/hub/api.ts`
- Modify: `frontend/src/app/tutor/page_old.tsx`
- Create: `frontend/src/app/tutor/hub/api.test.ts`
- Include: `docs/superpowers/plans/2026-07-19-align-adaptive-downgrade-api.md`
- Include: `docs/superpowers/plans/2026-07-19-safe-synthetic-production-deployment.md`

**Interfaces:**
- Frontend adaptive downgrade calls `POST /api/nodes/:nodeId/adaptive-downgrade`.
- Backend startup seed preserves real curriculum and recreates synthetic fixtures.

- [ ] **Step 1: Run formatting and full verification**

Run `gofmt` on modified Go files, Go tests with `DB_PORT=5436`, frontend Vitest, ESLint, and `npm run build`.

- [ ] **Step 2: Review intended diff**

Confirm `git diff --check` passes and unrelated untracked files are not staged.

- [ ] **Step 3: Commit implementation**

Stage only the backend synthetic seed files, frontend adaptive route files/test, and two implementation plan files. Commit with `fix: preserve real curriculum during synthetic seed`.

- [ ] **Step 4: Push main**

Run `git push origin main` and confirm the remote commit matches local `HEAD`.

### Task 3: Deploy and verify Railway

**Files:**
- Runtime configuration only; no additional source files.

**Interfaces:**
- `aurora-go` starts with `ENABLE_SYNTHETIC_DATA=true`.
- `aurora-learning-path` remains private and healthy.

- [ ] **Step 1: Verify Railway variables**

Confirm `ENABLE_SYNTHETIC_DATA=true`, `LEARNING_PATH_URL` targets the private Python service, and CORS allows the Vercel production domain without printing secrets.

- [ ] **Step 2: Wait for GitHub deployments**

Poll both service deployments until they reference the pushed commit and reach `SUCCESS`.

- [ ] **Step 3: Verify startup and integrations**

Check Go logs for `synthetic data ready`, verify public `/api/health`, authenticate a synthetic account, and confirm learning-path requests return HTTP 200.

### Task 4: Deploy and verify Vercel

**Files:**
- Runtime configuration only; no additional source files.

**Interfaces:**
- Production frontend uses `NEXT_PUBLIC_API_URL=https://aurora-go-production.up.railway.app/api`.

- [ ] **Step 1: Set or verify the production API URL**

Use Vercel environment commands without exposing token values.

- [ ] **Step 2: Deploy production frontend**

Run `vercel --prod --yes` from `frontend/` after the main push.

- [ ] **Step 3: Smoke test production**

Verify the production URL returns HTTP 200, login reaches Railway, and no adaptive-downgrade request uses the obsolete `/subjects/nodes/` path.
