# Align Adaptive Downgrade API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every frontend adaptive-downgrade request use the route currently registered by the Go backend on `main`.

**Architecture:** Keep the backend contract unchanged at `POST /api/nodes/:nodeId/adaptive-downgrade`. Update the shared Tutor Hub API wrapper and the legacy page call site, then protect the shared wrapper with a focused Vitest test.

**Tech Stack:** TypeScript, Next.js, Vitest

## Global Constraints

- Do not change the Go backend route.
- Do not modify unrelated working-tree files.
- Verify the old `/subjects/nodes/:nodeId/adaptive-downgrade` path no longer appears in active frontend source.

---

### Task 1: Align the frontend adaptive-downgrade route

**Files:**
- Create: `frontend/src/app/tutor/hub/api.test.ts`
- Modify: `frontend/src/app/tutor/hub/api.ts`
- Modify: `frontend/src/app/tutor/page_old.tsx`

**Interfaces:**
- Consumes: `apiFetch(endpoint, options)` from `frontend/src/lib/api.ts`.
- Produces: `submitAdaptiveDowngrade(nodeId)` calling `POST /nodes/${nodeId}/adaptive-downgrade`.

- [ ] **Step 1: Write the failing test**

Mock `apiFetch`, call `submitAdaptiveDowngrade("node-123")`, and assert it receives `/nodes/node-123/adaptive-downgrade` with `{ method: "POST" }`.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run src/app/tutor/hub/api.test.ts`

Expected: FAIL because the current wrapper calls `/subjects/nodes/node-123/adaptive-downgrade`.

- [ ] **Step 3: Update both frontend call sites**

Replace `/subjects/nodes/${nodeId}/adaptive-downgrade` with `/nodes/${nodeId}/adaptive-downgrade` in the shared Tutor Hub API and legacy tutor page.

- [ ] **Step 4: Run verification**

Run the focused test, frontend lint, and a repository search for the obsolete path.

Expected: the test and lint pass, and the obsolete path has zero matches.
