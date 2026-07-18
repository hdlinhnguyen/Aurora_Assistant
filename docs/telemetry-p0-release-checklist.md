# Telemetry P0 Release Checklist

## Required Verification

- [ ] `TELEMETRY_HMAC_KEY` is set to a production secret and is not committed.
- [ ] PostgreSQL is reachable and `AutoMigrate` creates telemetry, outbox, and fact tables.
- [ ] Collector rejects sensitive keys at top level and nested levels.
- [ ] Client-controlled `actor_id` is overwritten by the authenticated server actor.
- [ ] Answer submission succeeds when telemetry storage is unavailable.
- [ ] Outbox duplicate delivery produces one raw event by `event_id`.
- [ ] Worker lag and dead-letter counts have an owner and runbook.
- [ ] Raw interaction retention is configured to 90 days.
- [ ] Cohort dashboards enforce the minimum cohort size of 10.
- [ ] No raw chat, answer text, names, emails, tokens, or paper images appear in analytics rows.

## Commands

```powershell
$env:DB_PORT='5436'
go test ./...
uv run pytest learning-path/tests -q
npm --prefix frontend test -- --run
npm --prefix frontend exec tsc -- --noEmit
git diff --check
```

## Release Smoke Journey

Run the `TestP0JourneyReachesQuestionFact` integration test with PostgreSQL available. Confirm that one attempt can be traced through presented, hint, submitted, graded, raw-event, and fact records without duplicate rows.

## Rollback

Disable the frontend telemetry sender by withholding optional events, stop the worker, and keep the protected collector returning controlled `503 telemetry_unavailable` responses. Existing learning APIs must continue serving answers, hints, mastery, and paths.
