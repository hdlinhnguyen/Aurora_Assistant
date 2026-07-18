# User Metrics and Telemetry Design

**Date:** 2026-07-18  
**Status:** Approved design  
**Scope:** Aurora Assistant student, teacher, learning-path, BKT, AI, and operational telemetry

## 1. Objective

Build a shared telemetry foundation that improves both learning quality and product experience. The system must capture detailed event-level signals, including active time per question, attempts, hint use, learning-path interactions, BKT decisions, teacher interventions, AI quality, and reliability, without placing sensitive student content in the analytics store.

The primary product outcome is **Weekly Successful Learning Sessions**. A session is successful when it contains meaningful active engagement and produces evidence of learning progress, such as a confidence-supported mastery increase, a correct transfer answer, or completion of an assigned learning-path objective.

The system must not optimize engagement duration or hint volume in isolation. Guardrails include direct-answer rate, hint dependency, false mastery, safety incidents, teacher overrides, latency, errors, and outcome differences between sufficiently large cohorts.

## 2. Design Principles

1. Capture immutable atomic events and derive metrics afterward.
2. Treat the Go backend as authoritative for business outcomes.
3. Capture browser-only interaction signals in Next.js and reconcile them with server events.
4. Record model decisions with model, prompt, configuration, and code versions.
5. Keep telemetry off the critical learning path; analytics failure must not break learning flows.
6. Use pseudonymous identifiers and exclude raw sensitive content by default.
7. Version event schemas and metric definitions.
8. Measure data quality before trusting product or learning dashboards.

## 3. Recommended Architecture

Use a hybrid transactional-outbox architecture:

```text
Next.js interaction events --batch---+
Go business events --outbox----------+--> Telemetry Collector
Python BKT/path decision events ------+          |
                                                  +--> Raw event store
                                                  +--> Derived fact tables
                                                  +--> Metric jobs
                                                  +--> Dashboards, alerts, and evals
```

### 3.1 Next.js frontend

The frontend captures information that the server cannot infer reliably:

- question presentation, focus, visibility, idle, resume, and abandonment;
- hint views and dismissals;
- navigation, revisits, teacher dashboard interactions, and offline behavior;
- active timing state for lessons, questions, explanations, and canvases.

Events are queued locally, sent through a batch endpoint, and retried with stable `event_id` values. The client aggregates high-frequency signals such as answer changes instead of logging keystrokes or pointer movement.

### 3.2 Go backend

The Go backend is authoritative for login, session creation, answer submission, grading results, exam completion, learning-path approval, persistence, and API failures. It writes business telemetry to `telemetry_outbox` in the same transaction as the business state change. A worker forwards outbox records asynchronously.

### 3.3 Python learning-path service

The Python service emits decision events for mastery calculation, evidence processing, class insight generation, and learning-path generation. Each decision includes summarized inputs, output probabilities, confidence fields, configuration version, code version, and processing time. Raw student answers, chat content, and paper images are not copied into analytics events.

### 3.4 Telemetry collector

The collector:

- validates events against a schema registry;
- enforces property allowlists and PII denylists;
- assigns `received_at` and validates clock skew;
- deduplicates by `event_id`;
- preserves correlation IDs and consent state;
- routes invalid events to controlled rejection metrics or a dead-letter path;
- never blocks the learning flow because downstream analytics is unavailable.

### 3.5 Analytics storage

The MVP uses a separate PostgreSQL database or isolated analytics schema with time-partitioned raw events. Consumers and event contracts remain storage-independent so a later migration to ClickHouse, BigQuery, or another warehouse does not require producer changes.

## 4. Event Contract

All producers use the same envelope:

```json
{
  "event_id": "uuid",
  "event_name": "question_answer_submitted",
  "schema_version": 1,
  "occurred_at": "2026-07-18T10:00:00Z",
  "received_at": "2026-07-18T10:00:01Z",
  "actor_id": "pseudonymous-id",
  "actor_role": "student",
  "session_id": "uuid",
  "attempt_id": "uuid",
  "class_id": "pseudonymous-id",
  "topic_id": "stable-topic-id",
  "source": "frontend|go_backend|learning_path",
  "correlation_id": "request-or-trace-id",
  "app_version": "git-sha",
  "consent_state": "required|optional_allowed|optional_denied",
  "retention_class": "interaction|decision|aggregate",
  "properties": {}
}
```

Required and permitted fields vary by `event_name` and schema version. Event timestamps are UTC. Server events are authoritative for submission and grading time.

## 5. Accurate Question Timing

Question-solving time is not calculated as only `submit_at - presented_at`. The frontend maintains a timing state machine and records:

- `elapsed_time_ms`: wall-clock duration from presentation to submission;
- `active_time_ms`: time while the tab is visible, the window is focused, and the learner has not been idle for more than 30 seconds;
- `idle_time_ms`: excluded inactive time;
- `hint_time_ms`: active time after at least one hint is viewed;
- `attempt_index`, `answer_change_count`, `revisit_count`, and `resume_count`;
- `abandoned`: no valid submission before the attempt closes.

The server checks impossible timestamps, applies configured maximums, compares client and server clocks, and uses the server submission event as the official completion boundary. Multi-tab and retry events are reconciled by `session_id`, `attempt_id`, and `event_id`.

## 6. Event and Metric Catalog

### 6.1 Learning sessions and engagement

Events:

- `learning_session_started`, `learning_session_resumed`, `learning_session_ended`
- `page_viewed`, `tab_hidden`, `tab_visible`
- `user_became_idle`, `user_became_active`
- `topic_opened`, `lesson_started`, `lesson_completed`, `lesson_abandoned`
- `offline_mode_entered`, `offline_batch_synced`, `sync_failed`

Derived metrics:

- DAU, WAU, and MAU by role, class, grade, and subject;
- sessions and active minutes per learner per week;
- median and percentile session length;
- D1, D7, and D30 return rates and learning streaks;
- topic-start-to-completion conversion;
- resume, abandonment, and time-to-first-learning-action;
- offline usage, sync success, duplicate, and dropped-event rates.

### 6.2 Questions, quizzes, and exams

Events:

- `question_presented`, `question_answer_changed`, `question_answer_submitted`
- `question_graded`, `question_skipped`, `question_abandoned`, `question_revisited`
- `exam_started`, `exam_paused`, `exam_resumed`, `exam_submitted`, `exam_graded`

Important properties include question and topic IDs, difficulty, question type, attempt index, correctness, score ratio, active and elapsed time, answer-change count, hint count, revisit count, device type, network state, and content version.

Derived metrics:

- median, P75, and P95 active time per question and topic;
- first-attempt and post-hint accuracy;
- attempts-to-correct, skip, abandon, and revisit rates;
- distractor selection rates;
- empirical item difficulty and discrimination;
- question ambiguity candidates based on high time, low accuracy, and frequent answer changes;
- exam completion, time utilization, score distribution, and grading turnaround;
- pre/post gain, normalized gain, and 7-day and 30-day retention.

### 6.3 Hints and scaffolding

Events:

- `hint_requested`, `hint_rendered`, `hint_viewed`, `hint_dismissed`
- `hint_level_advanced`, `answer_submitted_after_hint`
- `solution_revealed`, `hint_generation_failed`

Properties include hint level and type, time before the first hint, active time on the hint, attempts before and after the hint, generator, prompt version, and model version.

Derived metrics:

- hints per question and session;
- percentage of attempts requiring a hint;
- time to first hint;
- correct-after-hint rate by level;
- hint effectiveness uplift against comparable no-hint attempts;
- hint dependency and over-help rates;
- hint abandonment, generation failure, and latency;
- the minimum sufficient hint level;
- later performance on similar questions after 1, 7, and 30 days.

### 6.4 Socratic chat

Events:

- `chat_session_started`, `student_message_sent`, `assistant_message_generated`
- `socratic_question_asked`, `student_response_received`
- `misconception_detected`, `misconception_resolved`
- `guardrail_triggered`, `response_regenerated`
- `chat_session_completed`, `chat_session_abandoned`
- `student_feedback_submitted`, `teacher_chat_reviewed`

Derived metrics:

- turns and active time per session;
- generation latency, tokens, and cost;
- student talk ratio;
- direct-answer rate and Socratic compliance;
- relevance, factuality, and age-appropriateness;
- misconception resolution and turns-to-resolution;
- stuck and repeated-error rates;
- transfer performance on related assessment questions;
- feedback, report, teacher-override, and safety-incident rates.

Raw chat is stored only in a restricted operational store when required. Analytics receives a conversation ID and approved labels or features.

### 6.5 Feynman and First Principles

Events:

- `feynman_explanation_started`, `explanation_submitted`, `explanation_revised`
- `clarity_scored`, `concept_missing_detected`, `complex_term_detected`
- `principle_selected`, `principle_removed`, `canvas_submitted`
- `canvas_validated`, `canvas_revised`

Derived metrics:

- initial and final clarity scores;
- revision count and explanation time;
- vocabulary simplification, concept coverage, misconception density, and logical completeness;
- assessment improvement after Feynman practice;
- principle-selection precision and recall where reference labels exist;
- canvas completion, abandonment, invalid-dependency, and transfer rates.

### 6.6 BKT and mastery profiles

Events:

- `mastery_calculation_requested`, `mastery_calculated`
- `mastery_status_changed`
- `evidence_ingested`, `evidence_rejected`
- `mastery_prediction_evaluated`
- `bkt_config_changed`

Properties aligned with the existing BKT implementation include:

- mastery before and after;
- predicted correct probability;
- observation value, evidence weight, and evidence source;
- confidence, consistency, evidence count, and effective evidence;
- mastery status before and after;
- BKT configuration version covering `p_l0`, `p_t`, `p_g`, and `p_s`;
- calculation latency and model code version.

Derived metrics:

- Brier score, log loss, calibration curves, and Expected Calibration Error;
- secondary discrimination metrics such as AUC;
- mastery state transition and regression rates;
- time and evidence required to reach mastery;
- confidence growth;
- false mastery and false gap rates;
- evidence-source drift and weight distributions;
- population and feature drift by time, topic, and model version;
- learning-outcome uplift for BKT-driven paths against an appropriate baseline.

Calibration is a primary quality measure because BKT probabilities drive educational decisions. Backtests must predict future evidence using only past evidence.

### 6.7 Personalized learning paths and teacher action

Events:

- `learning_path_generation_started`, `learning_path_generated`, `learning_path_generation_failed`
- `path_step_moved`, `path_step_deleted`, `path_step_added`
- `learning_path_approved`, `learning_path_rejected`, `learning_path_assigned`
- `path_step_started`, `path_step_completed`, `path_abandoned`
- `teacher_insight_viewed`, `student_priority_opened`, `teacher_intervention_recorded`

Derived metrics:

- generation success and latency;
- step count and prerequisite coverage;
- teacher approval and rejection rates;
- edit distance before approval, including moves, additions, and deletions;
- time to approval and rejection reasons;
- step and path completion, abandonment, and stuck-step rates;
- predicted versus actual duration;
- mastery gain and retention by step and path;
- root-cause diagnosis precision;
- intervention adoption, response time, and outcome;
- recommendation regret when an approved path is abandoned or does not improve outcomes.

Teacher edit distance is a key recommendation-quality signal because the current teacher UI already supports moving and deleting generated steps before approval.

### 6.8 Product operations and teacher experience

Events:

- `dashboard_viewed`, `filter_applied`, `student_profile_opened`
- `report_exported`, `bulk_action_started`, `bulk_action_completed`
- `api_request_completed`, `frontend_error`, `background_job_completed`
- `notification_sent`, `notification_opened`, `notification_actioned`

Derived metrics:

- teacher weekly active rate;
- time to first insight and first intervention;
- insight-to-intervention conversion;
- dashboard and API P50, P95, and P99 latency;
- availability, error, retry, and frontend crash rates;
- BKT and path-generation queue delay;
- notification delivery, open, and action rates;
- token and infrastructure cost per successful learning outcome.

### 6.9 Telemetry quality

Required telemetry health metrics include:

- event acceptance and rejection rates;
- missing-field and unknown-schema rates;
- client/server clock skew;
- duplicate and out-of-order rates;
- frontend-to-server reconciliation rate;
- outbox and consumer lag;
- dead-letter count;
- event volume anomalies by app version;
- incomplete lifecycle rates, such as attempts with submission but no presentation event.

## 7. Storage Model

The raw store contains:

```text
telemetry_events
- event_id primary key
- event_name, schema_version
- occurred_at, received_at
- actor_id, actor_role
- session_id, attempt_id, correlation_id
- class_id, topic_id
- source, app_version
- consent_state, retention_class
- properties JSONB
```

It is partitioned monthly and indexed for event-time, actor-time, and session access patterns.

Derived tables include:

- `learning_session_facts`
- `question_attempt_facts`
- `hint_usage_facts`
- `mastery_decision_facts`
- `learning_path_facts`
- `daily_user_metrics`
- `daily_topic_metrics`
- `experiment_assignments`

`event_schema_registry` defines the required properties, types, owner, sensitivity, and retention for every event version. `metric_definitions` defines the metric formula, grain, timezone, owner, and version. Incremental jobs are idempotent and can rebuild derived data from raw events.

## 8. Privacy, Security, and Retention

- Analytics events must not contain names, email addresses, phone numbers, access tokens, raw free-text answers, raw chat messages, or paper images.
- `actor_id` is produced with keyed HMAC rather than an unkeyed hash.
- Raw interaction events are retained for 90 days by default.
- Derived session and fact data are retained for 13 months by default.
- Aggregated cohort metrics may be retained longer according to school policy.
- Raw chat and paper artifacts, when needed for evaluation, remain in a separate restricted store with shorter retention and access audit logs.
- A protected mapping enables user-level deletion without exposing identity to analysts.
- Teachers can access only students in classes they are authorized to manage.
- Product analysts receive cohort views; ML engineers receive pseudonymous features and labels.
- Cohort reporting requires a configurable minimum size, initially 10 users.
- Consent state is attached to events, and optional events are rejected when optional analytics consent is not allowed.
- Collector privacy tests deny fields such as `email`, `name`, `token`, `message`, and `answer_text`.

## 9. Dashboards

### 9.1 Learning Quality

- Weekly Successful Learning Sessions
- mastery gain, retention, and transfer accuracy
- hint effectiveness and dependency
- BKT calibration, false mastery, and false gaps
- breakdowns by sufficiently large topic, grade, and evidence-source cohorts

### 9.2 Student Journey

- session-to-topic-to-question-to-hint-to-correct-to-mastery funnel
- active time, attempts, abandonment, and stuck points
- authorized teacher drill-down for students in the teacher's classes

### 9.3 Teacher Impact

- insight viewed to path edited to approval to intervention to outcome
- approval and edit distance
- intervention response time and subsequent learning outcome

### 9.4 AI and Recommendation Quality

- Socratic compliance and direct-answer rate
- misconception resolution
- path approval, edit, and rejection
- prompt, model, BKT configuration, and code-version comparisons
- latency, token use, and cost per successful outcome

### 9.5 Reliability and Data Quality

- API and background-job SLOs
- frontend errors and offline sync
- event rejection, duplication, missing fields, and lag
- event-volume comparisons by release and application version

## 10. Alerts

Alerts cover:

- sustained P95 API, BKT, or path-generation latency breaches;
- error-rate or event-rejection spikes after a release;
- false-mastery, direct-answer, or safety guardrail breaches;
- calibration drift by topic or model version;
- increased hint use combined with reduced post-hint correctness or retention;
- falling path approval or rising teacher edit distance;
- event-volume loss greater than 20 percent against the same weekday/time baseline;
- outbox lag, consumer lag, dead letters, or offline-sync failures.

Every alert has a severity, owner, minimum cohort rule, and runbook. Alerts are suppressed for cohorts too small to interpret safely.

## 11. Experiments and Causal Evaluation

Observational metrics do not establish learning impact. Product and model changes use controlled evaluation where practical:

- randomize consistently by learner or class to reduce contamination;
- record immutable `experiment_id`, `variant_id`, and `assignment_at` values;
- use mastery, transfer, and retention gain as primary outcomes;
- use completion, time to mastery, and teacher adoption as secondary outcomes;
- enforce direct-answer, dependency, false-mastery, latency, and safety guardrails;
- use pre-tests or CUPED when appropriate;
- analyze intent-to-treat;
- predefine duration, sample size, stopping criteria, and metric definitions;
- run time-based BKT backtests with no future evidence leakage.

## 12. Failure Handling

- Frontend telemetry is queued and retried with idempotent event IDs.
- Invalid optional events are rejected without failing the user action.
- Go outbox records are committed or rolled back with their business transaction.
- Consumers use idempotent writes and safely handle repeated delivery.
- Dead-letter records retain rejection reason and schema version but must still satisfy privacy rules.
- Derived jobs checkpoint progress and can replay raw partitions.
- Telemetry is fail-open for learning experiences, except mandatory security and audit events, which use their existing authoritative persistence path.

## 13. Verification Strategy

- Contract tests for every event producer and schema version.
- Unit tests for active timing across focus, visibility, idle, resume, multi-tab, and offline transitions.
- Integration tests for business transactions and outbox rollback behavior.
- Idempotency tests for client retries and repeated consumer delivery.
- Reconciliation tests between backend submissions and derived attempts.
- Load tests for batch ingestion and partition pruning.
- Automated PII denylist and event-property allowlist tests.
- Golden datasets for hint effectiveness, mastery gain, and BKT calibration formulas.
- Release checks comparing expected and actual event volume by event name.

## 14. Delivery Priorities

### P0

- shared event envelope and schema registry;
- session, question timing, attempt, hint, and grading events;
- BKT decision events;
- path generation, edit, and approval events;
- API latency, errors, and telemetry quality;
- raw storage, core fact tables, and reconciliation.

### P1

- Socratic pedagogical labels;
- Feynman and First Principles outcomes;
- transfer and retention measurement;
- teacher intervention events and dashboard.

### P2

- experimentation platform;
- advanced calibration and drift monitoring;
- cost-per-outcome reporting;
- causal learning-quality dashboards.

## 15. Acceptance Criteria

The design is successfully implemented when:

1. A question attempt can be reconstructed with presentation, active time, hints, submissions, grading, and mastery outcome.
2. Duplicate and retried events do not alter derived metrics.
3. Business actions remain successful when analytics infrastructure is unavailable.
4. BKT predictions can be evaluated against later evidence by configuration and code version.
5. A generated learning path can be traced through teacher edits, approval, student completion, and learning outcome.
6. Analytics events pass automated sensitive-field checks and contain no prohibited raw content.
7. Dashboards expose telemetry quality alongside learning and product metrics.
8. Metric formulas and event contracts are versioned, testable, and reproducible from immutable raw events.
