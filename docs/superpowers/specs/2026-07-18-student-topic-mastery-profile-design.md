# Student Topic Mastery Profile Design

## 1. Goal

Persist the current Bayesian Knowledge Tracing (BKT) state for every
student-topic pair and expose it as a simple competency profile on the existing
knowledge tree.

- Teachers select a student from their class and view that student's profile.
- Students can view only their own profile.
- Every topic node shows the current BKT mastery percentage.
- Selecting a topic opens its current details and mastery history.

This feature extends the existing personalized learning-path engine. It does
not replace the learning-path planner or introduce class-average mastery on
knowledge-tree nodes.

## 2. Ownership and Architecture

The Go backend owns authentication, authorization, PostgreSQL persistence, and
the public HTTP API. The Python `learning-path` service remains the calculation
engine for evidence calibration and BKT.

The data flow is:

1. A quiz or confirmed paper result produces mastery evidence.
2. The Go backend sends the evidence to the Python calculation service.
3. Python returns the recalculated student-topic state.
4. Go upserts the current state and appends a history snapshot when the state
   changed.
5. Teacher and student frontends read the persisted state only through Go.

The profile read path must not require Python to be available. If Python is
temporarily unavailable, existing persisted profiles remain readable while new
evidence processing returns a clear retryable error.

## 3. Persistence Model

### 3.1 `student_topic_masteries`

One current row per `(student_id, topic_id)`:

- `id` UUID primary key
- `student_id` UUID, indexed, foreign key to users
- `topic_id` UUID, indexed, foreign key to nodes
- `mastery_probability` decimal in `[0,1]`
- `confidence_score` decimal in `[0,1]`
- `consistency` decimal in `[0,1]`
- `evidence_count` integer
- `effective_evidence` decimal
- `mastery_status`: `unknown`, `uncertain`, `learning`, `confirmed_gap`, or
  `mastered`
- `evidence_summary_json` JSON text
- `source_breakdown_json` JSON text
- `last_evidence_at` nullable timestamp
- `version` positive integer
- `calculated_at`, `created_at`, `updated_at`

A unique constraint on `(student_id, topic_id)` makes the upsert idempotent.

### 3.2 `student_topic_mastery_history`

Immutable snapshots used by the topic detail chart:

- `id` UUID primary key
- all BKT result fields required to reproduce the displayed point
- `student_id`, `topic_id`, and `version`
- `trigger_evidence_id` nullable string for lineage
- `recorded_at` timestamp

A unique constraint on `(student_id, topic_id, version)` prevents duplicate
history points. A snapshot is appended when a new calculation version is
accepted. Exact retries of the same version do not create another point.

The first accepted BKT state creates both the current row and the first history
row. `unknown` topics without calculations are represented by absence of a row,
not by pre-populating every student-topic combination.

## 4. Calculation Contract

Add a Python endpoint dedicated to profile calculation rather than coupling the
read model to learning-path thread state:

`POST /mastery/calculate`

Input:

- student ID
- one or more topic IDs
- raw quiz and confirmed paper evidence
- calculation timestamp

Output:

- one serialized `StudentTopicKnowledgeState` per requested topic

The calculation uses the existing calibration and BKT modules. Evidence is
deduplicated by `evidence_id`, ordered by occurrence time, and only confirmed
paper evidence affects the official state. The endpoint is deterministic for
the same input and does not persist data itself.

## 5. Go Service Boundary

Introduce a focused mastery profile service instead of adding more profile
logic to the existing large tutor service. It is responsible for:

- collecting eligible evidence from current activity logs and future scoring
  integrations;
- calling the Python calculation endpoint;
- validating the returned ranges and status values;
- transactionally upserting current states and history snapshots;
- returning teacher and student profile views;
- enforcing teacher-to-student access checks through the available class
  relationship.

Until a complete class-membership model exists, teacher access follows the
same student scope used by the current teacher progress list. The authorization
check remains centralized so it can switch to explicit enrollment later.

## 6. Public APIs

### Teacher

- `GET /api/teacher/students/:studentId/mastery?subject=<subject>`
- `GET /api/teacher/students/:studentId/mastery/:topicId/history`
- `POST /api/teacher/students/:studentId/mastery/recalculate`

The recalculation endpoint is an explicit first integration point for existing
activity logs. Later, quiz and exam completion callbacks can call the same
service automatically.

### Student

- `GET /api/student/mastery?subject=<subject>`
- `GET /api/student/mastery/:topicId/history`

Student routes always derive the student ID from the authenticated token. A
client-supplied student ID is never accepted.

### Response shape

The profile endpoint returns all subject topics in one response:

- `studentId`, `subject`, `calculatedAt`
- `topics`, keyed by topic ID
- each topic contains current mastery, confidence, status, evidence counts,
  source breakdown, and timestamps

Missing topic keys mean there is no evidence and the UI displays `Chua co du
lieu`.

History responses are ordered oldest to newest and support an optional range:
`30d`, `90d`, or `all`.

## 7. Teacher Experience

The existing student progress workflow remains the entry point. A teacher:

1. Selects a student from the class progress list.
2. Opens the existing individual knowledge-tree view.
3. Sees a compact `BKT 76%` badge on each topic with data.
4. Selects a node to open the existing right-side detail area.

The detail area gains a `Nang luc` view containing:

- mastery percentage and semantic status;
- confidence percentage;
- evidence count and source breakdown;
- last evidence and calculation timestamps;
- a lightweight line chart of mastery over time;
- range controls for 30 days, 90 days, and all history;
- an empty state when no history exists.

Node colors preserve the current tree semantics. The BKT badge and a small
status dot communicate competency without recoloring the entire graph in a way
that conflicts with locked, current, or completed node states.

## 8. Student Experience

The student's existing dashboard knowledge tree uses the same badge and topic
detail component. It calls student-scoped APIs and contains no student picker,
recalculation action, or teacher-only evidence metadata.

The interface explains that mastery is an estimate based on available work and
keeps confidence visible so a low-evidence estimate is not presented as fact.

## 9. Status Presentation

- `mastered`: green status dot, mastery at or above the configured threshold
- `learning`: blue status dot
- `confirmed_gap`: red status dot
- `uncertain`: amber status dot and `Can them du lieu` label
- missing state: neutral dot and `Chua co du lieu`

Percentages are stored as decimals and rounded only for display. Tooltips retain
one decimal place when useful.

## 10. Error and Edge Cases

- Python unavailable: recalculation fails without deleting existing state.
- Duplicate evidence or retry: no duplicate version or history point.
- Evidence correction: create a new version and history point after
  recalculation; never mutate prior history.
- Deleted topic: exclude it from subject profile reads while preserving history
  for audit until an explicit retention policy is introduced.
- No evidence: show a neutral empty state, never infer a gap.
- Low confidence: show the estimate with an uncertainty label.
- Unauthorized teacher/student access: return `403`; unknown resources return
  `404` without leaking cross-user data.

## 11. Testing

### Python

- calculation endpoint serialization and validation;
- correct, incorrect, partial, duplicate, old, and conflicting evidence;
- deterministic output for identical requests.

### Go

- model migration and uniqueness constraints;
- calculation client validation and failure handling;
- transactional current-state upsert and history append;
- idempotent retry behavior;
- teacher and student authorization;
- profile and history response filtering.

### Frontend

- BKT badge states, rounding, and missing-data behavior;
- topic detail loading, history ranges, and empty/error states;
- teacher selection versus student self-only behavior;
- responsive layout for the right-side panel.

### End to end

Evidence submission -> BKT calculation -> PostgreSQL persistence -> matching
teacher and student displays for the same learner and topic.

## 12. Rollout

1. Add persistence and read APIs without changing the current UI.
2. Add explicit teacher recalculation for existing activity logs.
3. Add teacher tree badges and topic history details.
4. Add the student dashboard view using the same read model.
5. Connect automatic recalculation to quiz and confirmed exam evidence.

Existing progress and learning-path behavior remains available throughout the
rollout. The feature can be disabled at the UI level while retaining migrated
tables and APIs.

## 13. Out of Scope

- Class-average mastery displayed on topic nodes
- Predictive grades or ranking students against each other
- Editing BKT parameters from the dashboard
- Automatic parameter training
- Cross-subject competency aggregation
- Exportable competency reports in the first release
