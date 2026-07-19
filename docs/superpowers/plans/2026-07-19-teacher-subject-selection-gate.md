# Teacher Subject Selection Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Always show the subject picker when a teacher enters Teacher Hub and require an explicit subject click before any teacher workspace is shown.

**Architecture:** Keep subject resolution in a small pure helper so initial-entry and explicit-selection behavior can be tested without mounting the large Teacher Dashboard. Update the dashboard to ignore persisted subject selection on entry, gate every workspace while no subject is selected, and retain explicit selection after the teacher clicks a subject card.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Testing Library, Playwright production smoke testing.

## Global Constraints

- A teacher must explicitly select a subject after entering Teacher Hub.
- The subject picker must be shown even when the previously saved tab is `student-mgmt`, `exam-builder`, or `exam-scoring`.
- A saved subject from an earlier Teacher Hub session must not bypass the picker.
- Creating or renaming a subject may explicitly select the resulting subject.
- Existing class, student, graph, question-bank, exam, and monitoring behavior must remain unchanged after selection.

---

### Task 1: Subject Selection Resolution

**Files:**
- Create: `frontend/src/app/teacher/teacher-subject-selection.ts`
- Test: `frontend/src/app/teacher/teacher-subject-selection.test.ts`

**Interfaces:**
- Consumes: the subject names returned by `GET /subjects` and an optional explicitly requested subject name.
- Produces: `resolveTeacherSubject(subjects: string[], explicitlyRequestedSubject?: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { resolveTeacherSubject } from "./teacher-subject-selection";

describe("resolveTeacherSubject", () => {
  it("requires an explicit choice when subjects are loaded", () => {
    expect(resolveTeacherSubject(["Toán", "Ngữ văn"])).toBe("");
  });

  it("keeps an explicit subject choice that exists", () => {
    expect(resolveTeacherSubject(["Toán", "Ngữ văn"], "Ngữ văn")).toBe("Ngữ văn");
  });

  it("rejects an explicit subject choice that no longer exists", () => {
    expect(resolveTeacherSubject(["Toán"], "Ngữ văn")).toBe("");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/app/teacher/teacher-subject-selection.test.ts`

Expected: FAIL because `./teacher-subject-selection` does not exist.

- [ ] **Step 3: Add the minimal helper**

```ts
export function resolveTeacherSubject(
  subjects: string[],
  explicitlyRequestedSubject?: string,
): string {
  if (explicitlyRequestedSubject && subjects.includes(explicitlyRequestedSubject)) {
    return explicitlyRequestedSubject;
  }
  return "";
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- --run src/app/teacher/teacher-subject-selection.test.ts`

Expected: all three tests PASS.

### Task 2: Gate Teacher Hub Behind the Picker

**Files:**
- Modify: `frontend/src/app/teacher/page.tsx:293`
- Modify: `frontend/src/app/teacher/page.tsx:681`
- Modify: `frontend/src/app/teacher/page.tsx:705`
- Modify: `frontend/src/app/teacher/page.tsx:1947`
- Modify: `frontend/src/app/teacher/page.tsx:2030`

**Interfaces:**
- Consumes: `resolveTeacherSubject` from Task 1.
- Produces: initial Teacher Hub state with `selectedSubject === ""` until a subject card is clicked.

- [ ] **Step 1: Add a source-level regression test for the dashboard gate**

Extend `frontend/src/app/teacher/teacher-subject-selection.test.ts` to read `page.tsx` and assert that the main workspace condition begins with `!selectedSubject`, without exclusions for `student-mgmt`, `exam-builder`, or `exam-scoring`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/app/teacher/teacher-subject-selection.test.ts`

Expected: FAIL because the current condition explicitly excludes three tabs.

- [ ] **Step 3: Update dashboard initialization and persistence**

Remove restoration of `aurora_teacher_subject` during page initialization. When `selectedSubject` is empty, remove the storage key instead of writing an empty string. Keep writing the selected subject after an explicit card click.

- [ ] **Step 4: Update subject loading**

After `GET /subjects`, call `resolveTeacherSubject(finalSubjects, selectSubjectName)`. Do not use a saved subject or the first returned subject. Preserve the guided-tour demo subject only when the tour explicitly requires it.

- [ ] **Step 5: Make the selection gate unconditional**

Change the main panel condition from:

```tsx
!selectedSubject && activeTab !== "student-mgmt" && activeTab !== "exam-builder" && activeTab !== "exam-scoring"
```

to:

```tsx
!selectedSubject
```

Render the sidebar empty-state as a button that sets `selectedSubject` to `""`, switches to `graph-designer`, and clears the inspected student, so the picker is always reachable.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- --run src/app/teacher/teacher-subject-selection.test.ts`

Expected: all tests PASS.

### Task 3: Full Verification and Production Validation

**Files:**
- Verify: `frontend/src/app/teacher/page.tsx`
- Verify: `frontend/src/app/teacher/teacher-subject-selection.ts`
- Verify: `frontend/src/app/teacher/teacher-subject-selection.test.ts`

**Interfaces:**
- Consumes: the completed picker gate.
- Produces: a deployable frontend verified locally and on Vercel.

- [ ] **Step 1: Run the complete frontend test suite**

Run: `npm test -- --run`

Expected: all tests PASS.

- [ ] **Step 2: Run the production frontend build**

Run: `npm run build`

Expected: Next.js build exits with code 0.

- [ ] **Step 3: Deploy the updated frontend**

Push the verified commit to the configured `main` remote and wait for the Vercel production deployment to become READY.

- [ ] **Step 4: Verify production with Playwright**

Log in at `https://aurora-nova-assistant.vercel.app/login` using the synthetic teacher. Confirm the subject picker appears before class management, click `Số và Đại số`, confirm subject-specific navigation appears, and confirm the selected workspace loads without browser console errors caused by this change.

- [ ] **Step 5: Confirm clean task scope**

Run: `git status --short`

Expected: only pre-existing unrelated untracked files remain.
