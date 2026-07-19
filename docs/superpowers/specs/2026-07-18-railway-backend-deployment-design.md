# Railway Backend Deployment Design

## Goal

Deploy Aurora Assistant's Go API, Python learning-path API, and PostgreSQL database as separate services in one Railway project. The repository must contain deterministic build and runtime configuration so deployment can be completed from the Railway Dashboard without Railway CLI access.

Frontend deployment is outside this scope. The Go API will accept production frontend origins through an environment variable that can be populated later.

## Architecture

The Railway project contains three services:

1. `aurora-go`: the public Go/Fiber API built from `backend/cmd/server`.
2. `aurora-learning-path`: the private FastAPI service built from `learning-path` and the repository's `knowledge-graph` data.
3. Railway PostgreSQL: the persistent relational database used by the Go API.

The Go service receives public HTTP traffic. It calls the Python service over Railway private networking. The Python service calls the Go internal graph endpoint over private networking when it needs the latest curriculum graph. PostgreSQL is accessed only through Railway's internal connection variables.

## Build Configuration

### Go service

Add a multi-stage Dockerfile for the Go service. The build stage compiles `backend/cmd/server`; the runtime stage contains only the server binary, required certificates, and writable application directories. The process listens on Railway's `PORT` variable.

The service configuration uses `/api/health` as its health check and restarts the service when the process fails.

### Python service

Add a Dockerfile that installs the `learning-path` package from `learning-path/pyproject.toml` and copies `knowledge-graph/data/graph.json` into the expected repository-relative location. Uvicorn binds to `0.0.0.0` and Railway's `PORT` variable.

Add a lightweight `GET /health` endpoint that does not invoke the learning-path pipeline or either downstream service. Railway uses this endpoint as the service health check.

The Python version must satisfy the package declaration (`>=3.13`). Dependencies are installed deterministically from the project's package metadata and lockfile when available.

## Service Communication

All Go-to-Python requests use a single normalized base URL from `LEARNING_PATH_URL`. Existing hard-coded `http://127.0.0.1:8000` calls are replaced so mastery calculation, path creation, approval, and hints work when the services run in separate containers.

Python obtains its Go graph endpoint from `GO_BACKEND_GRAPH_URL`. On Railway this points to the Go service's private hostname plus `/api/internal/graph`. Its existing static graph fallback remains available if the Go service is temporarily unavailable.

The internal graph request includes `X-Internal-Token`, sourced from `INTERNAL_SERVICE_TOKEN` on both services. Go rejects missing or incorrect tokens so the graph is not exposed through the public Go domain.

Private service URLs must not be exposed to the browser or committed as fixed Railway hostnames. They are configured in the Railway Dashboard using Railway variable references.

## Database Configuration

The Go database connection continues using `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and `DB_SSLMODE`. Railway Dashboard variables map these values to the PostgreSQL service's provided variables.

GORM migrations continue to run during Go service startup. Production configuration sets `ENABLE_SYNTHETIC_DATA=false` so a restart cannot reset production records. Connection failures remain fatal so Railway restarts the service instead of serving traffic without a database.

## Persistent Python State

LangGraph approval state currently uses SQLite when `LEARNING_PATH_DB` is set. Mount a Railway Volume at `/data` and set:

```text
LEARNING_PATH_DB=/data/learning-path.sqlite
```

This preserves pending approval threads across deploys and restarts. Running multiple Python replicas is outside this design because a single SQLite file is not a safe distributed checkpointer. The Python service remains at one replica unless persistence is migrated to a shared database in a later change.

## CORS and Secrets

The Go service reads allowed browser origins from `CORS_ALLOWED_ORIGINS`, represented as a comma-separated list. Localhost origins remain defaults for local development. When the frontend is deployed, its exact HTTPS origin is added through Railway without another code change.

Secrets are configured only in Railway and are not committed:

- `JWT_SECRET`
- `ADMIN_PASSWORD`
- `TELEMETRY_HMAC_KEY`
- `EXAM_INTERNAL_TOKEN`
- `INTERNAL_SERVICE_TOKEN`
- `OPENAI_API_KEY`
- PostgreSQL credentials supplied by Railway

`OPENAI_API_BASE` and `OPENAI_MODEL` remain non-secret configuration. Production secrets must not use the development fallback values in `backend/.env.example`.

Go creates an initial administrator only when `ADMIN_PASSWORD` is explicitly configured. It never creates a production administrator with the public local-demo password.

## Railway Dashboard Setup

The repository will include a deployment guide containing:

1. Creating the Railway project and PostgreSQL service.
2. Creating the Go and Python services from the same GitHub repository.
3. Selecting each service's Dockerfile/config path.
4. Adding private-network variable references between services.
5. Mounting the Python volume.
6. Generating a public domain only for the Go service.
7. Verifying both health endpoints and a database-backed API request.

The Python service does not require a public domain for normal operation.

## Error Handling

- Go startup fails clearly when PostgreSQL configuration or migration fails.
- Go returns its existing upstream error behavior when the Python service is unavailable; deployment configuration eliminates loopback-address failures.
- Python falls back to the packaged graph JSON if the dynamic Go graph request fails.
- Health endpoints avoid downstream calls so Railway can distinguish process health from a temporary dependency outage.
- Missing required production variables are documented in the deployment checklist and verified before traffic is enabled.

## Verification

Implementation verification covers:

- Go tests for environment-derived Python URLs and CORS parsing.
- Python tests for `GET /health`.
- Local Docker builds for both service images.
- Go unit tests and Python learning-path tests.
- Container startup checks using Railway-style `PORT` values.
- Deployment-guide checks for every required variable and service reference.

After deployment, the operator verifies:

- Python `/health` through Railway's internal health status.
- Go public `/api/health` returns HTTP 200.
- Go connects to Railway PostgreSQL and completes migrations.
- A Go endpoint that invokes `/mastery/calculate` succeeds over private networking.
- Restarting the Python service preserves a pending approval thread on the mounted volume.

## Out of Scope

- Frontend deployment and production frontend domain creation.
- Railway CLI automation.
- Horizontal scaling of the SQLite-backed Python service.
- Moving LangGraph checkpoints from SQLite to PostgreSQL.
- Changing application business logic unrelated to deployment.
