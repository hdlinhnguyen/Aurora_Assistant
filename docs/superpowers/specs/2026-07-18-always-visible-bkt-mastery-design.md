# Always-visible BKT mastery on personalized knowledge trees

## Goal

Every node in a student's personalized knowledge tree displays a `BKT xx%` value. This applies both when the student views their own tree and when a teacher views that student's profile. The teacher's shared knowledge-tree editor remains unchanged because it is not student-specific.

## Root cause

The BKT calculator returns an `unknown` state with the configured prior probability for topics without evidence, but the Go mastery service currently discards states whose `evidenceCount` is zero. The frontend then receives a partial topic map, and `KnowledgeTree` hides the mastery badge and ring when neither a persisted BKT state nor an accuracy fallback exists.

## API design

The mastery profile API must return a complete topic map for the requested subject:

- Persisted BKT states remain the source of truth for topics with evidence.
- Missing topics receive a transient `unknown` state in the response.
- The transient state uses the BKT v1 prior mastery probability of `0.30`, confidence `0`, evidence count `0`, and empty evidence/source summaries.
- Transient states are not inserted into current-state or history tables.
- Both student-scoped and teacher-scoped profile endpoints use the same service behavior.
- Recalculation responses also include zero-evidence topic states so the UI remains complete immediately after recalculation.

The API response continues using the existing `TopicState` JSON contract, so no new frontend response type is required.

## Frontend design

`KnowledgeTree` always renders the BKT badge and progress ring when `mode` is `student` or `view-only`:

- Use the API-provided `masteryProbability` when a topic state exists.
- Use the shared frontend BKT prior of `0.30` only during initial loading or when the profile request fails.
- Always label the value `BKT`, including the prior fallback.
- Use the existing status and color behavior for real states. A missing/fallback state uses the neutral `unknown` presentation while its ring represents 30%.
- Do not use raw answer accuracy as the displayed BKT percentage. Accuracy remains separate input/diagnostic data and must not be mislabeled as BKT.
- Do not show BKT in `teacher` editing mode because that tree has no selected student.

## Data flow

1. A personalized page loads the subject tree and requests the student's mastery profile.
2. The Go service loads persisted mastery and all active topic IDs for the subject.
3. The service merges persisted states with transient prior states for missing topics.
4. The page passes the complete map to `KnowledgeTree`.
5. `KnowledgeTree` renders `BKT xx%` on every visible node.

## Error handling

- Profile request failures do not remove BKT labels from the tree; nodes display the 30% prior fallback.
- Existing teacher/student authorization remains unchanged.
- Database errors still return API errors rather than being converted into an empty profile.
- A topic with persisted mastery always overrides the transient prior.

## Testing

- Go service test: a profile with one persisted topic and one missing subject topic returns both states, with the missing state at 30%, status `unknown`, and zero evidence.
- Go service test: recalculation returns zero-evidence states but persists only evidence-backed states.
- Frontend test: personalized `KnowledgeTree` renders `BKT 30%` without a supplied state and never substitutes accuracy as BKT.
- Frontend test: persisted mastery overrides the prior percentage.
- Browser smoke: teacher student-profile tree and student self-view both show a BKT badge on every visible node.

## Scope

This change does not alter BKT equations, thresholds, evidence calibration, teacher graph editing, exam scoring, or mastery history persistence.
