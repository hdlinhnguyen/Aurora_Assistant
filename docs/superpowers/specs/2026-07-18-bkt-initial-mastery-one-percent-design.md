# BKT Initial Mastery at One Percent

## Goal

Change the system-wide BKT prior mastery probability from 30% to 1% for future calculations and topic states that have no evidence.

Existing synthetic mastery records do not need migration or batch recalculation.

## Design

Keep the three existing layer-specific defaults synchronized at `0.01`:

- The Python learning-path service uses `BKTParams.p_l0 = 0.01` as the prior for every BKT calculation.
- The Go backend uses `initialMasteryProbability = 0.01` when returning a subject topic with no persisted evidence.
- The frontend uses `BKT_INITIAL_MASTERY = 0.01` when rendering a missing topic state.

No environment variable, shared configuration service, database migration, or startup recalculation is added. This keeps the change scoped to the requested behavior and preserves existing deployment wiring.

## Data Flow

For a topic with evidence, the Python calculator starts from 1% and processes confirmed evidence chronologically. The Go backend persists the calculated result as before. For a topic without evidence, the Go and frontend fallbacks display 1% with the existing `unknown` status and zero confidence.

## Compatibility

Persisted synthetic mastery states remain unchanged until the existing recalculation flow runs. New calculations and missing-topic fallbacks use 1% immediately after deployment.

## Testing

- Update the Go service test so a missing subject topic must receive a 1% prior.
- Add or update Python BKT coverage so the default no-evidence state has 1% mastery.
- Run the focused Python and Go mastery test suites.
- Run an available frontend typecheck or test command to verify the constant change does not break consumers.
