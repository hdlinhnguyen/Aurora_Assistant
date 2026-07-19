# Landing Header App Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace only the landing page header's lightning brand mark with the official Aurora app icon.

**Architecture:** Keep the existing header layout and gradient container, changing its inner SVG to an image sourced from the existing `/icon.png` asset. Add a focused source-level regression test that distinguishes the header brand icon from the unchanged hero badge.

**Tech Stack:** Next.js App Router, React/TypeScript, Python pytest

## Global Constraints

- Modify only the brand icon in the navigation header of `frontend/src/app/page.tsx`.
- Keep the lightning symbol used by the hero content badge unchanged.
- Reuse `frontend/src/app/icon.png` through the public `/icon.png` route.
- Preserve the existing 36-by-36-pixel rounded header container and hover motion.

---

### Task 1: Replace and Guard the Header Brand Icon

**Files:**
- Modify: `frontend/src/app/page.tsx:43-57`
- Create: `tests/test_landing_header_icon.py`

**Interfaces:**
- Consumes: Existing `/icon.png` Next.js metadata asset and landing page header markup.
- Produces: Header brand image with `src="/icon.png"`, decorative alt text, and the original hero lightning badge untouched.

- [ ] **Step 1: Write the failing source-level regression test**

Create `tests/test_landing_header_icon.py`:

```python
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "frontend" / "src" / "app" / "page.tsx"


def test_landing_header_uses_official_app_icon_and_keeps_hero_lightning() -> None:
    source = PAGE.read_text(encoding="utf-8")
    header = source.split("{/* Hero Section */}", 1)[0]
    hero = source.split("{/* Hero Section */}", 1)[1]

    assert 'src="/icon.png"' in header
    assert "alt=\"\"" in header
    assert '<svg className="h-5 w-5 text-white animate-pulse"' not in header
    assert 'd="M13 10V3L4 14h7v7l9-11h-7z"' in hero
```

- [ ] **Step 2: Run the test and verify the expected failure**

Run: `python -m pytest tests/test_landing_header_icon.py -v`

Expected: FAIL because the header still contains the lightning SVG and no `/icon.png` image.

- [ ] **Step 3: Replace only the header SVG**

In the header brand wrapper, replace the SVG with:

```tsx
<img
  src="/icon.png"
  alt=""
  className="h-7 w-7 rounded-lg object-contain"
  aria-hidden="true"
/>
```

Keep the surrounding `h-9 w-9`, gradient, hover transform, and the later hero badge SVG unchanged.

- [ ] **Step 4: Run the focused test and frontend lint**

Run: `python -m pytest tests/test_landing_header_icon.py -v`

Expected: PASS.

Run from `frontend`: `npm run lint`

Expected: lint completes with exit code 0.

- [ ] **Step 5: Verify the rendered route and commit**

With the existing dev server at `http://localhost:3000`, confirm the route responds:

```powershell
Invoke-WebRequest -Uri http://localhost:3000 -UseBasicParsing
```

Expected: HTTP status `200`; then run:

```powershell
git status --short --branch
git add frontend/src/app/page.tsx tests/test_landing_header_icon.py
git commit -m "feat: use app icon in landing header"
```

Expected: clean working tree after the commit.
