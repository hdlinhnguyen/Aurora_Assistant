# Official System Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `docs/icon.png` the official icon for every system icon surface currently supported by the Aurora Next.js frontend.

**Architecture:** Keep the supplied PNG as the canonical source and generate three framework-convention assets beside the App Router root layout. A focused Pillow-based regression test verifies that the PNG derivatives match the source and that the favicon contains the required embedded sizes; the Next.js production build verifies framework discovery and metadata generation.

**Tech Stack:** Next.js 16 App Router, Python 3, Pillow 11, pytest

## Global Constraints

- Keep `docs/icon.png` as the source asset.
- Do not change feature icons or role illustrations inside the UI.
- Do not add a PWA manifest, service worker, desktop packaging, or tray integration.
- Do not alter unrelated user changes in the working tree.

---

### Task 1: Generate and Verify Official Icon Assets

**Files:**
- Add: `docs/icon.png`
- Modify: `frontend/src/app/favicon.ico`
- Create: `frontend/src/app/icon.png`
- Create: `frontend/src/app/apple-icon.png`
- Create: `tests/test_official_icon_assets.py`

**Interfaces:**
- Consumes: `docs/icon.png`, a square source PNG supplied by the user.
- Produces: Next.js metadata assets discovered through the `favicon.ico`, `icon.png`, and `apple-icon.png` App Router file conventions.

- [ ] **Step 1: Write the failing asset regression test**

```python
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "icon.png"
APP_DIR = ROOT / "frontend" / "src" / "app"


def assert_resized_source(candidate_path: Path, expected_size: tuple[int, int]) -> None:
    with Image.open(SOURCE) as source, Image.open(candidate_path) as candidate:
        expected = source.convert("RGB").resize(expected_size, Image.Resampling.LANCZOS)
        actual = candidate.convert("RGB")

    assert actual.size == expected_size
    assert ImageChops.difference(actual, expected).getbbox() is None


def test_nextjs_icon_assets_are_derived_from_official_source() -> None:
    assert_resized_source(APP_DIR / "icon.png", (512, 512))
    assert_resized_source(APP_DIR / "apple-icon.png", (180, 180))


def test_favicon_contains_required_sizes_and_matches_source() -> None:
    required_sizes = {(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)}

    with Image.open(APP_DIR / "favicon.ico") as favicon:
        assert favicon.format == "ICO"
        assert required_sizes.issubset(set(favicon.info["sizes"]))

    assert_resized_source(APP_DIR / "favicon.ico", (256, 256))
```

- [ ] **Step 2: Run the test and verify it fails before asset generation**

Run: `python -m pytest tests/test_official_icon_assets.py -q`

Expected: FAIL because `frontend/src/app/icon.png` and `frontend/src/app/apple-icon.png` do not exist and the old favicon is not derived from `docs/icon.png`.

- [ ] **Step 3: Generate the minimal Next.js icon set from the official source**

Run from the repository root:

```powershell
python -c "from pathlib import Path; from PIL import Image; source=Image.open(Path('docs/icon.png')).convert('RGBA'); app=Path('frontend/src/app'); source.resize((512, 512), Image.Resampling.LANCZOS).save(app/'icon.png', optimize=True); source.resize((180, 180), Image.Resampling.LANCZOS).save(app/'apple-icon.png', optimize=True); source.save(app/'favicon.ico', format='ICO', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])"
```

Expected: the existing favicon is replaced and the two PNG metadata assets are created without changing application code.

- [ ] **Step 4: Run the focused regression test**

Run: `python -m pytest tests/test_official_icon_assets.py -q`

Expected: `2 passed`.

- [ ] **Step 5: Run the Next.js production build**

Run: `npm run build` from `frontend/`.

Expected: exit code 0, with the App Router routes compiled successfully and no icon metadata errors.

- [ ] **Step 6: Inspect generated icon metadata**

Run from `frontend/`:

```powershell
rg -n "favicon\.ico|icon\.png|apple-icon\.png" .next/server/app .next/server/pages -g "*.html" -g "*.meta" -g "*.body"
```

Expected: generated output references `/favicon.ico`, `/icon.png`, and `/apple-icon.png` or their cache-busted Next.js metadata routes.

- [ ] **Step 7: Check the scoped diff and commit**

```powershell
git diff --check -- docs/icon.png frontend/src/app/favicon.ico frontend/src/app/icon.png frontend/src/app/apple-icon.png tests/test_official_icon_assets.py
git add -- docs/icon.png frontend/src/app/favicon.ico frontend/src/app/icon.png frontend/src/app/apple-icon.png tests/test_official_icon_assets.py
git commit -m "feat: adopt official Aurora system icon"
```

