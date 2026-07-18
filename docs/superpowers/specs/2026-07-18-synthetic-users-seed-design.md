# Synthetic Users And Resettable Seed Data

## Goal

Make local and test environments easy to explore by loading a repeatable set of synthetic teachers, students, learning-tree content, answer history, and persisted BKT profiles whenever the Go backend starts. The seed must be disabled with `ENABLE_SYNTHETIC_DATA=false` and must never overwrite non-synthetic data.

## Scope

The feature is implemented in the main Go backend startup path. It owns synthetic users, their related student state/activity/mastery rows, synthetic teacher topics, knowledge-tree nodes, edges, questions, and answer events. The frontend remains API-driven and contains no synthetic mastery percentages.

## Synthetic Namespace

Synthetic records are identified by a stable email namespace (`@aurora.local`) and a marker owned by the seed service. The default accounts are:

- `synthetic.teacher@aurora.local` / `demo123`
- `synthetic.student.a@aurora.local` / `demo123`
- `synthetic.student.b@aurora.local` / `demo123` (display name `Trần Thị B`)
- `synthetic.student.c@aurora.local` / `demo123`

The reset operation deletes only rows owned by these accounts and their synthetic teacher/content relationships. Existing real users, topics, questions, activity, exams, and mastery rows remain untouched.

## Startup Flow

1. Read `ENABLE_SYNTHETIC_DATA`; treat an unset value as enabled and the case-insensitive value `false` as disabled.
2. Run the synthetic reset and seed in one database transaction where possible.
3. Create the synthetic teacher and students through the existing auth/user model path.
4. Create a teacher-owned subject, nodes, edges, and questions through existing models/services.
5. Generate answer events for each synthetic student using a deterministic scenario generator. Events are the only mastery input; no mastery percentage or confidence value is inserted directly.
6. Invoke the existing mastery recalculation service for each synthetic student and subject. Persisted topic states and history are produced by the BKT pipeline.
7. Log a compact summary containing counts of users, nodes, questions, answer events, and recalculated topic states.

## Scenario Generation

The generator selects questions from the synthetic subject and emits answer events with a seeded pseudo-random source or fixed scenario seed. Student profiles differ by event quality and coverage (strong, developing, and struggling patterns), while the resulting BKT values are always calculated by the learning-path API and persisted by the backend mastery service. Changing BKT parameters changes displayed results without changing seed code.

## Configuration And Safety

- `ENABLE_SYNTHETIC_DATA=false` skips all synthetic deletion, creation, and recalculation.
- Synthetic startup failures are fatal in development/test startup so a partially reset fixture is not presented as valid.
- The seed is idempotent through reset-before-create and stable identifiers/namespace ownership.
- No synthetic credentials or values are added to frontend source; credentials are documented for local testing only.

## Verification

- Unit/integration tests verify namespace isolation, reset idempotency, event generation, and that recalculation receives events rather than hardcoded states.
- A live API smoke test verifies all synthetic users can authenticate and that teacher access to `Trần Thị B` returns non-empty topic states.
- Frontend browser smoke verifies BKT badges are visible on the teacher student profile.
- Existing learning-path, backend, frontend, and merge smoke suites remain green.
