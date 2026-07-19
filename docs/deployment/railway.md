# Deploy Aurora Backend on Railway

This guide deploys three services in one Railway project:

- `aurora-go`: public Go/Fiber API
- `aurora-learning-path`: private FastAPI service
- `Postgres`: Railway PostgreSQL

The frontend is not deployed by this guide. Only the Go service needs a public Railway domain.

## 1. Create the project and database

1. In Railway, create an empty project.
2. Select **New > Database > PostgreSQL**.
3. Rename the database service to `Postgres` if Railway assigned another name. The variable examples below assume this name.
4. Wait until PostgreSQL reports `Online` before deploying the application services.

## 2. Create the Python service

1. Select **New > GitHub Repo** and choose this repository.
2. Rename the service to `aurora-learning-path`.
3. Keep the root directory blank so the Docker build context is the repository root.
4. In service settings, set the config file path to `learning-path/railway.toml`. If configuring the builder manually, select the Dockerfile at `learning-path/Dockerfile`.
5. Do not generate a public domain for this service.

Add these variables:

| Variable | Value |
| --- | --- |
| `LEARNING_PATH_DB` | `/data/learning-path.sqlite` |
| `GO_BACKEND_GRAPH_URL` | `http://${{aurora-go.RAILWAY_PRIVATE_DOMAIN}}:${{aurora-go.PORT}}/api/internal/graph` |
| `INTERNAL_SERVICE_TOKEN` | The same new random token configured on `aurora-go` |

Use Railway's variable-reference picker instead of typing service references when possible. The reference picker keeps the value linked if Railway changes the private hostname or port.

### Mount persistent storage

1. Open the Python service.
2. Add a Railway Volume.
3. Set the mount path to `/data`.
4. Keep this service at exactly one replica. The LangGraph checkpointer uses one SQLite file and is not safe for concurrent replicas.

Deploy the Python service after the Go service reference has been accepted. Its `/health` route does not depend on Go, so the service can become healthy before Go is online.

## 3. Create the Go service

1. Add the same GitHub repository again as another service.
2. Rename the service to `aurora-go`.
3. Keep the root directory blank.
4. Set the config file path to `backend/railway.toml`. If configuring the builder manually, select `backend/Dockerfile`.
5. Generate a public Railway domain for this service.

### PostgreSQL variables

Create these variables with Railway references to the `Postgres` service:

| Go variable | Railway value |
| --- | --- |
| `DB_HOST` | `${{Postgres.PGHOST}}` |
| `DB_PORT` | `${{Postgres.PGPORT}}` |
| `DB_USER` | `${{Postgres.PGUSER}}` |
| `DB_PASSWORD` | `${{Postgres.PGPASSWORD}}` |
| `DB_NAME` | `${{Postgres.PGDATABASE}}` |
| `DB_SSLMODE` | `disable` |

These references use Railway's private network. Do not copy public database credentials into the repository.

### Application variables

Add the following variables:

| Variable | Production value |
| --- | --- |
| `JWT_SECRET` | A new random secret of at least 32 bytes |
| `JWT_EXPIRATION` | `24h` |
| `ADMIN_EMAIL` | The initial administrator email |
| `ADMIN_PASSWORD` | A new unique administrator password |
| `ADMIN_NAME` | The initial administrator display name |
| `EXAM_INTERNAL_TOKEN` | A separate new random secret |
| `INTERNAL_SERVICE_TOKEN` | The same new random token configured on `aurora-learning-path` |
| `TELEMETRY_HMAC_KEY` | A separate new random secret of at least 32 bytes |
| `OPENAI_API_BASE` | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `OPENAI_API_KEY` | Your Gemini API key |
| `OPENAI_MODEL` | `gemini-2.5-flash` |
| `ENABLE_SYNTHETIC_DATA` | `false` |
| `LEARNING_PATH_URL` | `http://${{aurora-learning-path.RAILWAY_PRIVATE_DOMAIN}}:${{aurora-learning-path.PORT}}` |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:3001` until the frontend is deployed |

Generate independent values for `JWT_SECRET`, `ADMIN_PASSWORD`, `EXAM_INTERNAL_TOKEN`, `INTERNAL_SERVICE_TOKEN`, and `TELEMETRY_HMAC_KEY`. The `INTERNAL_SERVICE_TOKEN` value must match between Go and Python. Do not reuse values from `backend/.env.example`. If `ADMIN_PASSWORD` is omitted, Go intentionally skips admin creation instead of creating an account with a public default password.

When the frontend is deployed, replace `CORS_ALLOWED_ORIGINS` with its exact HTTPS origin. Multiple origins are comma-separated without paths, for example:

```text
https://aurora.example.com,https://www.aurora.example.com
```

Railway supplies `PORT` automatically. Do not set a fixed `PORT` in the Dashboard.

## 4. Deploy order

1. Confirm `Postgres` is online.
2. Deploy `aurora-learning-path` and confirm its Railway health check passes at `/health`.
3. Deploy `aurora-go`. Startup runs GORM migrations and then Railway checks `/api/health`.
4. If the Go deployment fails, inspect logs for the first PostgreSQL connection or migration error before retrying.

`ENABLE_SYNTHETIC_DATA=false` is mandatory for persistent environments. Leaving it enabled resets the synthetic fixtures whenever Go starts.

## 5. Smoke checks

Replace `<GO_DOMAIN>` with the generated public domain.

### Public Go health

```bash
curl --fail https://<GO_DOMAIN>/api/health
```

Expected response:

```json
{"message":"Aurora Socratic Tutor API is running","status":"ok"}
```

### Database-backed request

Register or log in through `/api/auth/register` or `/api/auth/login`, then call a protected endpoint with the returned bearer token. A successful response confirms the API, migrations, and PostgreSQL connection are working together.

### Go-to-Python private networking

Use a teacher account to call a learning-path or mastery recalculation endpoint. Check the Go logs and confirm there is no connection attempt to `127.0.0.1:8000`. Check the Python logs for the matching `/learning-path`, `/hints`, or `/mastery/calculate` request.

### Persistent approval state

1. Create a learning path and keep its thread in `awaiting_approval` state.
2. Redeploy or restart `aurora-learning-path`.
3. Approve the same thread.
4. A successful approval confirms `/data/learning-path.sqlite` persisted on the Railway Volume.

## 6. Troubleshooting

- **Go cannot connect to PostgreSQL:** verify all five `DB_*` values are Railway references to `Postgres` and `DB_SSLMODE=disable`.
- **Go receives connection refused from Python:** verify `LEARNING_PATH_URL` uses the Python private domain and referenced `PORT`, not `localhost`.
- **Python graph requests return 401:** verify `INTERNAL_SERVICE_TOKEN` matches exactly in both services. The Go graph endpoint rejects requests when the token is missing or wrong.
- **Python cannot load the dynamic graph:** verify `GO_BACKEND_GRAPH_URL`; Python falls back to the packaged `knowledge-graph/data/graph.json` while Go is unavailable.
- **Pending approvals disappear:** verify the volume is mounted at `/data`, `LEARNING_PATH_DB` matches `/data/learning-path.sqlite`, and the service has one replica.
- **Browser reports a CORS error:** set `CORS_ALLOWED_ORIGINS` to the frontend's exact scheme and hostname, then redeploy Go.
