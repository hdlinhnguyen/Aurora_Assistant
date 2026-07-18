package exam

import (
	"context"
	"testing"

	"backend/internal/telemetry"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type recordingExamPublisher struct {
	events []telemetry.Event
}

func (p *recordingExamPublisher) Publish(_ context.Context, event telemetry.Event) (telemetry.PublishResult, error) {
	p.events = append(p.events, event)
	return telemetry.PublishResult{}, nil
}

func TestExamTelemetryIsIdempotentAndSummaryOnly(t *testing.T) {
	publisher := &recordingExamPublisher{}
	service := &Service{publisher: publisher}
	examID := uuid.New()

	service.publishExamTelemetry("exam_submitted", examID, "submission-key", map[string]any{
		"exam_id": examID.String(), "submission_count": 30,
	})
	service.publishExamTelemetry("exam_submitted", examID, "submission-key", map[string]any{
		"exam_id": examID.String(), "submission_count": 30,
	})

	require.Len(t, publisher.events, 2)
	require.Equal(t, publisher.events[0].EventID, publisher.events[1].EventID)
	require.NotContains(t, publisher.events[0].Properties, "snapshot")
}
