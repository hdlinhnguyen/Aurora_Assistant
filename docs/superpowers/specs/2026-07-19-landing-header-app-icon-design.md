# Landing Header App Icon Design

## Goal

Replace the lightning symbol in the landing page header brand with the official
Aurora app icon.

## Scope

- Modify only the brand icon in the navigation header of
  `frontend/src/app/page.tsx`.
- Keep the lightning symbol used by the hero content badge unchanged.
- Reuse the existing Next.js app icon at `frontend/src/app/icon.png` through the
  public `/icon.png` metadata asset route.

## Visual Treatment

Keep the existing 36-by-36-pixel rounded header container and its hover motion.
Render the official icon inside it with a small inset and `object-contain` so
the transparent artwork remains fully visible. Remove the pulsing lightning
SVG; the app icon becomes the single brand mark beside “AURORA ASSISTANT”.

## Accessibility and Behavior

The image uses descriptive alternative text. The icon remains decorative to
the adjacent brand name and introduces no new interaction or data flow.

## Verification

- Add a focused source test confirming the header references `/icon.png`.
- Confirm the old header lightning path is absent from the header brand block.
- Run the focused test and the frontend lint command.
- Inspect the landing page at desktop and mobile widths while the dev server is
  running.

## Success Criteria

The header shows the official Aurora app icon in place of the lightning symbol,
the hero badge remains unchanged, and the page layout stays aligned on desktop
and mobile.
