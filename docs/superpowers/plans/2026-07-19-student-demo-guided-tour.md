# Student Demo Guided Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start a student-only guided tour through a temporary demo login and automatically end that demo session on completion or confirmed early exit.

**Architecture:** The landing page owns demo login and initial tour markers. `GuidedTour` owns the demo-session lifecycle through separate completion and early-exit handlers backed by one cleanup function, while ordinary authenticated tours retain their existing session.

**Tech Stack:** Next.js App Router, React/TypeScript, browser localStorage, Python pytest, Playwright

## Global Constraints

- Reuse `student@aurora.edu.vn` with password `demo123`.
- Start directly in student mode at the first real student step.
- Only sessions marked by `aurora_tour_demo_session=true` may auto-logout.
- Early exit requires confirmation; completion does not.
- Login failure stays on landing and displays an actionable error.

---

### Task 1: Guard the Demo Tour Lifecycle

**Files:**
- Create: `tests/test_student_demo_tour.py`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/components/GuidedTour.tsx`

**Interfaces:**
- Consumes: `/auth/login`, `aurora_token`, `aurora_user`, and existing GuidedTour local-storage keys.
- Produces: `aurora_tour_demo_session`, direct student tour launch, confirmed early-exit cleanup, and automatic completion cleanup.

- [ ] **Step 1: Write focused failing source tests**

Create `tests/test_student_demo_tour.py` with assertions that the landing handler stores student mode, demo marker, and step `1`; that login failure is surfaced; and that `GuidedTour` defines separate `completeTour`, `requestExitTour`, and demo cleanup behavior including `window.confirm` and `router.replace("/")`.

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m pytest tests/test_student_demo_tour.py -v`

Expected: FAIL because the current flow starts at step `0`, has no demo marker or visible login error, and reloads without logging out.

- [ ] **Step 3: Implement landing demo launch**

Add loading/error state to the landing page. On successful login, store auth plus:

```typescript
localStorage.setItem("aurora_tour_demo_session", "true");
localStorage.setItem("aurora_tour_active", "true");
localStorage.setItem("aurora_tour_mode", "student");
localStorage.setItem("aurora_tour_step", "1");
router.push("/tutor");
```

Throw on non-OK responses and render a concise error below the CTA row.

- [ ] **Step 4: Implement GuidedTour lifecycle separation**

Add a shared function that removes demo auth and tour keys and calls
`router.replace("/")`. `completeTour` cleans up demo sessions without warning;
`requestExitTour` uses `window.confirm` for demo sessions and leaves the tour
active when cancelled. Wire `Escape`, overlay click, and the close button to
`requestExitTour`; wire the final Next action to `completeTour`.

- [ ] **Step 5: Run focused tests and lint**

Run: `python -m pytest tests/test_student_demo_tour.py -v`

Expected: PASS.

Run from `frontend`: `npm run lint -- --quiet`

Expected: exit code 0.

- [ ] **Step 6: Verify locally and commit**

Use Playwright against `http://localhost:3000`: click the landing tour button,
confirm the URL becomes `/tutor`, tour mode is student, early-exit cancel keeps
the tour open, confirmed exit returns to `/` with auth cleared, and a regular
tour without the marker preserves auth.

Commit:

```powershell
git add frontend/src/app/page.tsx frontend/src/app/components/GuidedTour.tsx tests/test_student_demo_tour.py
git commit -m "feat: add temporary student demo tour session"
```
