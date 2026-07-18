# Railway Backend Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Go API and Python learning-path API deployable as separate Railway services backed by Railway PostgreSQL, with private service communication, health checks, persistent Python checkpoints, and dashboard instructions.

**Architecture:** Keep Go and Python as independently built containers from the repository root. Go owns the public API and PostgreSQL connection; Python remains private and serves learning-path endpoints, with SQLite checkpoints on a Railway volume. Runtime URLs, CORS origins, database values, and secrets are environment-driven.

**Tech Stack:** Go 1.26.3, Fiber v3, GORM/PostgreSQL, Python 3.13, FastAPI, Uvicorn, LangGraph/SQLite, Docker, Railway Dashboard.

## Global Constraints

- Deploy exactly three Railway services: Go API, Python learning-path API, and Railway PostgreSQL.
- Go listens on Railway's `$PORT` and uses `/api/health` for health checks.
- Python listens on `0.0.0.0:$PORT` and exposes a dependency-free `/health` endpoint.
- All Go-to-Python calls use `LEARNING_PATH_URL`; no production call uses a fixed loopback URL.
- Python uses `GO_BACKEND_GRAPH_URL` and retains the packaged static graph fallback.
- Production sets `ENABLE_SYNTHETIC_DATA=false`.
- Python uses `LEARNING_PATH_DB=/data/learning-path.sqlite` on a mounted Railway Volume and stays at one replica.
- CORS uses comma-separated `CORS_ALLOWED_ORIGINS`; secrets are supplied only by Railway.
- Do not modify or revert unrelated dirty-worktree changes.

---

## File Map

- Create `backend/internal/runtime/config.go`: pure parsing for Python base URL and comma-separated CORS origins.
- Create `backend/internal/runtime/config_test.go`: table-driven tests for defaults, trimming, and empty entries.
- Modify `backend/internal/handler/tutor.go`: store a normalized Python base URL on `TutorHandler` and route every learning-path request through it.
- Create `backend/internal/handler/tutor_learning_path_test.go`: `httptest.Server` coverage proving requests use the configured base URL and retain endpoint paths.
- Modify `backend/cmd/server/main.go`: read runtime config, pass the Python URL into the tutor handler, and use parsed CORS origins.
- Modify `learning-path/src/learning_path/api.py`: add `GET /health` to `create_app`.
- Create `learning-path/tests/test_health.py`: FastAPI client coverage for the health response and dependency isolation.
- Create `backend/Dockerfile`: multi-stage Go build and minimal runtime image.
- Create `learning-path/Dockerfile`: Python 3.13 image containing the package and repository graph data.
- Create `backend/railway.toml`: Go health check and restart policy.
- Create `learning-path/railway.toml`: Python health check and restart policy.
- Create `.dockerignore`: exclude VCS, local environments, binaries, caches, and test artifacts while retaining both service source trees and `knowledge-graph/data/graph.json`.
- Create `docs/deployment/railway.md`: Dashboard setup, variables, private references, volume, deploy order, and smoke checks.

### Task 1: Add Tested Runtime Configuration Parsing

**Files:**
- Create: `backend/internal/runtime/config_test.go`
- Create: `backend/internal/runtime/config.go`

**Interfaces:**
- Produces `runtime.LearningPathURL() string`, returning `LEARNING_PATH_URL` without trailing slashes and defaulting to `http://127.0.0.1:8000`.
- Produces `runtime.CORSOrigins() []string`, splitting `CORS_ALLOWED_ORIGINS` on commas, trimming whitespace, dropping empty values, and defaulting to `http://localhost:3000` and `http://localhost:3001`.

- [ ] **Step 1: Write the failing tests**

```go
func TestLearningPathURL(t *testing.T) {
	for _, tc := range []struct {
		name, raw, want string
	}{
		{"default", "", "http://127.0.0.1:8000"},
		{"trim trailing slash", "https://python.railway.internal/", "https://python.railway.internal"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("LEARNING_PATH_URL", tc.raw)
			require.Equal(t, tc.want, LearningPathURL())
		})
	}
}

func TestCORSOrigins(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", " https://app.example , ,http://localhost:3000 ")
	require.Equal(t, []string{"https://app.example", "http://localhost:3000"}, CORSOrigins())
}

func TestCORSOriginsDefault(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "")
	require.Equal(t, []string{"http://localhost:3000", "http://localhost:3001"}, CORSOrigins())
}
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `go test ./internal/runtime -run 'Test(LearningPathURL|CORSOrigins)' -v` from `backend/`.

Expected: FAIL because `LearningPathURL` and `CORSOrigins` do not exist.

- [ ] **Step 3: Implement the minimal parser**

Create `config.go` with `os.Getenv`, `strings.TrimSpace`, `strings.TrimRight`, and the exact defaults above. Keep the package free of Fiber and HTTP dependencies so it is deterministic and independently testable.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `go test ./internal/runtime -run 'Test(LearningPathURL|CORSOrigins)' -v`.

Expected: PASS for all three tests.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/runtime/config.go backend/internal/runtime/config_test.go
git commit -m "feat: add environment runtime configuration"
```

### Task 2: Route Every Go Learning-Path Request Through the Configured URL

**Files:**
- Modify: `backend/internal/handler/tutor.go:30-49,1357-1369,1449-1459,1552-1561,1678-1687`
- Create: `backend/internal/handler/tutor_learning_path_test.go`
- Modify: `backend/cmd/server/main.go:55-60,90-95,300-324`

**Interfaces:**
- `handler.WithLearningPathURL(baseURL string) TutorHandlerOption` normalizes a base URL for the handler.
- `TutorHandler.postLearningPathPython(path string, payload any) ([]byte, int, error)` performs JSON POSTs against the configured base URL.
- `main` constructs the tutor handler with `handler.WithLearningPathURL(runtime.LearningPathURL())` and CORS with `runtime.CORSOrigins()`.

- [ ] **Step 1: Write the failing handler integration test**

Use an `httptest.Server` that records `r.URL.Path`, decodes the JSON body, returns `201`, and construct `NewTutorHandler(nil, WithLearningPathURL(server.URL))`. Call `handler.postLearningPathPython("/learning-path", map[string]string{"subject": "toan"})`; assert status `201`, path `/learning-path`, and the decoded subject. Add a second assertion using a configured URL ending in `/` to prove no double slash is sent.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `go test ./internal/handler -run TestTutorLearningPathUsesConfiguredURL -v` from `backend/`.

Expected: FAIL because `WithLearningPathURL` and the handler method do not exist.

- [ ] **Step 3: Implement URL injection and replace loopback calls**

Add `learningPathURL string` to `TutorHandler`, default it in `NewTutorHandler`, and add `WithLearningPathURL` with `strings.TrimRight(baseURL, "/")`. Move the existing JSON POST logic into the handler method. Replace the four direct calls at `/learning-path/suggestions`, `/learning-path`, `/learning-path/{thread}/approve`, and `/hints` with `h.postLearningPathPython(...)`. Preserve existing status mapping and response bodies.

In `main.go`, import `backend/internal/runtime`, replace the literal CORS origins with `runtime.CORSOrigins()`, pass `handler.WithLearningPathURL(runtime.LearningPathURL())` to `NewTutorHandler`, and keep the mastery client on the same normalized URL.

- [ ] **Step 4: Run focused and package tests**

Run: `go test ./internal/handler ./internal/runtime ./cmd/server` from `backend/`.

Expected: PASS, with no `127.0.0.1:8000` literal remaining in `backend/internal/handler/tutor.go`.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/handler/tutor.go backend/internal/handler/tutor_learning_path_test.go backend/cmd/server/main.go
git commit -m "fix: configure learning path service URL"
```

### Task 3: Add a Dependency-Free Python Health Endpoint

**Files:**
- Modify: `learning-path/src/learning_path/api.py` inside `create_app`
- Create: `learning-path/tests/test_health.py`

**Interfaces:**
- `GET /health` returns HTTP `200` and JSON `{"status": "ok", "service": "learning-path"}`.
- The health handler must not call `fetch_dynamic_graph`, `build_pipeline`, SQLite, or the Go service.

- [ ] **Step 1: Write the failing test**

```python
def test_health_is_dependency_free():
    client = TestClient(create_app())
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "learning-path"}
```

- [ ] **Step 2: Run it and verify failure**

Run: `uv run pytest learning-path/tests/test_health.py -q` from the repository root.

Expected: FAIL with HTTP 404.

- [ ] **Step 3: Add the route before downstream routes**

Register `@app.get("/health")` in `create_app` and return the exact JSON object. Do not perform app initialization work in the route.

- [ ] **Step 4: Run Python tests**

Run: `uv run pytest learning-path/tests/test_health.py learning-path/tests/test_api.py -q`.

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add learning-path/src/learning_path/api.py learning-path/tests/test_health.py
git commit -m "feat: add learning path health endpoint"
```

### Task 4: Add Deterministic Container and Railway Service Configuration

**Files:**
- Create: `backend/Dockerfile`
- Create: `learning-path/Dockerfile`
- Create: `backend/railway.toml`
- Create: `learning-path/railway.toml`
- Create: `.dockerignore`

**Interfaces:**
- Go image command: `/app/aurora-server`; runtime accepts `PORT` and creates `/app/data/exam-exports`.
- Python image command: `uvicorn learning_path.api:app --host 0.0.0.0 --port ${PORT:-8000}` with `PYTHONPATH=/app/learning-path/src`.
- Railway configs use `healthcheckPath = "/api/health"` for Go and `healthcheckPath = "/health"` for Python, with `restartPolicyType = "ON_FAILURE"`.

- [ ] **Step 1: Add the Go multi-stage Dockerfile**

Use `golang:1.26-alpine` to run `go build -trimpath -ldflags="-s -w" -o /out/aurora-server ./cmd/server` with `WORKDIR /src/backend`; copy `go.mod` and `go.sum` before the source for layer reuse. Use `gcr.io/distroless/base-debian12:nonroot` as runtime, copy the binary, set `EXAM_EXPORT_DIR=/app/data/exam-exports`, expose no fixed port, and run the binary.

- [ ] **Step 2: Add the Python Dockerfile**

Use `python:3.13-slim`, copy `learning-path/pyproject.toml`, `learning-path/uv.lock`, and `learning-path/src` into `/app/learning-path`, copy `knowledge-graph/data/graph.json` into `/app/knowledge-graph/data/graph.json`, install `uv`, run `uv sync --project /app/learning-path --frozen --no-dev`, set `PYTHONPATH=/app/learning-path/src`, and run `uv run --project /app/learning-path uvicorn learning_path.api:app --host 0.0.0.0 --port ${PORT:-8000}`. The existing `DEFAULT_GRAPH_JSON` calculation resolves the copied graph at `/app/knowledge-graph/data/graph.json`.

- [ ] **Step 3: Add Railway configs and Docker ignore rules**

Set the exact health paths and `ON_FAILURE` policy in each service config. Keep `.dockerignore` from excluding `backend/`, `learning-path/`, or `knowledge-graph/data/graph.json`; exclude `.git`, `.venv`, `node_modules`, `__pycache__`, test caches, compiled binaries, and local `.env` files.

- [ ] **Step 4: Build both images locally**

Run from the repository root:

```bash
docker build -f backend/Dockerfile -t aurora-go:railway .
docker build -f learning-path/Dockerfile -t aurora-learning-path:railway .
```

Expected: both builds exit `0` and produce tagged images.

- [ ] **Step 5: Commit**

```bash
git add backend/Dockerfile learning-path/Dockerfile backend/railway.toml learning-path/railway.toml .dockerignore
git commit -m "build: add Railway service containers"
```

### Task 5: Document Railway Dashboard Deployment

**Files:**
- Create: `docs/deployment/railway.md`

**Interfaces:**
- The guide names service references as Dashboard values to replace during setup; it never commits real secrets or fixed private hostnames.
- The guide maps Railway PostgreSQL variables to the existing `DB_*` names.

- [ ] **Step 1: Document project and service creation**

Explain creating a Railway project, adding PostgreSQL, creating two services from the same GitHub repository, leaving the build context at repository root, and selecting `backend/Dockerfile` or `learning-path/Dockerfile` for each service.

- [ ] **Step 2: Document required variables**

Include exact Go variables: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSLMODE=require`, `JWT_SECRET`, `JWT_EXPIRATION=24h`, `EXAM_INTERNAL_TOKEN`, `TELEMETRY_HMAC_KEY`, `OPENAI_API_BASE`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ENABLE_SYNTHETIC_DATA=false`, `CORS_ALLOWED_ORIGINS`, and `LEARNING_PATH_URL`. Include exact Python variables: `LEARNING_PATH_DB=/data/learning-path.sqlite` and `GO_BACKEND_GRAPH_URL`.

- [ ] **Step 3: Document private references and volume**

Show that `LEARNING_PATH_URL` points to the Python service's private hostname and `GO_BACKEND_GRAPH_URL` points to the Go private hostname plus `/api/internal/graph`. Explain mounting a volume at `/data`, keeping Python at one replica, and generating a public domain only for Go.

- [ ] **Step 4: Document deploy order and smoke tests**

Deploy PostgreSQL first, then Python, then Go. Verify Go `/api/health`, Python `/health` from the Railway service health status, PostgreSQL migrations, one protected Go request, and a learning-path request that crosses the private network. Add a restart check that confirms the SQLite volume preserves a pending thread.

- [ ] **Step 5: Commit**

```bash
git add docs/deployment/railway.md
git commit -m "docs: add Railway deployment guide"
```

### Task 6: Run Full Verification and Review the Deployment Diff

**Files:**
- Verify: all files created or modified by Tasks 1-5

- [ ] **Step 1: Run Go formatting and tests**

Run from `backend/`: `gofmt -w internal/runtime/config.go internal/runtime/config_test.go internal/handler/tutor.go internal/handler/tutor_learning_path_test.go cmd/server/main.go` followed by `go test ./...`.

Expected: formatting produces no diff after a second `gofmt -l` and all Go tests pass.

- [ ] **Step 2: Run Python tests**

Run from the repository root: `uv run pytest learning-path/tests -q`.

Expected: all learning-path tests pass.

- [ ] **Step 3: Validate deployment files**

Run `git diff --check`, `docker build -f backend/Dockerfile -t aurora-go:railway .`, and `docker build -f learning-path/Dockerfile -t aurora-learning-path:railway .`.

Expected: no whitespace errors and both images build successfully.

- [ ] **Step 4: Check for forbidden production loopback calls**

Run: `rg -n '127\\.0\\.0\\.1:8000|localhost:8000' backend/internal backend/cmd`.

Expected: no hard-coded Python service call remains outside an explicitly tested local default.

- [ ] **Step 5: Review only the intended diff**

Run: `git status --short` and `git diff --stat`. Confirm unrelated pre-existing deletions and edits remain untouched. Record test commands and results in the handoff.

