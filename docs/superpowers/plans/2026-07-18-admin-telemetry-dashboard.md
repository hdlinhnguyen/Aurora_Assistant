# Admin Telemetry Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only telemetry dashboard that shows aggregate learning/system metrics, daily trends, and built-in EDA for 7/30/90-day windows.

**Architecture:** Add a focused Go `adminmetrics` service that queries `telemetry_events` and `question_attempt_facts` with one UTC snapshot per request, then expose it through the existing admin route group. Add a typed frontend API adapter and a dedicated dashboard section under the current admin overview, using Recharts and existing UI primitives.

**Tech Stack:** Go 1.26, Fiber v3, GORM/PostgreSQL, PostgreSQL JSONB aggregates, Next.js 16, React 19, TypeScript, Recharts 2, Vitest, Testing Library.

## Global Constraints

- Accept only `7d`, `30d`, or `90d`; default to `30d`.
- Use UTC windows: current `[now-range, now)` and previous `[now-2*range, now-range)`.
- Return aggregate dimensions only; never return actor IDs, session IDs, attempt IDs, raw properties, answers, or user content.
- Return `null` for a rate/average with no denominator; do not manufacture mock metrics.
- Keep the admin UI copy in Vietnamese and preserve the existing admin visual language.
- Use parameterized SQL; never concatenate the query string into SQL.
- Do not stage `.codegraph/` or unrelated plans changed by other agents.

---

### Task 1: Define the analytics domain and range semantics

**Files:**
- Create: `backend/internal/adminmetrics/domain.go`
- Test: `backend/internal/adminmetrics/domain_test.go`

**Interfaces:**
- Produces `type Range string`, constants `Range7d`, `Range30d`, `Range90d`.
- Produces `func ParseRange(string) (Range, error)` and `func (Range) Duration() time.Duration`.
- Produces response structs `Dashboard`, `Summary`, `ComparisonValue`, `TrendPoint`, `EDA`, `DistributionPoint`, `TopicMetric`, `SourceMetric`, `MasteryTransitionMetric`, and `QualityFlag` with the JSON names in the design spec.
- Produces `func percentDelta(current, previous *float64) *float64` for the service and tests.

- [ ] **Step 1: Write failing range and delta tests.**

```go
func TestParseRange(t *testing.T) {
    require.Equal(t, Range30d, mustRange(t, "30d"))
    require.Equal(t, Range7d, mustRange(t, "7d"))
    require.Equal(t, Range90d, mustRange(t, "90d"))
    _, err := ParseRange("14d")
    require.ErrorIs(t, err, ErrInvalidRange)
}

func TestPercentDeltaUsesAbsolutePreviousAndNullsZero(t *testing.T) {
    current, previous := 45.0, 50.0
    require.InDelta(t, -10.0, *percentDelta(&current, &previous), 0.001)
    zero := 0.0
    require.Nil(t, percentDelta(&current, &zero))
    require.Nil(t, percentDelta(nil, &previous))
}
```

- [ ] **Step 2: Run the focused test to verify it fails.**

Run: `go test ./internal/adminmetrics -run 'TestParseRange|TestPercentDelta' -v`

Expected: FAIL because `backend/internal/adminmetrics` and its range functions do not exist.

- [ ] **Step 3: Implement the domain types and exact JSON contract.**

Use pointer fields only for nullable rates/averages. Counts and `hasData` are non-null. Define the following exact public shape:

```go
var ErrInvalidRange = errors.New("invalid telemetry range")
type Range string
const ( Range7d Range = "7d"; Range30d Range = "30d"; Range90d Range = "90d" )

type Summary struct {
    ActiveLearningMinutes float64 `json:"activeLearningMinutes"`
    Sessions int64 `json:"sessions"`; QuestionsAnswered int64 `json:"questionsAnswered"`
    AccuracyRate *float64 `json:"accuracyRate"`; AvgSolveTimeSeconds *float64 `json:"avgSolveTimeSeconds"`
    HintsPerQuestion *float64 `json:"hintsPerQuestion"`; CompletionRate *float64 `json:"completionRate"`
    AbandonmentRate *float64 `json:"abandonmentRate"`; MasteryTransitions int64 `json:"masteryTransitions"`
    APIRequests int64 `json:"apiRequests"`; APIErrorRate *float64 `json:"apiErrorRate"`; APIP95LatencyMS *float64 `json:"apiP95LatencyMs"`
}
type ComparisonValue struct { Current *float64 `json:"current"`; Previous *float64 `json:"previous"`; DeltaPercent *float64 `json:"deltaPercent"` }
type TrendPoint struct {
    Date string `json:"date"`; ActiveLearningMinutes float64 `json:"activeLearningMinutes"`; Sessions int64 `json:"sessions"`; QuestionsAnswered int64 `json:"questionsAnswered"`
    AccuracyRate *float64 `json:"accuracyRate"`; AvgSolveTimeSeconds *float64 `json:"avgSolveTimeSeconds"`; HintsPerQuestion *float64 `json:"hintsPerQuestion"`
    CompletionRate *float64 `json:"completionRate"`; AbandonmentRate *float64 `json:"abandonmentRate"`; MasteryTransitions int64 `json:"masteryTransitions"`
    APIRequests int64 `json:"apiRequests"`; APIErrorRate *float64 `json:"apiErrorRate"`; APIP95LatencyMS *float64 `json:"apiP95LatencyMs"`
}
type DistributionPoint struct { Bucket string `json:"bucket"`; Count int64 `json:"count"` }
type TopicMetric struct { TopicID string `json:"topicId"`; TopicName string `json:"topicName"`; Attempts int64 `json:"attempts"`; AccuracyRate *float64 `json:"accuracyRate"`; AvgSolveTimeSeconds *float64 `json:"avgSolveTimeSeconds"`; HintsPerQuestion *float64 `json:"hintsPerQuestion"` }
type SourceMetric struct { Source string `json:"source"`; Events int64 `json:"events"` }
type MasteryTransitionMetric struct { From string `json:"from"`; To string `json:"to"`; Count int64 `json:"count"` }
type QualityFlag struct { Flag string `json:"flag"`; Count int64 `json:"count"` }
type EDA struct {
    MissingPresented int64 `json:"missingPresented"`; MissingGrade int64 `json:"missingGrade"`; InvalidDuration int64 `json:"invalidDuration"`
    OutlierAttemptCount int64 `json:"outlierAttemptCount"`; OutlierThresholdSeconds float64 `json:"outlierThresholdSeconds"`
    P50SolveTimeSeconds *float64 `json:"p50SolveTimeSeconds"`; P95SolveTimeSeconds *float64 `json:"p95SolveTimeSeconds"`
    SolveTimeDistribution []DistributionPoint `json:"solveTimeDistribution"`; HintDistribution []DistributionPoint `json:"hintDistribution"`
    TopicBreakdown []TopicMetric `json:"topicBreakdown"`; SourceBreakdown []SourceMetric `json:"sourceBreakdown"`
    MasteryTransitionBreakdown []MasteryTransitionMetric `json:"masteryTransitionBreakdown"`; QualityFlags []QualityFlag `json:"qualityFlags"`
}
type Dashboard struct { Range Range `json:"range"`; GeneratedAt time.Time `json:"generatedAt"`; HasData bool `json:"hasData"`; Summary Summary `json:"summary"`; Comparison map[string]ComparisonValue `json:"comparison"`; Trends []TrendPoint `json:"trends"`; EDA EDA `json:"eda"` }
```

Populate every summary key in `Comparison`, including count metrics converted to `float64` pointers.

`ParseRange` trims no input: the handler passes the raw query and invalid whitespace must return `ErrInvalidRange`. `Range.Duration()` returns exactly 7, 30, or 90 days.

- [ ] **Step 4: Run focused tests.**

Run: `go test ./internal/adminmetrics -run 'TestParseRange|TestPercentDelta' -v`

Expected: PASS.

- [ ] **Step 5: Commit the domain contract.**

```bash
git add backend/internal/adminmetrics/domain.go backend/internal/adminmetrics/domain_test.go
git commit -m "feat: define admin telemetry dashboard contract"
```

### Task 2: Implement aggregate SQL service and backend EDA

**Files:**
- Create: `backend/internal/adminmetrics/service.go`
- Test: `backend/internal/adminmetrics/service_test.go`

**Interfaces:**
- Consumes `*gorm.DB`, `adminmetrics.Range`, and the domain structs from Task 1.
- Produces `func NewService(db *gorm.DB) *Service` and `func (s *Service) Dashboard(ctx context.Context, now time.Time, r Range) (Dashboard, error)`.

- [ ] **Step 1: Add PostgreSQL fixture helpers and failing aggregate tests.**

Use `backend/internal/testutil.OpenPostgres(t)`, auto-migrate `model.TelemetryEvent`, `model.QuestionAttemptFact`, and `model.Node`, then insert deterministic UTC rows. Cover:

```go
func TestDashboardAggregatesCurrentAndPreviousWindows(t *testing.T) { /* two days, two windows, facts + API events */ }
func TestDashboardReturnsNullRatesAndEmptyEDAWithoutData(t *testing.T) { /* no rows */ }
func TestDashboardBuildsQualityFlagsDistributionsAndBreakdowns(t *testing.T) { /* missing lifecycle, 301s outlier, 0/1/3 hints, topic/source/mastery */ }
func TestDashboardDoesNotLeakIdentifiersOrProperties(t *testing.T) { /* json.Marshal(result), assert forbidden key strings absent */ }
```

API fixtures must use `EventName: "api_request_completed"` and `PropertiesJSON` containing `status_class` and numeric `duration_ms`; mastery fixtures use `status_before` and `status_after`. Facts must include submitted, abandoned, missing-presented, and missing-grade variants.

- [ ] **Step 2: Run focused tests to verify they fail.**

Run: `go test ./internal/adminmetrics -run 'TestDashboard' -v`

Expected: FAIL because `NewService` and `Dashboard` are not implemented.

- [ ] **Step 3: Implement a single request snapshot and parameterized windows.**

At the start of `Dashboard`, normalize `now.UTC()`, derive `currentStart`, `previousStart`, and use the same `now` in every query. Do not call `time.Now()` inside individual query helpers. Use GORM `Raw` with bind parameters for all boundaries.

- [ ] **Step 4: Implement learning aggregate queries.**

Use the effective fact timestamp:

```sql
COALESCE(submitted_at, presented_at)
```

Compute active minutes, distinct non-null sessions, submitted count, graded accuracy, submitted positive active solve time, hint ratio, completion, and abandonment (`abandoned AND submitted_at IS NULL`) with `NULLIF` denominators. Group daily trends with `date_trunc('day', effective_at AT TIME ZONE 'UTC')` and left-fill missing dates in Go.

- [ ] **Step 5: Implement API and mastery aggregate queries.**

Extract JSONB only after checking type:

```sql
jsonb_typeof(properties_json -> 'duration_ms') = 'number'
```

Then cast `(properties_json ->> 'duration_ms')::double precision`. Count `network_error`, `4xx`, and `5xx` as errors. Compute P95 with `percentile_cont(0.95) WITHIN GROUP`. Count `mastery_status_changed` events and group valid `status_before/status_after` pairs for the transition breakdown.

- [ ] **Step 6: Implement EDA queries and deterministic limits.**

Use fixed solve-time buckets (`0-15s`, `15-30s`, `30-60s`, `60-120s`, `120-300s`, `300s+`) and hint buckets (`0`, `1`, `2`, `3+`). Count missing presented/grade cases within the effective timestamp window. Count `missing_timestamp` facts by `updated_at` because they have no presented/submitted timestamp. Parse `quality_flags_json` with PostgreSQL JSONB array expansion and merge duplicate flag names in Go. Return the top 20 topics by attempts and top 20 mastery transition pairs. Left join `nodes` by `nodes.id::text = topic_id` for names.

- [ ] **Step 7: Assemble summary, comparison, `hasData`, and null-safe response.**

Run the same aggregate shape for current and previous windows, convert nullable SQL scan values to pointers, calculate `deltaPercent` using `percentDelta`, and set `hasData` only when current learning facts or metric telemetry exist. Empty current data must produce zero counts, nil rates/averages, and empty trend/breakdown arrays.

- [ ] **Step 8: Run focused tests.**

Run: `go test ./internal/adminmetrics -run 'TestDashboard' -v`

Expected: PASS with PostgreSQL-backed aggregates, null handling, EDA buckets, and privacy assertions.

- [ ] **Step 9: Commit the analytics service.**

```bash
git add backend/internal/adminmetrics/domain.go backend/internal/adminmetrics/domain_test.go backend/internal/adminmetrics/service.go backend/internal/adminmetrics/service_test.go
git commit -m "feat: aggregate telemetry metrics for admins"
```

### Task 3: Expose the admin-only HTTP endpoint

**Files:**
- Create: `backend/internal/handler/admin_metrics.go`
- Create: `backend/internal/handler/admin_metrics_test.go`
- Modify: `backend/cmd/server/main.go:98-99,239-248`

**Interfaces:**
- Consumes `adminmetrics.Service` through a small interface with `Dashboard(context.Context, time.Time, adminmetrics.Range) (adminmetrics.Dashboard, error)`.
- Produces `NewAdminMetricsHandler(service AdminMetricsService) *AdminMetricsHandler` and `GetTelemetryDashboard(fiber.Ctx) error`.

- [ ] **Step 1: Write failing handler tests.**

Use a fake service that records the range and returns a minimal `Dashboard`. Assert `GET /api/admin/telemetry-dashboard` defaults to `30d`, `?range=7d` forwards `7d`, `?range=14d` returns `400`, and service errors return `500`. For authorization, add a Fiber test middleware that places a signed `jwt.Token` with role `student` in `c.Locals("user")`, then wrap the route with `middleware.RequireRole("admin")` and assert `403`; repeat with role `admin` and assert `200`.

- [ ] **Step 2: Run handler tests to verify they fail.**

Run: `go test ./internal/handler -run TestAdminTelemetry -v`

Expected: FAIL because the handler and route do not exist.

- [ ] **Step 3: Implement the handler.**

Read `c.Query("range", "30d")`, call `adminmetrics.ParseRange`, use `time.Now().UTC()`, and return `c.JSON(result)`. Map invalid range to `400 {"error":"invalid telemetry range"}` and service/database errors to `500 {"error":"unable to load telemetry dashboard"}` without exposing SQL details.

- [ ] **Step 4: Register the dependency and route.**

In `main.go`, construct `adminMetricsService := adminmetrics.NewService(config.DB)`, construct `adminMetricsHandler := handler.NewAdminMetricsHandler(adminMetricsService)`, and register `adminGroup.Get("/telemetry-dashboard", adminMetricsHandler.GetTelemetryDashboard)`. Keep the route inside the existing `RequireRole("admin")` group.

- [ ] **Step 5: Run handler and backend tests.**

Run: `go test ./internal/handler -run TestAdminTelemetry -v` then `go test ./...`.

Expected: focused tests and the complete backend suite PASS.

- [ ] **Step 6: Commit the endpoint.**

```bash
git add backend/internal/handler/admin_metrics.go backend/internal/handler/admin_metrics_test.go backend/cmd/server/main.go
git commit -m "feat: expose admin telemetry dashboard endpoint"
```

### Task 4: Add typed frontend API access and test environment

**Files:**
- Create: `frontend/src/lib/admin-metrics.ts`
- Create: `frontend/src/lib/admin-metrics.test.ts`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/src/test/setup.ts`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Produces `type TelemetryRange = "7d" | "30d" | "90d"`.
- Produces `type TelemetryDashboard` matching the backend JSON contract, including nullable metric values.
- Produces `async function fetchTelemetryDashboard(range: TelemetryRange): Promise<TelemetryDashboard>`.
- Produces pure formatters `formatMetricValue`, `formatPercent`, and `formatDelta` used by the UI.

- [ ] **Step 1: Add the test dependencies and jsdom setup.**

Run from `frontend/`:

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Configure Vitest with `environment: "jsdom"`, `setupFiles: ["./src/test/setup.ts"]`, and include `src/**/*.test.{ts,tsx}`. In setup import `@testing-library/jest-dom/vitest`.

- [ ] **Step 2: Write failing API/formatter tests.**

Mock `global.fetch` and assert:

```ts
it("requests the selected range", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ range: "7d" })));
  await fetchTelemetryDashboard("7d");
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/admin/telemetry-dashboard?range=7d"), expect.any(Object));
});

it("formats null and deltas safely", () => {
  expect(formatMetricValue(null, "seconds")).toBe("—");
  expect(formatPercent(0.734)).toBe("73.4%");
  expect(formatDelta(null)).toBe("—");
});
```

- [ ] **Step 3: Run the focused frontend tests to verify they fail.**

Run: `npm test -- --run src/lib/admin-metrics.test.ts`

Expected: FAIL because the adapter, types, and formatters do not exist.

- [ ] **Step 4: Implement the typed adapter and formatters.**

Call existing `apiFetch` with `/admin/telemetry-dashboard?range=${range}` and cast the response to `TelemetryDashboard`; do not modify the shared `apiFetch` return behavior. Format rates as one decimal percentage, durations using seconds or milliseconds as requested, counts with `vi-VN`, and null as `—`.

- [ ] **Step 5: Run focused tests.**

Run: `npm test -- --run src/lib/admin-metrics.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the typed API layer.**

```bash
git add frontend/src/lib/admin-metrics.ts frontend/src/lib/admin-metrics.test.ts frontend/vitest.config.ts frontend/src/test/setup.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: add typed telemetry dashboard client"
```

### Task 5: Build the admin dashboard component

**Files:**
- Create: `frontend/src/app/admin/components/TelemetryDashboard.tsx`
- Create: `frontend/src/app/admin/components/TelemetryDashboard.test.tsx`

**Interfaces:**
- Consumes `fetchTelemetryDashboard`, `TelemetryDashboard`, and formatter functions from Task 4.
- Produces a client component `<TelemetryDashboard />` with no required props.

- [ ] **Step 1: Write failing component tests.**

Mock `fetchTelemetryDashboard` and use Testing Library to assert:

```tsx
it("loads the default 30-day dashboard and changes range", async () => {
  vi.mocked(fetchTelemetryDashboard).mockResolvedValue(fixture("30d"));
  render(<TelemetryDashboard />);
  expect(await screen.findByText("30 ngày")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "7 ngày" }));
  expect(fetchTelemetryDashboard).toHaveBeenLastCalledWith("7d");
});

it("shows empty state without fake charts", async () => {
  vi.mocked(fetchTelemetryDashboard).mockResolvedValue(emptyFixture());
  render(<TelemetryDashboard />);
  expect(await screen.findByText(/Chưa đủ dữ liệu/i)).toBeInTheDocument();
});

it("shows retry on API error", async () => {
  vi.mocked(fetchTelemetryDashboard).mockRejectedValueOnce(new Error("offline"));
  render(<TelemetryDashboard />);
  expect(await screen.findByRole("button", { name: /Thử lại/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run component tests to verify they fail.**

Run: `npm test -- --run src/app/admin/components/TelemetryDashboard.test.tsx`

Expected: FAIL because the component is not present.

- [ ] **Step 3: Implement loading, fetch, range, refresh, error, and empty states.**

Use `useState<TelemetryRange>("30d")`, `useEffect` keyed by range, an incrementing request guard so an older response cannot overwrite a newer range, and a refresh button that re-fetches the current range. Keep previous data dimmed during a range change. Render `—` for nullable values and “Chưa đủ dữ liệu trong khoảng thời gian này” when `hasData` is false.

- [ ] **Step 4: Implement KPI cards and chart.**

Use existing `ChartContainer`, `ChartTooltip`, `LineChart`, and `Line` from Recharts. Keep one selected metric at a time (`activeLearningMinutes`, `accuracyRate`, `avgSolveTimeSeconds`, `hintsPerQuestion`, `apiErrorRate`, or `apiP95LatencyMs`) so units share one axis. Render the daily `trends` array, with a metric selector and accessible labels.

- [ ] **Step 5: Implement EDA panels.**

Render timing P50/P95/outliers, solve-time and hint distributions, quality flags, source counts, mastery transition pairs, and a 20-row topic table. Add explicit empty labels for each empty breakdown and stable sorting controls for attempts, accuracy, solve time, and hints.

- [ ] **Step 6: Run component tests.**

Run: `npm test -- --run src/app/admin/components/TelemetryDashboard.test.tsx`

Expected: PASS for range switching, empty state, retry, KPI rendering, and EDA sections.

- [ ] **Step 7: Commit the dashboard component.**

```bash
git add frontend/src/app/admin/components/TelemetryDashboard.tsx frontend/src/app/admin/components/TelemetryDashboard.test.tsx
git commit -m "feat: add admin telemetry metrics dashboard"
```

### Task 6: Integrate the dashboard into the admin page and verify the feature

**Files:**
- Modify: `frontend/src/app/admin/page.tsx`
- Create: `frontend/src/app/admin/page.test.tsx`

**Interfaces:**
- Consumes `<TelemetryDashboard />` from Task 5.
- Produces an admin page section headed “Metrics & EDA” below the existing system status panel.

- [ ] **Step 1: Write the integration assertion.**

Mock `apiFetch` for the existing teachers/classrooms/subjects/student requests and mock `TelemetryDashboard` as a marker component. Render `AdminDashboard`, then assert the `Metrics & EDA` heading and marker are present without depending on a server.

- [ ] **Step 2: Run the integration test to verify it fails.**

Run: `npm test -- --run src/app/admin/page.test.tsx`

Expected: FAIL because the page does not import or render the new section.

- [ ] **Step 3: Integrate without changing existing admin stats behavior.**

Import `TelemetryDashboard`, add a section wrapper after the current system panel, and keep the existing teachers/classrooms/students/subjects loading logic unchanged. Do not add synthetic fallback data.

- [ ] **Step 4: Run frontend checks.**

Run from `frontend/`:

```bash
npm test -- --run
npx tsc --noEmit
npm run build
```

Expected: all Vitest tests PASS, TypeScript exits 0, and Next production build completes successfully.

- [ ] **Step 5: Run backend checks and inspect the route.**

Run from `backend/`:

```bash
go test ./...
go vet ./...
```

Expected: PASS. Confirm the startup route log contains `GET /api/admin/telemetry-dashboard` and that the handler remains under the admin role group.

- [ ] **Step 6: Perform manual UI verification.**

Start the backend and frontend with the repository’s normal development commands, sign in as an admin, and verify `7/30/90 ngày`, refresh, chart metric selection, empty state, retry state, responsive layout, and absence of raw IDs in the browser network response.

- [ ] **Step 7: Commit integration and verification notes.**

```bash
git add frontend/src/app/admin/page.tsx frontend/src/app/admin/page.test.tsx
git commit -m "feat: integrate telemetry dashboard into admin overview"
```

## Self-Review Checklist

- [ ] Every spec metric has a backend query task and a frontend rendering task.
- [ ] Current/previous UTC windows and null denominator semantics are explicit.
- [ ] EDA includes lifecycle quality, timing outliers/percentiles, hint/solve distributions, topic/source breakdowns, and mastery transitions.
- [ ] Privacy, admin authorization, parameterized SQL, and no-mock behavior are tested.
- [ ] All files have concrete paths and all test steps include commands plus expected outcomes.
- [ ] Every step contains a concrete file, interface, test command, and expected result.
