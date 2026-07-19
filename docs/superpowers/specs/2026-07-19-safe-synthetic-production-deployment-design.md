# Safe Synthetic Production Deployment Design

## Goal

Deploy the current local Aurora frontend and backend to Vercel and Railway while keeping `ENABLE_SYNTHETIC_DATA=true` for every Go backend startup without deleting real curriculum or user data.

## Current State

- Vercel project `aurora-assistant` serves `https://aurora-nova-assistant.vercel.app`.
- Railway project `aurora-assistant` contains PostgreSQL, `aurora-learning-path`, and `aurora-go`.
- The Go service already has `ENABLE_SYNTHETIC_DATA=true` and allows the production Vercel origin through CORS.
- The current reset logic deletes nodes by broad subject names, including the configured production subject `Số và Đại số` and legacy aliases. This can delete real curriculum records during every Go restart.
- Synthetic curriculum nodes already use deterministic UUIDs derived from synthetic stable keys, which provide a safe ownership boundary.

## Synthetic Ownership Boundary

Synthetic cleanup must use deterministic synthetic identifiers instead of subject names.

The synthetic node set consists of:

- The deterministic root UUID generated from `stableSyntheticUUID("curriculum", "root")`.
- The deterministic UUID for every topic in the resolved synthetic curriculum closure, generated from `stableSyntheticUUID("curriculum", topic.StableKey)`.

Cleanup may delete records that directly reference these node IDs, including synthetic questions, mastery rows, mastery history, and edges whose source or target belongs to the synthetic node set. Synthetic users continue to be identified by the existing `synthetic.%@aurora.local` email pattern. Exams, submissions, classrooms, sessions, activities, learning paths, topics, and other user-owned records are deleted only when they belong to those synthetic users.

Cleanup must not delete records solely because their subject is `Số và Đại số`, `Toán đại số`, or another configured subject name.

## Backend Changes

Add a helper in the synthetic curriculum package that returns the complete deterministic synthetic node ID set. Reuse the same catalog and closure resolution used by curriculum creation so cleanup and creation cannot drift.

Update `resetSyntheticData` to load only nodes whose IDs belong to that set. Delete dependent records using those IDs, then delete the nodes themselves. Edge cleanup must be restricted to edges whose source or target ID is synthetic instead of deleting every edge for a subject.

The startup interface remains unchanged:

```text
ENABLE_SYNTHETIC_DATA=true
```

When enabled, each Go startup resets and recreates the owned synthetic dataset and recalculates mastery for synthetic students. A seed failure remains fatal so Railway does not serve a partially initialized backend.

## Regression Protection

Extend the PostgreSQL-backed synthetic seed tests with real records that intentionally share the production subject name. The test creates a real node, question, edge, mastery row, and mastery history row, runs `ResetAndSeed` twice, and verifies:

- The real records still exist and retain their IDs.
- The synthetic records are recreated without duplicates.
- Synthetic user and curriculum counts remain deterministic.

Existing startup flag tests continue proving that `false` skips seeding and enabled values invoke the seeder.

## Deployment Flow

1. Run focused synthetic seed tests against the local test PostgreSQL instance.
2. Run the complete Go test suite when the test PostgreSQL instance is available; otherwise record the environment-specific gap and require the focused regression test to pass.
3. Run frontend tests, lint, and production build for the adaptive-downgrade route change already present locally.
4. Commit only the intended backend, frontend, test, and deployment documentation changes; preserve unrelated artifacts.
5. Push `main` so GitHub-connected Railway services receive the same source revision.
6. Wait for `aurora-learning-path` and `aurora-go` to become healthy. Confirm the Go startup log reports `synthetic data ready` and does not report seed failure.
7. Set or verify Vercel production `NEXT_PUBLIC_API_URL=https://aurora-go-production.up.railway.app/api`.
8. Deploy the frontend project to Vercel production from the same revision.

## Verification

- Railway deployment metadata references the pushed `main` commit and the correct Dockerfiles.
- `GET https://aurora-go-production.up.railway.app/api/health` returns HTTP 200.
- Railway learning-path reaches healthy status and Go-to-Python mastery requests return HTTP 200.
- Synthetic teacher and student authentication succeeds using the configured demo accounts without exposing passwords in logs.
- A database-backed API response contains the seeded synthetic curriculum while pre-existing real curriculum records remain present.
- `https://aurora-nova-assistant.vercel.app` returns HTTP 200 and uses the Railway production API URL.
- The adaptive downgrade frontend call uses `/api/nodes/:nodeId/adaptive-downgrade`.

## Rollback

If synthetic startup fails or verification finds real-data impact, set `ENABLE_SYNTHETIC_DATA=false` before redeploying the last known-good Go image. Do not delete or recreate the Railway PostgreSQL service or learning-path volume.

## Out Of Scope

- Replacing synthetic data with a separate database.
- Changing synthetic account credentials.
- Reworking unrelated curriculum or frontend behavior.
- Deleting the older unused Railway project.
