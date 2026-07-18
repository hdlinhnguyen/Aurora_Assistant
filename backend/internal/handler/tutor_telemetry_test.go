package handler

import (
	"context"
	"testing"

	"backend/internal/telemetry"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type recordingHintPublisher struct {
	events []telemetry.Event
}

func (p *recordingHintPublisher) PublishActor(_ context.Context, _ uuid.UUID, _ string, event telemetry.Event) (telemetry.PublishResult, error) {
	p.events = append(p.events, event)
	return telemetry.PublishResult{}, nil
}

func TestHintTelemetryContainsLevelButNotHintContent(t *testing.T) {
	publisher := &recordingHintPublisher{}
	handler := &TutorHandler{telemetry: publisher}
	topicID := uuid.New()

	handler.publishHintTelemetry(uuid.New(), topicID, 2, "hint text must not be stored")

	require.Len(t, publisher.events, 2)
	require.Equal(t, "hint_requested", publisher.events[0].Name)
	require.Equal(t, "hint_rendered", publisher.events[1].Name)
	require.Equal(t, 2, publisher.events[0].Properties["hint_level"])
	require.NotContains(t, publisher.events[1].Properties, "content")
}

func TestLearningPathTelemetryUsesCountsAndNoteLength(t *testing.T) {
	publisher := &recordingHintPublisher{}
	handler := &TutorHandler{telemetry: publisher}
	teacherID := uuid.New()

	handler.publishLearningPathGenerated(teacherID, "thread-123", 4)
	handler.publishLearningPathApproved(teacherID, "thread-123", true, "teacher private note", 4)

	require.Len(t, publisher.events, 2)
	require.Equal(t, "learning_path_generated", publisher.events[0].Name)
	require.Equal(t, 4, publisher.events[0].Properties["path_count"])
	require.Equal(t, "learning_path_approved", publisher.events[1].Name)
	require.Equal(t, len("teacher private note"), publisher.events[1].Properties["note_length"])
	require.NotContains(t, publisher.events[1].Properties, "note")
}
