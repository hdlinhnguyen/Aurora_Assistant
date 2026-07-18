package telemetry

import (
	"context"
	"testing"
	"time"

	"backend/internal/model"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestP0JourneyReachesQuestionFact(t *testing.T) {
	db := newTelemetryTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.QuestionAttemptFact{}))
	now := time.Date(2026, 7, 18, 3, 0, 0, 0, time.UTC)
	publisher := NewPublisher(db, fixedClock{now: now}, PseudonymConfig{Key: []byte("01234567890123456789012345678901"), KeyVersion: "v1"})
	studentID := uuid.New()
	sessionID := uuid.NewString()
	attemptID := uuid.NewString()
	questionID := uuid.NewString()
	topicID := uuid.NewString()

	for _, event := range []Event{
		{EventID: uuid.NewString(), Name: "question_presented", SchemaVersion: 1, OccurredAt: now, SessionID: sessionID, AttemptID: attemptID, TopicID: topicID, Source: "go_backend", ConsentState: "required", RetentionClass: "interaction", Properties: map[string]any{"question_id": questionID}},
		{EventID: uuid.NewString(), Name: "hint_rendered", SchemaVersion: 1, OccurredAt: now.Add(time.Second), SessionID: sessionID, AttemptID: attemptID, TopicID: topicID, Source: "go_backend", ConsentState: "required", RetentionClass: "interaction", Properties: map[string]any{"hint_level": 1}},
		{EventID: uuid.NewString(), Name: "question_answer_submitted", SchemaVersion: 1, OccurredAt: now.Add(2 * time.Second), SessionID: sessionID, AttemptID: attemptID, TopicID: topicID, Source: "go_backend", ConsentState: "required", RetentionClass: "interaction", Properties: map[string]any{"question_id": questionID, "selected_option": 1, "active_time_ms": 1500, "elapsed_time_ms": 2000, "hint_count": 1}},
		{EventID: uuid.NewString(), Name: "question_graded", SchemaVersion: 1, OccurredAt: now.Add(3 * time.Second), SessionID: sessionID, AttemptID: attemptID, TopicID: topicID, Source: "go_backend", ConsentState: "required", RetentionClass: "interaction", Properties: map[string]any{"question_id": questionID, "is_correct": true}},
	} {
		_, err := publisher.PublishActor(context.Background(), studentID, "student", event)
		require.NoError(t, err)
	}
	worker := NewWorker(db, fixedClock{now: now.Add(4 * time.Second)})
	require.NoError(t, worker.ProcessBatch(context.Background()))
	result, err := RebuildRange(context.Background(), db, now.Add(-time.Second), now.Add(time.Minute))
	require.NoError(t, err)
	require.Equal(t, 1, result.AttemptsUpserted)

	var fact model.QuestionAttemptFact
	require.NoError(t, db.Where("attempt_id = ?", attemptID).First(&fact).Error)
	require.Equal(t, int64(1500), fact.ActiveTimeMS)
	require.Equal(t, 1, fact.HintCount)
	require.True(t, *fact.IsCorrect)
}
