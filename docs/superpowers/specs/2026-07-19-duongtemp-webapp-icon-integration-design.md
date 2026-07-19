# Duongtemp Webapp Icon Integration Design

## Goal

Bring the official Aurora webapp icon assets from `duongtemp` into `khang`
without merging unrelated learning-path or documentation changes.

## Scope

Apply these commits in order:

1. `98166ec` (`feat: adopt official Aurora system icon`)
2. `010c0eb` (`fix: remove baked icon background`)

This includes the Next.js icon assets, their asset test, and the source and plan
files recorded by the original commits. No other `duongtemp` commits are in
scope.

## Integration Method

Cherry-pick both commits onto `khang` in their original order. If conflicts
occur, resolve only files touched by the icon commits and preserve current
`khang` behavior outside this scope.

## Verification

- Run `pytest tests/test_official_icon_assets.py`.
- Confirm `frontend/src/app/icon.png`, `apple-icon.png`, and `favicon.ico` exist.
- Confirm the cherry-picked commits are present on `khang` and the working tree
  is clean.

## Success Criteria

`khang` contains the transparent official Aurora webapp icons and the focused
asset test passes, with no unrelated commits from `duongtemp` included.
