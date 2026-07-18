# Official System Icon Design

## Goal

Use `docs/icon.png` as the official Aurora system icon across every icon surface currently supported by the repository.

## Current State

- The application is a Next.js web frontend in `frontend/`.
- The only existing system icon is `frontend/src/app/favicon.ico`.
- The repository has no PWA manifest, desktop application shell, or tray icon configuration.
- The source image is a square 1254 x 1254 PNG.

## Design

Keep `docs/icon.png` as the source asset and derive the following Next.js file-convention assets in `frontend/src/app/`:

- `favicon.ico`: a multi-size ICO for legacy browser and favicon compatibility.
- `icon.png`: the main modern browser and metadata icon.
- `apple-icon.png`: the Apple touch icon.

Next.js will discover these files automatically and generate the relevant metadata. No layout metadata changes are required.

## Scope Boundaries

- Do not change feature icons or role illustrations inside the UI.
- Do not add a PWA manifest, service worker, desktop packaging, or tray integration.
- Do not alter unrelated user changes in the working tree.

## Verification

- Confirm every generated image can be decoded and has the expected format and dimensions.
- Run the frontend production build.
- Inspect the generated page metadata or build output to confirm the icon routes are present.

