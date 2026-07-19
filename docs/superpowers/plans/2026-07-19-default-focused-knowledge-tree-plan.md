# Default Focused Knowledge Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make every `KnowledgeTree` open in focused-map mode with a deterministic anchor while retaining the overall-map option.

**Architecture:** Keep state local to `frontend/src/app/components/KnowledgeTree.tsx`. Add a pure anchor-selection helper so fallback behavior is deterministic and testable; initialize/reset focused state from that helper and render the selector for all non-empty trees.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library.

## Global Constraints

- Apply to `teacher`, `student`, and `view-only` modes.
- Do not change backend data, node positions, persistence, or caller contracts.
- Preserve existing focused ancestor/descendant behavior for teacher/student and immediate-neighbor behavior for view-only.

---

### Task 1: Add deterministic default-anchor helper

**Files:**
- Modify: `frontend/src/app/components/KnowledgeTree.tsx`
- Test: `frontend/src/app/components/KnowledgeTree.test.tsx`

**Interfaces:**
- Produces `selectDefaultFocusNode(nodes, focusedNodeId?, currentNodeId?, initialNodeId?) => string | null` for component initialization and tests.

- [ ] **Step 1: Write the failing test**

```tsx
describe("selectDefaultFocusNode", () => {
  const nodes = [
    { id: "root", isRoot: true },
    { id: "child", isRoot: false },
  ] as any;

  it("uses valid controlled and fallback identifiers in priority order", () => {
    expect(selectDefaultFocusNode(nodes, "child", "missing", "root")).toBe("child");
    expect(selectDefaultFocusNode(nodes, "missing", "child", "root")).toBe("child");
    expect(selectDefaultFocusNode(nodes, "missing", "missing", "root")).toBe("root");
    expect(selectDefaultFocusNode(nodes, "missing", "missing", "missing")).toBe("root");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/app/components/KnowledgeTree.test.tsx`
Expected: FAIL because `selectDefaultFocusNode` is not exported/defined.

- [ ] **Step 3: Write minimal implementation**

Export the helper and check each candidate exists in `nodes`; fall back to `nodes.find(node => node.isRoot)?.id`, then `nodes[0]?.id`, else `null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/app/components/KnowledgeTree.test.tsx`
Expected: PASS.

### Task 2: Initialize focused mode and expose selector everywhere

**Files:**
- Modify: `frontend/src/app/components/KnowledgeTree.tsx`
- Test: `frontend/src/app/components/KnowledgeTree.test.tsx`

**Interfaces:**
- Consumes `selectDefaultFocusNode`.
- Produces initial focused mode, anchor selection, subject reset behavior, and selector labels for all modes.

- [ ] **Step 1: Write the failing component tests**

Cover: focused button is selected on initial render for `teacher`, `student`, and `view-only`; selector is visible with nodes; overall/focused buttons switch active state; subject changes reset focused mode and select the new subject anchor; empty nodes hide the selector.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/app/components/KnowledgeTree.test.tsx`
Expected: FAIL because focused mode currently defaults false and selector is hidden for view-only/no selection.

- [ ] **Step 3: Write minimal implementation**

Initialize `isFocusedView` to `true`; initialize internal selection from the helper when no controlled focus exists; add an effect keyed by `nodes`, `subject`, and controlled IDs to establish a valid fallback without overriding a current user selection; change selector condition to `localNodes.length > 0`; keep existing button handlers.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/app/components/KnowledgeTree.test.tsx`
Expected: PASS.

### Task 3: Verify the frontend change

**Files:**
- Modify: none

- [ ] **Step 1: Run targeted tests**

Run: `npm test -- --run src/app/components/KnowledgeTree.test.tsx`

- [ ] **Step 2: Run the full frontend test suite**

Run: `npm test -- --run`

- [ ] **Step 3: Run lint/type validation**

Run: `npm run lint`
Expected: no new errors from `KnowledgeTree.tsx` or its tests.

- [ ] **Step 4: Review the diff and status**

Run: `git diff --check; git status --short`
Confirm unrelated pre-existing changes remain untouched.
