# Teacher Demo Tour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Walk a teacher demo account through all nine teacher dashboard tabs with automatic tab switching and spotlighted workspaces.

**Architecture:** Extend the shared `GuidedTour` step catalog with teacher-only steps and map each step to the existing `ActiveTab` event. Add one dynamic `teacher-tab-*` target wrapper around the teacher workspace ternary so every tab gets a stable bounding box without changing child components.

**Tech Stack:** Next.js/React, TypeScript, localStorage, browser Playwright, pytest source checks

## Global Constraints

- Preserve the student sequence and demo-session cleanup.
- Use existing `aurora-tour-switch-tab` event wiring.
- Do not alter teacher tab business logic.

---

### Task 1: Add the Complete Teacher Showcase

**Files:**
- Modify: `frontend/src/app/components/GuidedTour.tsx`
- Modify: `frontend/src/app/teacher/page.tsx`
- Create: `tests/test_teacher_demo_tour.py`

**Interfaces:**
- Consumes: Existing teacher `ActiveTab` values and workspace render branches.
- Produces: Nine ordered teacher tour steps and `data-tour="teacher-tab-*"` workspace targets.

- [ ] Add source checks for all nine ordered IDs, tab mapping, and the dynamic target wrapper.
- [ ] Replace the old two-step teacher catalog with the nine tab-specific steps.
- [ ] Dispatch `aurora-tour-switch-tab` for the active teacher step and scroll the dynamic workspace target.
- [ ] Set teacher demo startup to `student-mgmt` before the first tour step.
- [ ] Run focused tests, lint, and Playwright walkthrough for all nine targets.
- [ ] Commit with `feat: complete teacher demo guided tour`.
