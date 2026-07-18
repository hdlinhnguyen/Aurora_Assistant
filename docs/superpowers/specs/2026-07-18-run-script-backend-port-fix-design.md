# Run Script Backend Port Fix Design

## Problem

The Go backend loads `PORT=8081` from `backend/.env`, and the frontend defaults to
`http://localhost:8081/api`. However, `run.ps1` checks, reports, and links to port
`8082`. When the script is run again, it does not stop the existing backend on
port `8081`. The replacement backend then exits because it cannot bind to the
occupied port.

## Scope

Update only `run.ps1` so its backend port handling matches the existing `8081`
configuration. Do not change backend or frontend ports, application behavior,
database state, or unrelated startup logic.

## Design

- Replace the backend port `8082` with `8081` in the startup port cleanup list.
- Update the backend startup messages to report port `8081`.
- Update the printed backend health-check URL to use port `8081`.
- Keep ports `3000` and `8000` and all existing service commands unchanged.

## Error Handling

The existing process cleanup remains best-effort: missing listeners and process
termination failures do not stop startup. Correcting the port ensures that the
best-effort cleanup targets the process that would otherwise block the backend.

## Testing

Add a regression check that reads `run.ps1` and verifies:

- the cleanup list contains backend port `8081`;
- backend status text and the health-check URL use `8081`;
- stale backend port `8082` is absent.

Run the check before the change to confirm it fails, then after the change to
confirm it passes. Finally, launch the services and verify the Go health endpoint
at `http://localhost:8081/api/health`, the FastAPI endpoint on port `8000`, and
the Next.js server on port `3000`.
