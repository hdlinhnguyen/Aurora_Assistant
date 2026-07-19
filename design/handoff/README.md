# Handoff: Knowledge Tree — Auto-Collapse + "Điểm cần chú ý" Focus View

## Overview
When a teacher clicks a student in "Báo cáo tiến độ học sinh", they see that student's full knowledge tree (`KnowledgeTree.tsx`, in `mode="view-only"`, via `StudentMasteryProfile.tsx`). For subjects with many topics, the tree shows every node at once — mastered, current, and locked — and becomes hard to scan. This design adds two complementary decluttering mechanisms:

1. **Auto-collapse of mastered chains**: consecutive already-mastered topics are collapsed into a single "summary" node by default (expandable on click), instead of requiring the teacher to manually collapse nodes one at a time.
2. **"Điểm cần chú ý" (Needs attention) sidebar**: a short ranked list of the student's struggling/in-progress topics, next to the tree. Clicking an entry pans + zooms the tree to that exact node and dims everything unrelated to it.

## About the Design Files
The bundled file (`knowledge_tree_focus_view_redesign.dc.html`) is a **design reference / interaction prototype** — a self-contained HTML/React file with hardcoded sample tree data standing in for a real student's knowledge graph. It is not production code to copy in. The task is to **port this interaction design into the existing `KnowledgeTree.tsx` component** (and its wrapper `StudentMasteryProfile.tsx`) in `Aurora_Assistant/frontend`, reusing that component's existing engine (pan/zoom, `collapsedNodes` state, node/edge data model, Tailwind styling, `lucide-react` icons) rather than replacing it with the prototype's simplified plain-div/SVG rendering.

## Fidelity
**High-fidelity for the interaction model and visual language** (colors, node anatomy, sidebar layout, animation/timing) — but the prototype's tree renderer is deliberately simplified (plain absolutely-positioned divs + one SVG overlay for edges, fixed sample data, no drag/reposition/linking/undo-redo). The **real implementation must sit on top of the existing `KnowledgeTree.tsx` engine** (SVG + foreignObject nodes, `NodeItem`/`EdgeItem` props, existing status color classes, existing pan/zoom/mastery-ring rendering) — treat this handoff as the spec for the two new behaviors, not a replacement renderer.

## Screens / Views

Single screen: **Student Knowledge Tree (teacher, view-only mode)** — entered by clicking a student row/card in the progress report.

**Layout:**
- Page header: breadcrumb link back to the progress report, page title `"Sơ đồ năng lực — {studentName}"`, subtitle `"{Subject} · {Grade}"`.
- Below: a two-column row, `gap: 16px`, `align-items: flex-start`.
  - **Left — Tree canvas panel**: `flex: 1; min-width: 0`, white card, `1px solid #e6e9f0`, `border-radius: 24px`, `box-shadow: 0 1px 2px rgba(20,20,40,.04)`, fixed `height: 620px`, `overflow: hidden`, `position: relative`.
  - **Right — Sidebar**: fixed `width: 320px; flex-shrink: 0`, flex column, `gap: 12px`.

## Components

### Tree canvas panel
- **"Xem toàn cảnh" (View full picture) button** — absolute `top:16px; left:16px`, dark pill (`background:#1c1e29; color:#fff; padding:9px 16px; border-radius:12px; font:700 12px Inter`), resets focus and re-fits the whole visible tree in view.
- **"▲ Thu gọn N chủ đề nền tảng" (Collapse) button** — absolute `top:16px; right:16px`, white pill with `1px solid #e6e9f0` border, **only rendered when the mastered-chain summary node is currently expanded**. Re-collapses it.
- **Viewport** — an inner `position:absolute; inset:0; overflow:hidden` div (this is the element whose real rendered size drives the fit/zoom math — see State Management).
- **World/content layer** — a `1200×1000`px absolutely-positioned div inside the viewport, given `transform: translate({tx}px, {ty}px) scale({scale})`, `transform-origin: 0 0`, and `transition: transform .5s cubic-bezier(.4,0,.2,1)` so pan/zoom changes animate smoothly. All nodes and the edge-SVG are children of this layer, positioned with plain `left/top` in this 1200×1000 coordinate space.
- **Edges** — one `<svg>` (`1200×1000`, `position:absolute`, `pointer-events:none`) drawn UNDER the nodes, with a `<line>` per edge from the bottom-center of the parent node to the top-center of the child node. `stroke:#cbd5e1`; width `3px` and `opacity:.9` when both endpoints are in the current highlight set (see Focus behavior below), else width `2px` and `opacity:.15–.9` depending on focus state; edges into a locked node use `stroke-dasharray:5,5`.
- **Legend** — bottom-left floating pill (`rgba(255,255,255,.9)`, blurred backdrop, `border:1px solid #e6e9f0; border-radius:14px; padding:9px 16px`), 4 entries with an 8px colored dot + label: "Đã xong" (emerald `#10b981`), "Đang học" (orange `#f97316`), "Cần lưu ý" (rose `#e11d48`), "Đang khóa" (slate `#94a3b8`).

### Node card anatomy (each node, ~220×78px; root 200×70px; the summary node 260×118px; locked nodes 200×68px)
- `border-radius: 20px`, `2px solid {statusBorderColor}` (summary node: no border, dashed decorative layers instead — see below), background = a 135° gradient light→white→light tint of the status color, `padding: 12px 14px`, `box-shadow: 0 8px 20px -14px rgba(20,20,40,.35)` (locked nodes: no shadow).
- **Header row** (`display:flex; justify-content:space-between`): left = 8px status dot + uppercase status badge (`font:800 9px Inter; letter-spacing:.05em`, `white-space:nowrap`, must NOT truncate — keep `flex-shrink:0` on the badge, this was a bug caught and fixed during prototyping); right = optional small accuracy/average pill (white bg, border colored to match status) — only the summary node shows one, `"TB {avgAccuracy}%"`.
- **Name** — `font:700 12px/1.3 Inter`, status text color.
- **Metric line** (optional, struggle/learning nodes and the summary node) — `font:600 10px/1.2 Inter`, 75% opacity of the status text color. E.g. `"34% đúng · sai 4 câu liên tiếp"`, or for the summary node: `"Bấm để xem lại chi tiết"`.
- **Status → color mapping** (border / gradient tint / text / dot / badge text):
  - Mastered (and root, which reuses mastered styling but badge text `"ĐIỂM GỐC"` instead of `"ĐÃ XONG"`): border `#34d399`, bg `linear-gradient(135deg,#ecfdf5,#ffffff 55%,#d1fae5)`, text `#065f46`, dot `#10b981`.
  - Struggle: border `#fb7185`, bg `linear-gradient(135deg,#fff1f2,#ffffff 55%,#ffe4e6)`, text `#9f1239`, dot `#e11d48`, badge `"CẦN LƯU Ý"`. Also gets a continuous **glow-pulse animation**: `@keyframes struggleGlow { 0%,100% { box-shadow:0 0 0 0 rgba(225,29,72,.30) } 50% { box-shadow:0 0 0 7px rgba(225,29,72,0) } }`, applied as `animation: struggleGlow 2s infinite`.
  - Learning: border `#fb923c`, bg `linear-gradient(135deg,#fff7ed,#ffffff 55%,#ffedd5)`, text `#9a3412`, dot `#f97316`, badge `"ĐANG HỌC"`.
  - Locked: border `#cbd5e1`, bg `#f8fafc` (flat, no gradient), text `#94a3b8`, dot `#94a3b8`, badge `"ĐANG KHÓA"`, `cursor:default` (not clickable), no drop shadow.

### The mastered-chain summary node (the core of decluttering mechanism #1)
- Replaces a run of consecutive mastered nodes (a linear chain with no branching) with **one node**: badge `"TÓM TẮT"`, name `"N chủ đề đã hoàn thành"`, an average-accuracy pill (`"TB {avg}%"`), metric line `"Bấm để xem lại chi tiết"`.
- Visually reads as a **stack of cards**: two extra decorative `2px dashed #d7dce6` rounded-rect layers behind the main card, offset `translate(4px,4px)`/`translate(8px,8px)` with slight rotation (`0.7deg`/`1.4deg`) — a "deck" affordance signaling "more is folded in here".
- **Click → expands**: the summary node is replaced by the individual mastered nodes laid out as a vertical chain (each connecting to the next), and the "▲ Thu gọn" button appears top-right of the canvas. Clicking that button (or, in the real implementation, clicking the top of the expanded chain again) re-collapses back to the summary node.
- **This is a relayout, not a reveal/hide**: node **positions differ** between the collapsed and expanded states (collapsing removes the vertical space the chain occupied), and the view **automatically re-fits** (re-centers/re-scales) after every expand/collapse so the visible content is always framed nicely — never left oddly cropped or floating in a mostly-empty viewport.
- **Collapsing criterion to implement against the real data model**: a "mastered chain" is a maximal run of nodes that are (a) all `status === "mastered"`, and (b) each has exactly one parent and one child within the run (i.e., a simple linear sub-path, not a branching cluster) — branch points and the frontier (first non-mastered node) always stay visible as their own nodes. This mirrors what the prototype's hardcoded `m1→m2→m3→m4→m5` chain represents.

### Sidebar — "Điểm cần chú ý" (the core of decluttering mechanism #2)
- Card: white, `1px solid #e6e9f0`, `border-radius:22px`, `padding:18px`.
- Header: `"Điểm cần chú ý"` (`font:800 15px Poppins`) + subtitle `"Ưu tiên xem trước — bấm để phóng vào cây"` (`font:600 11px Inter; color:#9aa1ae`).
- Rows (one per struggle/learning node, struggle nodes listed before learning nodes): `display:flex; align-items:center; gap:10px; padding:12px; border-radius:16px; cursor:pointer`; a colored status dot; name (`font:800 12px Inter`, truncates with ellipsis if needed) + metric line below it (`font:600 10px Inter; color:#9aa1ae`); a `›` chevron at the far right (`color:#c7cbd4`).
- **Active row** (the node currently focused on the canvas): `background:#eef0ff; border:1px solid #c7d2fe` (vs. default `background:#fafbfd; border:1px solid #f1f2f6`).
- Below the list card, a small static hint card (`background:#f4f5f8; border-radius:18px; padding:14px 16px; font:600 11px Inter; color:#6b7280`) explaining the mastered-chain collapse, so both mechanisms are discoverable together: *"5 chủ đề nền tảng học sinh đã thành thạo được gộp gọn trên cây. Bấm vào ô "5 chủ đề đã hoàn thành" để xem lại chi tiết."*

## Interactions & Behavior

- **Click a sidebar row** → sets that node as "focused". The tree:
  1. Computes the node's direct neighbor set (its parent(s) + child(ren) in the currently-visible edge graph, plus itself).
  2. Re-fits the pan/zoom transform to frame just that neighbor set (tighter padding, up to `1.15×` scale — noticeably more zoomed-in than the full-tree fit).
  3. Dims every node/edge NOT in the neighbor set to `opacity: .3` (edges: `opacity:.15`); the focused cluster stays at full opacity.
  4. Highlights the corresponding sidebar row (see Active row style above).
- **Click "Xem toàn cảnh"** → clears focus, re-fits the transform to frame the entire currently-visible tree (all nodes at their current, possibly-collapsed, positions), un-dims everything.
- **Click the summary node** → expands it (see above); focus is cleared and the view re-fits to the newly-expanded layout.
- **Click "▲ Thu gọn …"** → re-collapses the mastered chain back into the summary node; focus is cleared and the view re-fits.
- **Clicking a non-locked node directly on the canvas** also sets it as focused (same effect as clicking its sidebar entry, if it has one) — consistent interaction whether the teacher starts from the sidebar or the tree itself.
- **Locked nodes are not clickable** (`cursor:default`), consistent with the existing `KnowledgeTree.tsx` locked-node behavior.
- **All position/opacity/transform changes animate**: node position changes use `transition: left .5s ease, top .5s ease, opacity .4s ease`; the world-layer transform uses `transition: transform .5s cubic-bezier(.4,0,.2,1)`.
- No loading/error states in scope — this sits inside the existing `StudentMasteryProfile.tsx` data-loading flow (mastery/profile fetch already handled there).

## State Management

Local component state needed:
- `expandedGroups: Set<string>` (or simply a boolean per collapsible mastered-chain group, generalized from the prototype's single `expanded` boolean) — which mastered-chain summary nodes are currently expanded. Default: all collapsed.
- `focusedNodeId: string | null` — the node currently focused via sidebar-click or canvas-click. Default `null`.
- `canvasSize: { w: number, h: number }` — **the ACTUAL measured pixel size of the canvas viewport element**, read via a ref + `ResizeObserver` (see Root cause note below), NOT a hardcoded constant. Re-measure on mount and on every resize.

**Important implementation pitfall already hit and fixed in this prototype**: the very first version of this design hardcoded the viewport width/height (`900×620`) for the pan/zoom "fit" math, while the actual canvas panel is a flexible `flex:1` element. On any viewport where the rendered panel width differs from the hardcoded constant, the fit/centering math silently targets the wrong bounds — nodes intended to be centered end up clipped or off to one side, and (worse) if the panel is instead given a matching hardcoded width, the surrounding layout can overflow the viewport and push the sidebar off-screen entirely. **The fix**: attach a ref to the canvas viewport div, measure `clientWidth`/`clientHeight` via `ResizeObserver` (with a `window.resize` fallback) in `componentDidMount`/`useEffect`, store it in state, and feed those live measurements into the fit/zoom calculation — never assume a fixed pixel size for a flexibly-sized container.

**Derived (computed each render, not stored)**:
- `visibleNodes`: which nodes are shown depends on which chains are currently collapsed vs. expanded, with each node's position pulled from the corresponding (collapsed or expanded) layout coordinate set.
- `visibleEdges`: edges recomputed to route through the summary node when its chain is collapsed (`parent → summary → frontier-children`) vs. the real chain edges when expanded.
- `highlightSet`: `{focusedNodeId} ∪ neighbors(focusedNodeId)` when a node is focused, else empty.
- `transform {scale, tx, ty}`: computed by a `fit(boxes, padding, maxScale)` helper — given a set of node bounding boxes, the current measured canvas size, and a padding/max-scale, returns the scale + translate that centers those boxes in the viewport. Called with **all visible nodes** (padding 70, maxScale 1) when nothing is focused, or with **just the highlight set** (padding 110, maxScale 1.15) when a node is focused.
- `attentionList`: struggle nodes first, then learning nodes, each with its metric line — this should be sourced from the same `studentNodeStatus`/`nodeAccuracy` data `KnowledgeTree.tsx` already receives, not new data.

## Design Tokens

**Colors** (map to existing Tailwind usage in the codebase — the existing `KnowledgeTree.tsx` already uses `emerald`/`rose`/`orange`/`blue`/`slate` for these exact statuses, e.g. `border-emerald-400/80`, `border-rose-400/80`, `border-orange-400/80`; prefer those utility classes over new hex literals where the values line up):
| Status | Border | Text | Dot |
|---|---|---|---|
| Mastered / root | `#34d399` (≈ `emerald-400`) | `#065f46` (≈ `emerald-900`) | `#10b981` (≈ `emerald-500`) |
| Struggle | `#fb7185` (≈ `rose-400`) | `#9f1239` (≈ `rose-900`) | `#e11d48` (≈ `rose-600`) |
| Learning | `#fb923c` (≈ `orange-400`) | `#9a3412` (≈ `orange-900`) | `#f97316` (≈ `orange-500`) |
| Locked | `#cbd5e1` (≈ `slate-300`) | `#94a3b8` (≈ `slate-400`) | `#94a3b8` |

Neutral UI: ink `#1c1e29`, secondary text `#6b7280`/`#9aa1ae`, border `#e6e9f0`/`#f1f2f6`, page bg `#f7f9fc`, card bg `#ffffff`, sidebar active row bg `#eef0ff`/border `#c7d2fe`.

**Typography**: Poppins 700/800 for the page title and sidebar section header; Inter 400–800 for everything else (node labels, badges, metrics, buttons).

**Spacing/radius**: node radius `20px`; card radius `22–24px`; pill/badge radius `999px`/`12–16px`; canvas panel padding via absolute-positioned children at `16px` insets; sidebar row padding `12px`; gaps `8–16px`.

**Node sizes**: standard `220×78`, root `200×70`, mastered-chain member (when expanded) `220×74`, summary `260×118`, locked `200×68`.

**Animation**: `struggleGlow` keyframe (see above) at `2s infinite`; all layout/opacity transitions `.4–.5s`, transform transition `.5s cubic-bezier(.4,0,.2,1)`.

## Assets
None — all indicators are CSS (colored dots, gradients, dashed borders), no icons or images. The real implementation should keep using `KnowledgeTree.tsx`'s existing `lucide-react` icons (`CheckCircle2`, `AlertCircle`, `PlayCircle`, `Lock`, `Compass`) for status glyphs instead of plain dots, to stay consistent with the rest of that component.

## Files
- `knowledge_tree_focus_view_redesign.dc.html` — the full interaction prototype (self-contained, hardcoded sample data for one student: "Trịnh Nhật Nam", subject Toán). Read alongside the spec above; do not copy its rendering code directly.
- Existing codebase files this design extends (not part of this bundle):
  - `Aurora_Assistant/frontend/src/app/components/KnowledgeTree.tsx` — the tree engine to extend with (a) auto-collapse-on-load for mastered chains (building on its existing `collapsedNodes` state and collapse-hiding logic, `isNodeHidden`), and (b) a focus/fit helper reusable by the new sidebar.
  - `Aurora_Assistant/frontend/src/app/teacher/components/StudentMasteryProfile.tsx` — the wrapper that renders `KnowledgeTree` in `mode="view-only"` for a selected student; the new "Điểm cần chú ý" sidebar should likely live here (or as a new sibling component), replacing/augmenting the existing right-hand `sideView` mastery/activity panel, and it needs a callback into `KnowledgeTree` to trigger the pan/zoom focus (e.g. extending the existing `onFocusedNodeChange`/`focusedNodeId` props `KnowledgeTree` already accepts).
  - `Aurora_Assistant/frontend/src/app/teacher/page.tsx` — owns `studentNodeStatus`, `nodeAccuracy`, and the node/edge graph data already passed down; the struggle/learning node list for the sidebar should be derived from this existing data, not fetched separately.
