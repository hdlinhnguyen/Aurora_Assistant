# Default Focused Knowledge Tree Design

## Goal

Every knowledge tree opens in "Sơ đồ tập trung" mode by default while keeping "Sơ đồ tổng thể" available as an explicit alternative.

## Scope

- Apply to every `KnowledgeTree` mode: `teacher`, `student`, and `view-only`.
- Keep the mode selector inside `KnowledgeTree` so callers do not need API changes.
- Do not persist the selected mode across page reloads or subjects.

## Default Focus Target

Focused mode needs an anchor node. Select the first valid node using this priority:

1. Controlled `focusedNodeId` supplied by the parent.
2. `currentNodeId`.
3. `initialNodeId`.
4. A node marked `isRoot`.
5. The first available node.

Ignore an identifier that is not present in the current node list and continue to the next fallback.

## Behavior

- Initialize the tree in focused mode.
- Reinitialize focused mode and its fallback anchor when the subject changes.
- Show the "Sơ đồ tổng thể" / "Sơ đồ tập trung" selector whenever the tree has at least one node, including `view-only` mode.
- Selecting "Sơ đồ tổng thể" displays and fits the full graph without discarding the anchor node.
- Selecting "Sơ đồ tập trung" restores the focused graph around the current anchor.
- Clicking or externally focusing another node updates the focused anchor using the existing selection callbacks.
- In `teacher` and `student` modes, retain the existing focused ancestor/descendant layout.
- In `view-only` mode, retain the existing immediate-neighbor focus and mastered-chain behavior.
- Empty trees render normally without a mode selector or an invalid focus state.

## Implementation Boundary

Add a small deterministic helper for choosing the default focus node, then use it to initialize/reset `KnowledgeTree` state. Avoid changing backend data, node positions, persistence, or caller contracts.

## Testing

Add focused unit/component coverage that verifies:

- The anchor priority order and invalid-ID fallback.
- "Sơ đồ tập trung" is active on initial render in all three modes.
- The selector is visible in `view-only` mode.
- Switching to "Sơ đồ tổng thể" and back changes the active mode.
- Changing subject resets the tree to focused mode with the new subject's anchor.
- An empty node list does not expose the selector.

Run the targeted Vitest test, then the relevant frontend test suite and lint/type checks available in the repository.
