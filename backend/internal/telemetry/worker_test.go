package telemetry

import (
	"context"
	"testing"
	"time"

	"backend/internal/model"
	"github.com/stretchr/testify/require"
)

func TestWorkerCopiesOutboxToRawEventOnce(t *testing.T) {
	db := newTelemetryTestDB(t)
	now := time.Date(2026, 7, 18, 3, 0, 1, 0, time.UTC)
	publisher := NewPublisher(db, fixedClock{now: now})
	event := validEvent()
	_, err := publisher.Publish(context.Background(), event)
	require.NoError(t, err)
	worker := NewWorker(db, fixedClock{now: now})

	require.NoError(t, worker.ProcessBatch(context.Background()))
	require.NoError(t, worker.ProcessBatch(context.Background()))

	var rawCount int64
	require.NoError(t, db.Model(&model.TelemetryEvent{}).Where("event_id = ?", event.EventID).Count(&rawCount).Error)
	require.Equal(t, int64(1), rawCount)
	var outbox model.TelemetryOutbox
	require.NoError(t, db.Where("event_id = ?", event.EventID).First(&outbox).Error)
	require.Equal(t, "delivered", outbox.Status)
}

func TestWorkerRunStopsWhenContextIsCanceled(t *testing.T) {
	db := newTelemetryTestDB(t)
	worker := NewWorker(db, fixedClock{now: time.Now().UTC()})
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	require.ErrorIs(t, worker.Run(ctx), context.Canceled)
}
