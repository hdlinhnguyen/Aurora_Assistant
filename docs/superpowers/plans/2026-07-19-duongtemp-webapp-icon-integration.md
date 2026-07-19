# Duongtemp Webapp Icon Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transfer the official transparent Aurora webapp icons from `duongtemp` to `khang` without including unrelated commits.

**Architecture:** Reuse the two focused source commits by cherry-picking them onto `khang` in dependency order. Preserve their Next.js metadata assets and focused Python asset validation, then verify branch history and repository cleanliness.

**Tech Stack:** Git, Next.js App Router metadata assets, PNG/ICO files, Python pytest

## Global Constraints

- Apply only commits `98166ec` and `010c0eb` from `duongtemp`.
- Keep the transparent-background correction from `010c0eb`.
- Do not merge or cherry-pick unrelated `duongtemp` commits.
- Preserve current `khang` behavior outside icon-related files.

---

### Task 1: Integrate Official Aurora Icon Commits

**Files:**
- Create: `docs/icon.png`
- Create: `frontend/src/app/apple-icon.png`
- Create: `frontend/src/app/icon.png`
- Modify: `frontend/src/app/favicon.ico`
- Create: `tests/test_official_icon_assets.py`
- Create: `docs/superpowers/plans/2026-07-18-official-system-icon.md`

**Interfaces:**
- Consumes: Git commits `98166ec` and `010c0eb` from local branch `duongtemp`.
- Produces: Next.js metadata icon assets with transparent corners and an automated asset validation test.

- [ ] **Step 1: Confirm the target branch and clean working tree**

Run: `git status --short --branch`

Expected: branch header starts with `## khang` and no changed-file lines follow it.

- [ ] **Step 2: Apply the base official icon commit**

Run: `git cherry-pick 98166ec`

Expected: Git creates a commit named `feat: adopt official Aurora system icon` without conflicts.

- [ ] **Step 3: Apply the transparent-background correction**

Run: `git cherry-pick 010c0eb`

Expected: Git creates a commit named `fix: remove baked icon background` without conflicts.

- [ ] **Step 4: Run the focused icon asset test**

Run: `pytest tests/test_official_icon_assets.py -v`

Expected: all tests in `tests/test_official_icon_assets.py` pass.

- [ ] **Step 5: Verify assets, history, and repository state**

Run: `git log -3 --oneline && git status --short --branch`

Expected: the two icon commits are the newest implementation commits after the integration design/plan commits, all three frontend icon files exist, and no changed-file lines appear in status.
