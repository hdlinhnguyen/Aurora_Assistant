package telemetry

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"backend/internal/model"
	"backend/internal/testutil"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func newTelemetryTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := testutil.OpenPostgres(t)
	require.NoError(t, db.AutoMigrate(&model.TelemetryEvent{}, &model.TelemetryOutbox{}))
	return db
}

func TestPublishIsIdempotentByEventID(t *testing.T) {
	db := newTelemetryTestDB(t)
	publisher := NewPublisher(db, fixedClock{now: time.Date(2026, 7, 18, 3, 0, 1, 0, time.UTC)})
	event := validEvent()

	first, err := publisher.Publish(context.Background(), event)
	require.NoError(t, err)
	require.False(t, first.Duplicate)
	second, err := publisher.Publish(context.Background(), event)
	require.NoError(t, err)
	require.True(t, second.Duplicate)

	var count int64
	require.NoError(t, db.Model(&model.TelemetryOutbox{}).Where("event_id = ?", event.EventID).Count(&count).Error)
	require.Equal(t, int64(1), count)
}

func TestPublishTxRollsBackWithBusinessTransaction(t *testing.T) {
	db := newTelemetryTestDB(t)
	publisher := NewPublisher(db, fixedClock{now: time.Now().UTC()})
	event := validEvent()
	sentinel := errors.New("business failure")

	err := db.Transaction(func(tx *gorm.DB) error {
		if err := publisher.PublishTx(context.Background(), tx, event); err != nil {
			return err
		}
		return sentinel
	})
	require.ErrorIs(t, err, sentinel)
	var count int64
	require.NoError(t, db.Model(&model.TelemetryOutbox{}).Where("event_id = ?", event.EventID).Count(&count).Error)
	require.Zero(t, count)
}

func TestPublishConcurrentDuplicateReturnsOneAcceptedEvent(t *testing.T) {
	db := newTelemetryTestDB(t)
	publisher := NewPublisher(db, fixedClock{now: time.Now().UTC()})
	event := validEvent()
	var wait sync.WaitGroup
	results := make(chan PublishResult, 8)
	errorsSeen := make(chan error, 8)
	for range 8 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			result, err := publisher.Publish(context.Background(), event)
			results <- result
			errorsSeen <- err
		}()
	}
	wait.Wait()
	close(results)
	close(errorsSeen)

	accepted := 0
	duplicates := 0
	for err := range errorsSeen {
		require.NoError(t, err)
	}
	for result := range results {
		if result.Duplicate {
			duplicates++
		} else {
			accepted++
		}
	}
	require.Equal(t, 1, accepted)
	require.Equal(t, 7, duplicates)
}
