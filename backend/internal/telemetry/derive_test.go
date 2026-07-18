package telemetry

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"backend/internal/model"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestRebuildRangeCreatesIdempotentQuestionAttemptFact(t *testing.T) {
	db := newTelemetryTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.QuestionAttemptFact{}))
	from := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	attemptID := uuid.NewString()
	sessionID := uuid.NewString()
	questionID := uuid.NewString()
	actorID := "v1_01234567890123456789012345678901"
	require.NoError(t, db.Create(&[]model.TelemetryEvent{
		rawEvent(t, "question_presented", from.Add(time.Minute), actorID, sessionID, attemptID, map[string]any{"question_id": questionID}),
		rawEvent(t, "hint_rendered", from.Add(2*time.Minute), actorID, sessionID, attemptID, map[string]any{"hint_level": 1}),
		rawEvent(t, "question_answer_submitted", from.Add(3*time.Minute), actorID, sessionID, attemptID, map[string]any{
			"question_id": questionID, "selected_option": 2, "elapsed_time_ms": 120000,
			"active_time_ms": 90000, "answer_change_count": 3, "hint_count": 1,
		}),
		rawEvent(t, "question_graded", from.Add(3*time.Minute+time.Second), actorID, sessionID, attemptID, map[string]any{
			"question_id": questionID, "is_correct": true,
		}),
	}).Error)

	first, err := RebuildRange(context.Background(), db, from, from.Add(24*time.Hour))
	require.NoError(t, err)
	require.Equal(t, 1, first.AttemptsUpserted)
	second, err := RebuildRange(context.Background(), db, from, from.Add(24*time.Hour))
	require.NoError(t, err)
	require.Equal(t, 1, second.AttemptsUpserted)

	var fact model.QuestionAttemptFact
	require.NoError(t, db.Where("attempt_id = ?", attemptID).First(&fact).Error)
	require.Equal(t, int64(90000), fact.ActiveTimeMS)
	require.Equal(t, 1, fact.HintCount)
	require.NotNil(t, fact.IsCorrect)
	require.True(t, *fact.IsCorrect)
	var count int64
	require.NoError(t, db.Model(&model.QuestionAttemptFact{}).Count(&count).Error)
	require.Equal(t, int64(1), count)
}

func TestRebuildRangeFlagsSubmissionWithoutPresentation(t *testing.T) {
	db := newTelemetryTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.QuestionAttemptFact{}))
	from := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	attemptID := uuid.NewString()
	event := rawEvent(t, "question_answer_submitted", from.Add(time.Minute), "actor", "", attemptID, map[string]any{
		"question_id": uuid.NewString(), "selected_option": 1, "active_time_ms": 500,
	})
	require.NoError(t, db.Create(&event).Error)

	result, err := RebuildRange(context.Background(), db, from, from.Add(time.Hour))
	require.NoError(t, err)
	require.Equal(t, 1, result.MissingPresented)
}

func TestPurgeRawInteractionsKeepsDecisionEvents(t *testing.T) {
	db := newTelemetryTestDB(t)
	cutoff := time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)
	oldInteraction := rawEvent(t, "question_presented", cutoff.Add(-time.Hour), "actor", uuid.NewString(), uuid.NewString(), map[string]any{"question_id": uuid.NewString()})
	oldDecision := oldInteraction
	oldDecision.ID = uuid.Nil
	oldDecision.EventID = uuid.NewString()
	oldDecision.EventName = "mastery_calculated"
	oldDecision.RetentionClass = "decision"
	require.NoError(t, db.Create(&[]model.TelemetryEvent{oldInteraction, oldDecision}).Error)

	deleted, err := PurgeRawInteractions(context.Background(), db, cutoff)
	require.NoError(t, err)
	require.Equal(t, int64(1), deleted)
	var remaining int64
	require.NoError(t, db.Model(&model.TelemetryEvent{}).Count(&remaining).Error)
	require.Equal(t, int64(1), remaining)
}

func rawEvent(
	t *testing.T,
	name string,
	occurredAt time.Time,
	actorID, sessionID, attemptID string,
	properties map[string]any,
) model.TelemetryEvent {
	t.Helper()
	encoded, err := json.Marshal(properties)
	require.NoError(t, err)
	return model.TelemetryEvent{
		EventID: uuid.NewString(), EventName: name, SchemaVersion: 1,
		OccurredAt: occurredAt, ReceivedAt: occurredAt, ActorID: actorID, ActorRole: "student",
		SessionID: optionalString(sessionID), AttemptID: optionalString(attemptID), Source: "frontend",
		ConsentState: "required", RetentionClass: "interaction", PropertiesJSON: encoded,
	}
}
