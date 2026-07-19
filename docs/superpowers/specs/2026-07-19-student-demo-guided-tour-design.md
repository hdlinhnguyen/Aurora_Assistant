# Student Demo Guided Tour Design

## Goal

Let a visitor start the landing-page student tour through a temporary demo
session, guide them directly through the student experience, and always clean
up that demo session when the tour ends.

## Scope

- Reuse the existing `student@aurora.edu.vn` / `demo123` login and
  `GuidedTour` component.
- The landing button starts student mode at the first real student step; it
  does not show the role-selection screen.
- Mark only this flow with `aurora_tour_demo_session=true` in local storage.
- On normal completion, clear the demo auth and tour keys and return to `/`.
- On `X`, `Escape`, or overlay click, show a confirmation warning. If confirmed,
  clear the demo auth and tour keys and return to `/`; if cancelled, keep the
  tour active.
- Tours started from an authenticated user's existing menu do not set the demo
  marker and do not log the user out.

## State and Flow

1. Landing posts to `/auth/login` with the seeded student credentials.
2. On success, store the token/user, set `aurora_tour_demo_session`, set tour
   mode to `student`, set the first real student step, and navigate to `/tutor`.
3. `GuidedTour` distinguishes `completeTour` from `requestExit`; both use a
   shared demo cleanup routine, while early exit asks for confirmation first.
4. Login failure remains on landing and presents an actionable error.

## Safety and UX

- Cleanup is limited to demo sessions; regular authenticated sessions remain
  untouched.
- The warning explicitly states that exiting ends the demo session and logs the
  visitor out.
- Cleanup removes `aurora_token`, `aurora_user`, `aurora_tour_active`,
  `aurora_tour_step`, `aurora_tour_mode`, `aurora_tour_demo_session`, and the
  completion marker before redirecting.

## Verification

- Confirm the landing handler starts student mode and records the demo marker.
- Confirm completion and confirmed early exit clear the demo session.
- Confirm cancelling the warning leaves the tour active.
- Confirm a normal tour started from `QuickRoleSwitcher` does not clear auth.
- Run frontend lint and exercise the flow against the local dev server.
