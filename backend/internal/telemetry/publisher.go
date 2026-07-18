package telemetry

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"backend/internal/model"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type TransactionalPublisher interface {
	Publisher
	PublishTx(context.Context, *gorm.DB, Event) error
}

type ActorPublisher interface {
	PublishActor(context.Context, uuid.UUID, string, Event) (PublishResult, error)
}

type PseudonymConfig struct {
	Key        []byte
	KeyVersion string
}

type OutboxPublisher struct {
	db              *gorm.DB
	clock           Clock
	pseudonymConfig PseudonymConfig
}

func NewPublisher(db *gorm.DB, clock Clock, configs ...PseudonymConfig) *OutboxPublisher {
	config := PseudonymConfig{KeyVersion: "v1"}
	if len(configs) > 0 {
		config = configs[0]
	}
	return &OutboxPublisher{db: db, clock: clock, pseudonymConfig: config}
}

func (p *OutboxPublisher) PublishActor(ctx context.Context, actorID uuid.UUID, role string, event Event) (PublishResult, error) {
	if len(p.pseudonymConfig.Key) == 0 {
		return PublishResult{}, ErrInvalidEvent
	}
	event.ActorID = Pseudonym(p.pseudonymConfig.Key, p.pseudonymConfig.KeyVersion, actorID)
	event.ActorRole = role
	event.ReceivedAt = p.clock.Now().UTC()
	return p.Publish(ctx, event)
}

func (p *OutboxPublisher) Publish(ctx context.Context, event Event) (PublishResult, error) {
	var duplicate bool
	err := p.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		duplicate, err = p.enqueue(tx, event)
		return err
	})
	return PublishResult{Duplicate: duplicate}, err
}

func (p *OutboxPublisher) PublishTx(ctx context.Context, tx *gorm.DB, event Event) error {
	_, err := p.enqueue(tx.WithContext(ctx), event)
	return err
}

func (p *OutboxPublisher) enqueue(tx *gorm.DB, event Event) (bool, error) {
	if err := ValidateEvent(event); err != nil {
		return false, err
	}
	var existing model.TelemetryOutbox
	result := tx.Where("event_id = ?", event.EventID).Limit(1).Find(&existing)
	if result.Error != nil {
		return false, result.Error
	}
	if result.RowsAffected == 1 {
		return true, nil
	}
	if event.ReceivedAt.IsZero() {
		event.ReceivedAt = p.clock.Now().UTC()
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return false, err
	}
	now := p.clock.Now().UTC()
	row := &model.TelemetryOutbox{
		EventID:       event.EventID,
		PayloadJSON:   payload,
		Status:        "pending",
		NextAttemptAt: now,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if err := tx.Create(row).Error; err != nil {
		return false, err
	}
	return false, nil
}

type Worker struct {
	db    *gorm.DB
	clock Clock
}

func NewWorker(db *gorm.DB, clock Clock) *Worker {
	return &Worker{db: db, clock: clock}
}

func (w *Worker) Run(ctx context.Context) error {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if err := w.ProcessBatch(ctx); err != nil {
				log.Printf("telemetry worker error: %v", err)
			}
		}
	}
}

func (w *Worker) ProcessBatch(ctx context.Context) error {
	now := w.clock.Now().UTC()
	var rows []model.TelemetryOutbox
	if err := w.db.WithContext(ctx).
		Where("(status = ? OR (status = ? AND leased_until < ?)) AND next_attempt_at <= ?", "pending", "processing", now, now).
		Order("created_at ASC").Limit(100).Find(&rows).Error; err != nil {
		return err
	}
	for _, row := range rows {
		if err := w.processOne(ctx, row); err != nil {
			return err
		}
	}
	return nil
}

func (w *Worker) processOne(ctx context.Context, row model.TelemetryOutbox) error {
	now := w.clock.Now().UTC()
	lease := now.Add(30 * time.Second)
	claimed := w.db.WithContext(ctx).Model(&model.TelemetryOutbox{}).
		Where("id = ? AND (status = ? OR (status = ? AND leased_until < ?))", row.ID, "pending", "processing", now).
		Updates(map[string]any{"status": "processing", "leased_until": lease, "updated_at": now})
	if claimed.Error != nil {
		return claimed.Error
	}
	if claimed.RowsAffected == 0 {
		return nil
	}

	var event Event
	if err := json.Unmarshal(row.PayloadJSON, &event); err != nil {
		return w.fail(row.ID, row.Attempts, err)
	}
	properties, err := json.Marshal(event.Properties)
	if err != nil {
		return w.fail(row.ID, row.Attempts, err)
	}
	raw := model.TelemetryEvent{
		EventID:        event.EventID,
		EventName:      event.Name,
		SchemaVersion:  event.SchemaVersion,
		OccurredAt:     event.OccurredAt,
		ReceivedAt:     event.ReceivedAt,
		ActorID:        event.ActorID,
		ActorRole:      event.ActorRole,
		SessionID:      optionalString(event.SessionID),
		AttemptID:      optionalString(event.AttemptID),
		ClassID:        event.ClassID,
		TopicID:        event.TopicID,
		Source:         event.Source,
		CorrelationID:  optionalString(event.CorrelationID),
		AppVersion:     event.AppVersion,
		ConsentState:   event.ConsentState,
		RetentionClass: event.RetentionClass,
		PropertiesJSON: properties,
		CreatedAt:      now,
	}
	tx := w.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return tx.Error
	}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&raw).Error; err != nil {
		tx.Rollback()
		return w.fail(row.ID, row.Attempts, err)
	}
	if err := tx.Model(&model.TelemetryOutbox{}).Where("id = ?", row.ID).Updates(map[string]any{
		"status":       "delivered",
		"delivered_at": now,
		"leased_until": nil,
		"updated_at":   now,
	}).Error; err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit().Error
}

func (w *Worker) fail(id uuid.UUID, attempts int, cause error) error {
	attempts++
	status := "pending"
	if attempts >= 8 {
		status = "dead_letter"
	}
	delay := time.Duration(1<<min(attempts, 9)) * time.Second
	now := w.clock.Now().UTC()
	return w.db.Model(&model.TelemetryOutbox{}).Where("id = ?", id).Updates(map[string]any{
		"status":          status,
		"attempts":        attempts,
		"next_attempt_at": now.Add(delay),
		"leased_until":    nil,
		"last_error":      cause.Error(),
		"updated_at":      now,
	}).Error
}

func min(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func optionalString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
