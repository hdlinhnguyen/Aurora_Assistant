# User Metrics Telemetry P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pseudonymous, event-level telemetry foundation that records reliable student question timing, attempts, hints, grading, BKT decisions, and learning-path decisions without placing sensitive content in analytics storage.

**Architecture:** The Go backend owns the event contract, pseudonymization, privacy validation, transactional outbox, raw event store, and authoritative business events. Next.js sends batched browser events to a protected collector and maintains a local retry queue. The existing Go-to-Python mastery and learning-path gateway records decision events at the Go boundary, so Python request latency and response metadata are captured without adding an analytics dependency to the Python critical path.

**Tech Stack:** Go, Fiber v3, GORM, PostgreSQL JSONB, Go `crypto/hmac`, Next.js/React/TypeScript, browser `localStorage`, Python FastAPI/Pydantic, pytest, Vitest.

## Global Constraints

- Use pseudonymous actor IDs generated with HMAC; never put names, emails, tokens, raw chat, raw free-text answers, or paper images in telemetry properties.
- Event timestamps are UTC; the server timestamp is authoritative for submissions and grading.
- The telemetry path is fail-open for learning actions; optional telemetry failure must not fail a learning request.
- Events are immutable and idempotent by `event_id`; schema and metric definitions are versioned.
- Active time excludes hidden/unfocused time and idle periods over 30 seconds.
- Raw interaction retention is 90 days; derived facts default to 13 months; retention classes are stored with every event.
- Do not log keystrokes, pointer movement, or raw answer text; aggregate answer changes as a count.
- Run commands from the repository root unless a task explicitly changes directory.
- Preserve unrelated worktree changes, including the existing untracked `.codegraph/` directory.

---

### Task 1: Define telemetry contracts and persistence models

**Files:**
- Create: `backend/internal/telemetry/domain.go`
- Create: `backend/internal/telemetry/schema.go`
- Create: `backend/internal/telemetry/domain_test.go`
- Modify: `backend/internal/model/models.go`
- Modify: `backend/internal/config/db.go:74-108`
- Test: `backend/internal/model/telemetry_models_test.go`

**Interfaces:**
- Consumes: authenticated actor UUIDs and event payloads from the collector and domain publishers.
- Produces: `telemetry.Event`, `telemetry.Batch`, `telemetry.OutboxRecord`, `model.TelemetryEvent`, and `model.TelemetryOutbox` used by Tasks 2-4.

- [ ] **Step 1: Write failing contract tests**

Add tests in `backend/internal/telemetry/domain_test.go` that require:

```go
func TestValidateEventRejectsSensitiveProperties(t *testing.T) {

	event := Event{
		EventID: "4d2a4a84-5c64-4e21-90ce-78b1cf5d9a3a",
		Name:    "question_answer_submitted",
		SchemaVersion: 1,
		OccurredAt: time.Date(2026, 7, 18, 3, 0, 0, 0, time.UTC),
		Properties: map[string]any{"answer_text": "raw student text"},
	}
	if err := ValidateEvent(event); !errors.Is(err, ErrSensitiveProperty) {
		t.Fatalf("expected sensitive-property error, got %v", err)
	}
}

```

Add `TestEventRequiresUUIDAndUTC` with table cases for malformed `event_id`, zero `occurred_at`, and timestamps whose location is not UTC. Add `TestBatchPreservesDuplicateIDsForPersistenceReporting` and assert the validator keeps both events so the persistence layer can report one accepted event and one duplicate.

- [ ] **Step 2: Run the failing contract tests**

Run: `go test ./internal/telemetry -run 'TestValidateEvent|TestEventRequires|TestBatch' -v`  
Expected: FAIL because the telemetry package and validators do not exist.

- [ ] **Step 3: Implement the contract types and validator**

Define `Event` with `EventID`, `Name`, `SchemaVersion`, `OccurredAt`, optional `SessionID`, `AttemptID`, `ClassID`, `TopicID`, `CorrelationID`, `AppVersion`, `ConsentState`, `RetentionClass`, `Source`, and `Properties map[string]any`. Define `Batch` with at most 100 events. Define a registry of P0 names and required properties:

```go
var AllowedEventNames = map[string]EventRule{
	"learning_session_started":       {Required: []string{"session_id"}},
	"question_presented":             {Required: []string{"attempt_id", "question_id", "topic_id"}},
	"question_answer_submitted":      {Required: []string{"attempt_id", "question_id", "selected_option", "active_time_ms"}},
	"question_graded":                {Required: []string{"attempt_id", "question_id", "is_correct"}},
	"hint_requested":                 {Required: []string{"attempt_id", "topic_id", "hint_level"}},
	"hint_rendered":                  {Required: []string{"attempt_id", "topic_id", "hint_level"}},
	"mastery_calculated":             {Required: []string{"subject", "topic_count", "model_version"}},
	"learning_path_generated":         {Required: []string{"thread_id", "path_count", "model_version"}},
	"learning_path_approved":          {Required: []string{"thread_id", "approved"}},
	"telemetry_rejected":              {Required: []string{"reason"}},
}
```

Reject unknown P0 event names, future schema versions, missing required properties, invalid UUIDs, non-UTC timestamps, negative durations, and denylisted keys (`email`, `name`, `token`, `message`, `answer_text`, `content`, `image`). Keep `properties` size below 16 KiB and the batch below 256 KiB.

- [ ] **Step 4: Add GORM persistence models**

Add `model.TelemetryEvent` and `model.TelemetryOutbox` with JSONB properties/payload, unique `EventID`, source, retention class, attempts, status, and timestamps. Use `gorm.io/datatypes.JSON`. Do not expose these models through API JSON tags.

- [ ] **Step 5: Register models in AutoMigrate**

Add both models to `backend/internal/config/db.go` immediately after existing activity/mastery models. Add explicit indexes/unique constraints for event ID, event name plus occurred time, actor ID plus occurred time, session ID, outbox status plus next-attempt time.

- [ ] **Step 6: Run contract and model tests**

Run: `go test ./internal/telemetry ./internal/model ./internal/config`  
Expected: PASS, or the repository's existing PostgreSQL test setup is skipped when no test database is configured.

- [ ] **Step 7: Commit the contract layer**

```bash
git add backend/internal/telemetry backend/internal/model/models.go backend/internal/config/db.go
git commit -m "feat: add telemetry event contracts and storage models"
```

### Task 2: Implement pseudonymous IDs, privacy validation, and collector endpoint

**Files:**
- Create: `backend/internal/telemetry/pseudonym.go`
- Create: `backend/internal/telemetry/pseudonym_test.go`
- Create: `backend/internal/telemetry/collector.go`
- Create: `backend/internal/telemetry/collector_test.go`
- Modify: `backend/cmd/server/main.go:81-92,223-228`

**Interfaces:**
- Consumes: `telemetry.Batch` from browser clients and JWT `userID`/`role` locals.
- Produces: `POST /api/telemetry/events`, which returns accepted/rejected counts and enqueues valid events.

- [ ] **Step 1: Write HMAC and collector tests**

Cover stable pseudonyms, key rotation behavior, authenticated actor binding, duplicate event IDs, invalid schema, sensitive properties, payload limits, and fail-open persistence errors:

```go
func TestPseudonymIsStableAndDoesNotExposeUUID(t *testing.T) {
	actorID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	first := Pseudonym([]byte("01234567890123456789012345678901"), "v1", actorID)
	second := Pseudonym([]byte("01234567890123456789012345678901"), "v1", actorID)
	if first != second {
		t.Fatalf("pseudonym changed: %q != %q", first, second)
	}
	if strings.Contains(first, actorID.String()) || len(first) != 35 {
		t.Fatalf("unsafe pseudonym %q", first)
	}
}
```

Add collector tests using a Fiber test app and `newTelemetryTestDB(t)`: a client `actor_id` field is ignored and replaced with the authenticated HMAC ID; two identical event IDs produce `accepted=1, duplicates=1`; invalid schema produces a reason code without echoing properties; a database failure returns a controlled 503 without exposing student content.

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/telemetry -run 'TestPseudonym|TestCollect' -v`  
Expected: FAIL because the HMAC publisher and Fiber handler do not exist.

- [ ] **Step 3: Implement pseudonymization**

Read `TELEMETRY_HMAC_KEY` at startup and fail startup only when telemetry is configured as required. Use HMAC-SHA256 over the UUID string and encode the first 32 hexadecimal characters. Never accept `actor_id` from a browser payload. Add a key version to the derived ID context so future rotations can coexist.

- [ ] **Step 4: Implement the collector handler**

Define `NewCollector(db *gorm.DB, publisher Publisher, clock Clock) fiber.Handler`. Read `c.Locals("userID")` and `c.Locals("user")`, bind a batch, replace any actor fields, set role from JWT, validate each event, and call the publisher. Return:

```json
{"accepted":2,"duplicates":1,"rejected":0}
```

Use HTTP 202 for a valid batch with partial rejection, 400 for malformed JSON/oversized batches, and 401 for missing authentication. Error responses contain only reason codes, never property values.

- [ ] **Step 5: Register the protected endpoint**

Construct the collector after `config.ConnectDB()` and add `api.Post("/telemetry/events", collector.Handle)` beside the other protected routes. Add `TelemetryHMACKey` to startup configuration without changing existing auth behavior.

- [ ] **Step 6: Run handler tests**

Run: `go test ./internal/telemetry ./internal/handler ./internal/middleware`  
Expected: PASS.

- [ ] **Step 7: Commit the collector**

```bash
git add backend/internal/telemetry backend/cmd/server/main.go backend/internal/middleware/auth.go
git commit -m "feat: add protected telemetry collector"
```

### Task 3: Add the transactional outbox and asynchronous raw-event writer

**Files:**
- Create: `backend/internal/telemetry/publisher.go`
- Create: `backend/internal/telemetry/publisher_test.go`
- Create: `backend/internal/telemetry/worker.go`
- Create: `backend/internal/telemetry/worker_test.go`
- Modify: `backend/cmd/server/main.go:66-92,346-353`

**Interfaces:**
- Consumes: validated events from Task 2 and domain events from Task 4.
- Produces: `Publisher.Publish(ctx, event)`, `Publisher.PublishTx(ctx, tx, event)`, and a worker that copies outbox payloads into immutable `telemetry_events`.

- [ ] **Step 1: Write outbox tests**

Test atomic transaction behavior, idempotent `event_id`, exponential retry, dead-letter after 8 attempts, and shutdown cancellation:

```go
func TestPublishIsIdempotentByEventID(t *testing.T) {
	db := newTelemetryTestDB(t)
	publisher := NewPublisher(db, fixedClock())
	event := validQuestionPresentedEvent()
	if err := publisher.Publish(context.Background(), event); err != nil {
		t.Fatal(err)
	}
	if err := publisher.Publish(context.Background(), event); err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := db.Model(&model.TelemetryOutbox{}).Where("event_id = ?", event.EventID).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("expected one outbox row, got %d", count)
	}
}
```

Add transaction rollback coverage by returning a sentinel error from `db.Transaction`; add worker coverage that runs `ProcessBatch` twice and asserts one raw event; force eight insert failures and assert the outbox status becomes `dead_letter`.

- [ ] **Step 2: Run failing tests**

Run: `go test ./internal/telemetry -run 'TestPublish|TestWorker' -v`  
Expected: FAIL until publisher and worker are implemented.

- [ ] **Step 3: Implement publisher interfaces**

`PublishTx` inserts a JSON payload into `telemetry_outbox` with `status=pending`; duplicate `event_id` is treated as an accepted duplicate. `Publish` uses a short transaction. The publisher must not write `telemetry_events` directly.

- [ ] **Step 4: Implement the worker loop**

Implement `Worker.Run(ctx)` with a 500 ms polling interval, batch size 100, `FOR UPDATE SKIP LOCKED`, and leases lasting 30 seconds. Successful writes insert into `telemetry_events` with `ON CONFLICT (event_id) DO NOTHING`, then mark the outbox row delivered. Failures increment attempts and set `next_attempt_at` using `min(2^attempts seconds, 5 minutes)`. After 8 failures mark `dead_letter` and emit an internal `telemetry_rejected` metric without including payload content.

- [ ] **Step 5: Start and stop the worker**

Start one worker after handlers are constructed in `main.go`. Add a context canceled by an OS signal and wait for the worker before process exit. Keep Fiber request handling available when the worker cannot connect; worker failures are logged as structured reason codes.

- [ ] **Step 6: Run package and race tests**

Run: `go test ./internal/telemetry -race -v`  
Expected: PASS with no data races.

- [ ] **Step 7: Commit the outbox**

```bash
git add backend/internal/telemetry backend/cmd/server/main.go
git commit -m "feat: add asynchronous telemetry outbox worker"
```

### Task 4: Instrument authoritative student and teacher domain events

**Files:**
- Modify: `backend/internal/service/tutor_service.go:467-610`
- Modify: `backend/internal/handler/tutor.go:637-685,1477-1550`
- Create: `backend/internal/service/tutor_telemetry_test.go`
- Create: `backend/internal/handler/tutor_telemetry_test.go`
- Modify: `backend/internal/handler/mastery.go` at recalculation handlers
- Modify: `backend/internal/mastery/service.go:60-103`
- Modify: `backend/internal/handler/exam.go` at internal callback handlers
- Modify: `backend/internal/exam/callbacks.go`

**Interfaces:**
- Consumes: `telemetry.Publisher` injected into tutor, mastery, and exam services.
- Produces: authoritative `learning_session_started`, `question_answer_submitted`, `question_graded`, `hint_requested`, `mastery_calculated`, `mastery_status_changed`, `exam_submitted`, and `exam_graded` events.

- [ ] **Step 1: Write domain-event tests before edits**

Use a fake publisher that records events. Assert that:

```go
func TestSubmitAnswerPublishesSubmissionAndGrade(t *testing.T) {
	publisher := &recordingPublisher{}
	service, studentID, nodeID, questionID := newTutorTelemetryFixture(t, publisher)
	correct, _, err := service.SubmitAnswer(studentID, nodeID, questionID, 0)
	if err != nil || !correct {
		t.Fatalf("submit answer: correct=%v err=%v", correct, err)
	}
	if publisher.Names() != "question_answer_submitted,question_graded" {
		t.Fatalf("unexpected events %s", publisher.Names())
	}
	for _, event := range publisher.Events {
		if _, exists := event.Properties["content"]; exists {
			t.Fatal("question content leaked into telemetry")
		}
	}
}
```

Add focused tests asserting hint failures publish no success event, mastery recalculation publishes before/after status counts without evidence text, and exam callbacks publish server-owned exam/submission identifiers.

- [ ] **Step 2: Run focused tests to verify the missing publisher wiring**

Run: `go test ./internal/service ./internal/mastery ./internal/exam ./internal/handler -run 'Telemetry|SubmitAnswer|Hint|Mastery|Grading' -v`  
Expected: FAIL because service constructors do not accept a publisher and events are not emitted.

- [ ] **Step 3: Inject the publisher without changing public behavior**

Add a `telemetry.Publisher` field to the relevant services and constructor parameters. Use a no-op publisher in existing unit-test constructors where the test does not assert events. Update `main.go` to pass the real publisher.

- [ ] **Step 4: Make answer submission authoritative and transactional**

Wrap the existing `SubmitAnswer` state update and `ActivityLog` write in one transaction. Publish `question_answer_submitted` with question ID, node/topic ID, selected option index, attempt index if available, and client timing fields passed through a request context only when a server endpoint receives them. Publish `question_graded` with correctness and difficulty. Do not place `Question.Content`, the correct option, or answer text in properties.

- [ ] **Step 5: Emit hint and cant-do events**

Publish `hint_requested` before the Python call with topic ID, press count, and chosen misconception label only. Publish `hint_rendered` only after a successful response with hint level and generation latency. Publish `hint_generation_failed` with status code/reason code. Emit `click_cant_do` from the existing service path.

- [ ] **Step 6: Emit mastery and exam events**

At the Go mastery gateway boundary, publish request and completed decision summaries containing topic count, evidence count, status transition counts, confidence aggregates, model/config version, and latency. At exam internal callbacks, publish submission/grading lifecycle outcomes from server-owned IDs and counts. Do not duplicate every existing `ActivityLog` row as a telemetry event.

- [ ] **Step 7: Run focused tests and the backend suite**

Run: `go test ./internal/service ./internal/mastery ./internal/exam ./internal/handler -v`  
Expected: PASS. Then run `go test ./...` and record any pre-existing failures separately.

- [ ] **Step 8: Commit domain instrumentation**

```bash
git add backend/internal/service backend/internal/mastery backend/internal/exam backend/internal/handler backend/cmd/server/main.go
git commit -m "feat: emit authoritative learning telemetry events"
```

### Task 5: Build the browser telemetry SDK with active-time state and offline batching

**Files:**
- Create: `frontend/src/lib/telemetry.ts`
- Create: `frontend/src/lib/telemetry.test.ts`
- Modify: `frontend/src/lib/api.ts:1-90`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Consumes: browser event metadata from tutor and teacher components.
- Produces: `telemetry.startSession`, `telemetry.presentQuestion`, `telemetry.recordAnswerChange`, `telemetry.requestHint`, `telemetry.submitAnswer`, `telemetry.endAttempt`, and a `QuestionTimer` state machine.

- [ ] **Step 1: Add the test runner and write failing timing tests**

Add `vitest` and a `test` script. Test focus/blur, visibility, idle after 30 seconds, resume, duplicate submit protection, local queue retry, and payload denylist:

```ts
it("counts only focused visible active milliseconds", () => {
  const timer = new QuestionTimer({ now: fakeClock.now, idleAfterMs: 30_000 });
  timer.present("attempt-1");
  fakeClock.advanceBy(10_000);
  timer.setFocused(false);
  fakeClock.advanceBy(20_000);
  timer.setFocused(true);
  fakeClock.advanceBy(5_000);
  expect(timer.snapshot().activeTimeMs).toBe(15_000);
});

it("does not serialize answer text or email", () => {
  expect(() => sanitizeProperties({ answer_text: "student response" }))
    .toThrowError("sensitive_property");
  expect(() => sanitizeProperties({ email: "student@example.test" }))
    .toThrowError("sensitive_property");
});
```

- [ ] **Step 2: Run frontend tests to verify they fail**

Run: `npm --prefix frontend test -- --run`  
Expected: FAIL because the telemetry module and script do not exist.

- [ ] **Step 3: Implement the event queue and transport**

Implement a singleton client that stores at most 200 events in `localStorage` under `aurora_telemetry_queue_v1`, batches up to 20 events, sends `POST /telemetry/events` through `apiFetch`, and retries with bounded backoff. Generate UUID event IDs with `crypto.randomUUID()`. On `401`, clear only the telemetry queue for the expired actor; do not redirect from the SDK.

- [ ] **Step 4: Implement the active-time state machine**

`QuestionTimer` records presentation time, focused/visible state, idle transitions, answer changes, hint time, and submission. Attach listeners only while an attempt is active; remove them on completion. Clamp negative/greater-than-24-hour durations and mark an attempt abandoned when explicitly ended without submission.

- [ ] **Step 5: Add API failure instrumentation without recursion**

In `apiFetch`, emit an `api_request_completed` event after a response with endpoint template, method, status class, duration, retry count, and request correlation ID. Never include request bodies, authorization headers, response bodies, or query values containing user content. Add a guard so telemetry requests do not emit telemetry about themselves.

- [ ] **Step 6: Run frontend unit tests and lint**

Run: `npm --prefix frontend test -- --run` and `npm --prefix frontend run lint`  
Expected: PASS. If the repository's Next lint command is incompatible with the installed Next version, run `npx eslint src --max-warnings=0` and record the result.

- [ ] **Step 7: Commit the browser SDK**

```bash
git add frontend/src/lib/telemetry.ts frontend/src/lib/telemetry.test.ts frontend/src/lib/api.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: add browser telemetry queue and active timers"
```

### Task 6: Instrument the student tutor and teacher learning-path UI

**Files:**
- Modify: `frontend/src/app/tutor/page.tsx:120-180,360-410,520-735`
- Modify: `frontend/src/app/teacher/page.tsx` at learning-path generation, approval, move, and delete handlers
- Modify: `frontend/src/app/teacher/components/LearningPathTab.tsx` only when a handler boundary is needed
- Test: `frontend/src/lib/telemetry.test.ts` for component-facing calls

**Interfaces:**
- Consumes: Task 5 telemetry SDK and existing question/node state.
- Produces: `learning_session_started`, `topic_opened`, `question_presented`, `question_answer_changed`, `question_answer_submitted`, `question_skipped`, `question_revisited`, `hint_requested`, `hint_viewed`, `lesson_abandoned`, `learning_path_generated`, `path_step_moved`, `path_step_deleted`, and `learning_path_approved`.

- [ ] **Step 1: Add session lifecycle instrumentation**

Create one session ID when the tutor page starts a learning session. Emit `learning_session_started` after the initial authenticated data load succeeds, `topic_opened` when `selectedNode` changes, and `learning_session_ended` on page unload or explicit logout using `navigator.sendBeacon` only for the final small event.

- [ ] **Step 2: Wire question presentation and timer lifecycle**

When `filteredQuestions[currentQIndex]` changes, end the previous attempt as abandoned or revisited and call `presentQuestion` with question ID, topic ID, difficulty, and a new attempt ID. Reset the timer when a new question is selected. Do not include rendered question content.

- [ ] **Step 3: Wire answer changes and submission**

Increment the SDK counter when `selectedOption` changes, call `submitAnswer` immediately before the existing API request, and complete the timer with server response status and correctness after the response. Preserve the existing UI behavior and adaptive downgrade logic.

- [ ] **Step 4: Wire hints and cant-do**

Call `requestHint` before `/student/hints`, `hint_viewed` after a non-empty response is rendered, and a failure event in the catch path. Include press count, topic ID, and attempt ID only. Mark current timer hint time around the rendered hint duration.

- [ ] **Step 5: Wire teacher path actions**

Emit generation start/completion/failure around the existing teacher API calls. Emit step move/delete with student path ID, step index, direction, and resulting step count. Emit approval with thread ID, approved boolean, note length rather than note content, and path count.

- [ ] **Step 6: Run frontend tests/build**

Run: `npm --prefix frontend test -- --run` and `npm --prefix frontend run build`  
Expected: PASS with no hydration errors introduced by browser-only telemetry code.

- [ ] **Step 7: Commit UI instrumentation**

```bash
git add frontend/src/app/tutor/page.tsx frontend/src/app/teacher/page.tsx frontend/src/app/teacher/components/LearningPathTab.tsx frontend/src/lib/telemetry.test.ts
git commit -m "feat: instrument tutor and learning path interactions"
```

### Task 7: Add learning-path decision metadata and BKT golden tests

**Files:**
- Modify: `learning-path/src/learning_path/mastery_api.py:20-65`
- Modify: `learning-path/src/learning_path/api.py:90-190`
- Create: `learning-path/src/learning_path/telemetry.py`
- Create: `learning-path/tests/test_telemetry_metadata.py`
- Modify: `learning-path/tests/test_mastery_api.py`
- Modify: `learning-path/tests/test_api.py`

**Interfaces:**
- Consumes: existing BKT output and learning-path response state.
- Produces: versioned, non-sensitive `decision_metadata` in internal response fields that the Go gateway can publish, plus deterministic timing/model metadata for tests.

- [ ] **Step 1: Write failing Python tests**

Require metadata to include event name, model/config version, topic/path counts, evidence counts, and latency fields while excluding raw evidence content:

```python
def test_mastery_metadata_is_summary_only():
    response = calculate_mastery(body)
    assert response.decision_metadata["model_version"]
    assert "raw_quiz" not in response.decision_metadata
    assert "content" not in str(response.decision_metadata)

def test_learning_path_response_has_generation_summary(client):
    payload = client.post("/learning-path", json=body).json()
    assert payload["decision_metadata"]["path_count"] >= 0
```

- [ ] **Step 2: Run failing Python tests**

Run: `uv run pytest learning-path/tests/test_telemetry_metadata.py learning-path/tests/test_mastery_api.py learning-path/tests/test_api.py -q`  
Expected: FAIL because response models and metadata helpers do not exist.

- [ ] **Step 3: Implement metadata models**

Add Pydantic fields with defaults that preserve existing response compatibility. Use `TELEMETRY_MODEL_VERSION` and `BKT_CONFIG_VERSION` environment values, and include only counts, aggregate confidence/mastery summaries, status transition counts, path count, step count, thread ID, and elapsed milliseconds. Do not include raw request objects or generated prose.

- [ ] **Step 4: Add Python tests for stable BKT summaries**

Use the existing deterministic BKT fixtures to assert the same evidence produces the same state summary and a changed config version changes only metadata. Assert all probability and confidence values remain bounded.

- [ ] **Step 5: Run the full learning-path suite**

Run: `uv run pytest learning-path/tests -q`  
Expected: PASS.

- [ ] **Step 6: Commit Python metadata**

```bash
git add learning-path/src/learning_path learning-path/tests
git commit -m "feat: expose versioned learning decision metadata"
```

### Task 8: Create derived fact tables, reconciliation queries, and telemetry-quality checks

**Files:**
- Create: `backend/internal/telemetry/derive.go`
- Create: `backend/internal/telemetry/derive_test.go`
- Create: `backend/internal/telemetry/sql.go`
- Create: `backend/internal/telemetry/sql_test.go`
- Modify: `backend/internal/config/db.go` to register derived models/indexes
- Create: `backend/cmd/telemetry_rebuild/main.go`
- Create: `docs/telemetry-p0-runbook.md`

**Interfaces:**
- Consumes: immutable `telemetry_events` from Task 3.
- Produces: `learning_session_facts`, `question_attempt_facts`, `hint_usage_facts`, `mastery_decision_facts`, `learning_path_facts`, daily aggregates, reconciliation counts, and quality-health output.

- [ ] **Step 1: Write derived-fact tests**

Use a fixed event fixture to assert one question attempt contains active time, idle time, hint count, submissions, final correctness, and abandonment. Assert replay produces identical facts and that missing lifecycle events increment quality counters rather than fabricating values.

- [ ] **Step 2: Run failing derive tests**

Run: `go test ./internal/telemetry -run 'TestDerive|TestRebuild|TestReconcile' -v`  
Expected: FAIL because fact models and rebuild functions do not exist.

- [ ] **Step 3: Add fact models and idempotent rebuild functions**

Define `RebuildRange(ctx, db, from, to)` and `ReconcileRange(ctx, db, from, to)`. Use event IDs and attempt/session IDs as stable keys. Compute active time from client fields only after bounds checks, group hint events by attempt, and join server grading events by attempt/question IDs. Store `quality_flags` for missing presented, duplicate submit, clock skew, out-of-order, or invalid duration.

- [ ] **Step 4: Add SQL/index support**

Create indexes for daily rebuild ranges and queries used by reconciliation. Use explicit `ON CONFLICT DO UPDATE` so a replay repairs a fact without duplicating it. Add a 90-day raw-event purge function that deletes only `retention_class=interaction` rows older than the cutoff.

- [ ] **Step 5: Add the rebuild command and runbook**

`go run ./cmd/telemetry_rebuild --from 2026-07-18T00:00:00Z --to 2026-07-19T00:00:00Z` rebuilds facts, prints accepted/rejected/duplicate/missing-lifecycle counts, and exits nonzero when database connection or schema validation fails. The runbook documents worker lag, dead-letter replay, purge, rebuild, and privacy deletion procedures.

- [ ] **Step 6: Run derive, integration, and race tests**

Run: `go test ./internal/telemetry -race -v` and `go test ./...`  
Expected: PASS, with integration tests using the repository's isolated PostgreSQL schema helper where available.

- [ ] **Step 7: Commit derived facts and runbook**

```bash
git add backend/internal/telemetry backend/internal/config/db.go backend/cmd/telemetry_rebuild docs/telemetry-p0-runbook.md
git commit -m "feat: add telemetry facts and reconciliation tooling"
```

### Task 9: End-to-end verification and release checks

**Files:**
- Create: `backend/internal/telemetry/e2e_test.go`
- Create: `frontend/scripts/telemetry-smoke.mjs`
- Create: `docs/telemetry-p0-release-checklist.md`
- Modify: `backend/.env.example`
- Create: `learning-path/.env.example`

**Interfaces:**
- Consumes: all P0 producers, collector, worker, and derive command.
- Produces: a repeatable smoke test and release checklist proving data correctness, privacy, fail-open behavior, and operational health.

- [ ] **Step 1: Write the end-to-end scenario**

Use a test user to perform: start session, present a question, wait through focus/idle transitions, request two hints, submit an answer, recalculate mastery, generate a learning path, edit a step, and approve it. Assert that raw events and facts contain the expected IDs/counts and no prohibited property names.

- [ ] **Step 2: Run the scenario before the final fixes**

Run: `go test ./internal/telemetry -run TestP0Journey -v` and `node frontend/scripts/telemetry-smoke.mjs`  
Expected: the test identifies any missing producer or contract mismatch before release.

- [ ] **Step 3: Add configuration and privacy checklist**

Document `TELEMETRY_HMAC_KEY`, retention settings, batch limits, worker interval, dead-letter threshold, consent behavior, and the minimum cohort size. Include a checklist confirming no raw content, no client-controlled actor identity, and no analytics failure on answer submission.

- [ ] **Step 4: Run the complete verification set**

Run:

```bash
go test ./...
go vet ./...
uv run pytest learning-path/tests -q
npm --prefix frontend test -- --run
npm --prefix frontend run build
git diff --check
```

Expected: all commands pass; any pre-existing unrelated failure is recorded in the release checklist rather than hidden.

- [ ] **Step 5: Commit release verification artifacts**

```bash
git add backend/internal/telemetry frontend/scripts docs/telemetry-p0-release-checklist.md backend/.env.example learning-path/.env.example
git commit -m "test: verify telemetry p0 release flow"
```

## Self-Review Checklist

- **Spec coverage:** Tasks 1-3 cover contract, pseudonyms, privacy, storage, outbox, retry, and fail-open ingestion; Task 4 covers authoritative student, hint, mastery, and grading events; Tasks 5-6 cover active timing, offline queue, and UI interactions; Task 7 covers BKT/learning-path decision metadata; Task 8 covers facts, retention, reconciliation, and data quality; Task 9 covers end-to-end verification and release operations.
- **No placeholders:** Every task names concrete files, interfaces, commands, expected outcomes, and commit boundaries.
- **Type consistency:** `telemetry.Publisher`, `Event`, `Batch`, `QuestionTimer`, `RebuildRange`, and `ReconcileRange` are introduced before their consumers.
- **Scope:** This is the independently testable P0 foundation. Chat pedagogical labels, Feynman/First Principles metrics, experimentation, calibration dashboards, and causal analysis remain P1/P2 plans.
