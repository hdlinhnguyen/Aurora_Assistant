# Telemetry P0 Runbook

## Configuration

- `TELEMETRY_HMAC_KEY`: production-only secret used to pseudonymize user IDs.
- `DB_PORT`: PostgreSQL port; local Docker currently exposes `5436`.
- Raw `interaction` events are retained for 90 days by policy.
- Outbox rows retry up to 8 times before `dead_letter`.

## Health Checks

Check pending and dead-letter volume:

```sql
SELECT status, count(*), max(now() - created_at) AS oldest
FROM telemetry_outboxes
GROUP BY status;
```

Check collector/data quality:

```sql
SELECT event_name, count(*)
FROM telemetry_events
WHERE occurred_at >= now() - interval '24 hours'
GROUP BY event_name
ORDER BY event_name;
```

## Rebuild Facts

```powershell
$env:DB_PORT='5436'
go run ./cmd/telemetry_rebuild `
  --from 2026-07-18T00:00:00Z `
  --to 2026-07-19T00:00:00Z
```

Rebuild is idempotent by `attempt_id`. Review `missing_presented` and `missing_grade` before trusting daily metrics.

## Retention

Rebuild and purge raw interaction events older than 90 days:

```powershell
go run ./cmd/telemetry_rebuild `
  --from 2026-04-19T00:00:00Z `
  --to 2026-07-19T00:00:00Z `
  --purge-interactions-older-than-days 90
```

Decision events are not removed by the interaction purge.

## Dead-Letter Recovery

1. Inspect `last_error` without copying `payload_json` into tickets or chat.
2. Fix schema, database, or deployment errors.
3. Set selected rows back to `pending`, reset `attempts` to `0`, and set `next_attempt_at=now()`.
4. Confirm the raw event is inserted once by its unique `event_id`.

## Privacy Deletion

Resolve the user's pseudonymous actor ID in the restricted identity service, delete matching raw/fact rows in a transaction, and record the deletion in the existing restricted audit path. Never expose the HMAC key or identity mapping to analytics users.
