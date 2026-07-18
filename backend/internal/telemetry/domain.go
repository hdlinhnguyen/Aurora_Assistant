package telemetry

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	CurrentSchemaVersion = 1
	MaxBatchEvents       = 100
	MaxPropertiesBytes   = 16 * 1024
)

var (
	ErrBatchTooLarge     = errors.New("telemetry batch too large")
	ErrInvalidEvent      = errors.New("invalid telemetry event")
	ErrSensitiveProperty = errors.New("sensitive telemetry property")
	ErrUnknownEvent      = errors.New("unknown telemetry event")
)

type Event struct {
	EventID        string         `json:"event_id"`
	Name           string         `json:"event_name"`
	SchemaVersion  int            `json:"schema_version"`
	OccurredAt     time.Time      `json:"occurred_at"`
	SessionID      string         `json:"session_id,omitempty"`
	AttemptID      string         `json:"attempt_id,omitempty"`
	ClassID        string         `json:"class_id,omitempty"`
	TopicID        string         `json:"topic_id,omitempty"`
	CorrelationID  string         `json:"correlation_id,omitempty"`
	AppVersion     string         `json:"app_version,omitempty"`
	ConsentState   string         `json:"consent_state"`
	RetentionClass string         `json:"retention_class"`
	Source         string         `json:"source"`
	Properties     map[string]any `json:"properties"`
}

type Batch struct {
	Events []Event `json:"events"`
}

func ValidateBatch(batch Batch) error {
	if len(batch.Events) == 0 || len(batch.Events) > MaxBatchEvents {
		return ErrBatchTooLarge
	}
	for index, event := range batch.Events {
		if err := ValidateEvent(event); err != nil {
			return fmt.Errorf("event %d: %w", index, err)
		}
	}
	return nil
}

func ValidateEvent(event Event) error {
	rule, ok := eventRules[event.Name]
	if !ok {
		return ErrUnknownEvent
	}
	if event.SchemaVersion != CurrentSchemaVersion || event.OccurredAt.IsZero() || event.OccurredAt.Location() != time.UTC {
		return ErrInvalidEvent
	}
	if _, err := uuid.Parse(event.EventID); err != nil {
		return ErrInvalidEvent
	}
	for _, value := range []string{event.SessionID, event.AttemptID, event.CorrelationID} {
		if value == "" {
			continue
		}
		if _, err := uuid.Parse(value); err != nil {
			return ErrInvalidEvent
		}
	}
	if !allowedValue(event.ConsentState, "required", "optional_allowed", "optional_denied") ||
		!allowedValue(event.RetentionClass, "interaction", "decision", "aggregate") ||
		!allowedValue(event.Source, "frontend", "go_backend", "learning_path") {
		return ErrInvalidEvent
	}
	for key := range event.Properties {
		if _, denied := sensitivePropertyKeys[strings.ToLower(key)]; denied {
			return ErrSensitiveProperty
		}
	}
	for _, key := range rule.RequiredProperties {
		if _, exists := event.Properties[key]; !exists {
			return fmt.Errorf("%w: missing property %s", ErrInvalidEvent, key)
		}
	}
	encoded, err := json.Marshal(event.Properties)
	if err != nil || len(encoded) > MaxPropertiesBytes {
		return ErrInvalidEvent
	}
	return nil
}

func allowedValue(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
