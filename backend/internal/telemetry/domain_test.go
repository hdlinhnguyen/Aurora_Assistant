package telemetry

import (
	"errors"
	"testing"
	"time"
)

func validEvent() Event {
	return Event{
		EventID:        "4d2a4a84-5c64-4e21-90ce-78b1cf5d9a3a",
		Name:           "question_presented",
		SchemaVersion:  1,
		OccurredAt:     time.Date(2026, 7, 18, 3, 0, 0, 0, time.UTC),
		SessionID:      "4baf78d5-c66f-4072-b124-622d0edbeb21",
		AttemptID:      "b5367a39-1c86-45fe-8242-4012f35e2680",
		TopicID:        "topic-fractions",
		Source:         "frontend",
		ConsentState:   "required",
		RetentionClass: "interaction",
		Properties: map[string]any{
			"question_id": "a245f073-cf33-4879-b7f6-96c80f032b22",
		},
	}
}

func TestValidateEventAcceptsKnownSchema(t *testing.T) {
	if err := ValidateEvent(validEvent()); err != nil {
		t.Fatalf("ValidateEvent() error = %v", err)
	}
}

func TestValidateEventRejectsSensitiveProperties(t *testing.T) {
	event := validEvent()
	event.Properties["answer_text"] = "raw student text"

	if err := ValidateEvent(event); !errors.Is(err, ErrSensitiveProperty) {
		t.Fatalf("expected ErrSensitiveProperty, got %v", err)
	}
}

func TestValidateEventRejectsNestedSensitiveProperties(t *testing.T) {
	event := validEvent()
	event.Properties["metadata"] = map[string]any{
		"profile": map[string]any{"email": "student@example.test"},
	}

	if err := ValidateEvent(event); !errors.Is(err, ErrSensitiveProperty) {
		t.Fatalf("expected ErrSensitiveProperty, got %v", err)
	}
}

func TestValidateEventRejectsUnknownEvent(t *testing.T) {
	event := validEvent()
	event.Name = "unknown_event"

	if err := ValidateEvent(event); !errors.Is(err, ErrUnknownEvent) {
		t.Fatalf("expected ErrUnknownEvent, got %v", err)
	}
}

func TestValidateEventRequiresUUIDAndUTC(t *testing.T) {
	tests := []struct {
		name  string
		alter func(*Event)
	}{
		{name: "event id", alter: func(event *Event) { event.EventID = "not-a-uuid" }},
		{name: "session id", alter: func(event *Event) { event.SessionID = "not-a-uuid" }},
		{name: "attempt id", alter: func(event *Event) { event.AttemptID = "not-a-uuid" }},
		{name: "UTC time", alter: func(event *Event) {
			event.OccurredAt = time.Date(2026, 7, 18, 10, 0, 0, 0, time.FixedZone("ICT", 7*60*60))
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			event := validEvent()
			test.alter(&event)
			if err := ValidateEvent(event); !errors.Is(err, ErrInvalidEvent) {
				t.Fatalf("expected ErrInvalidEvent, got %v", err)
			}
		})
	}
}

func TestValidateBatchRejectsMoreThanOneHundredEvents(t *testing.T) {
	batch := Batch{Events: make([]Event, 101)}
	if err := ValidateBatch(batch); !errors.Is(err, ErrBatchTooLarge) {
		t.Fatalf("expected ErrBatchTooLarge, got %v", err)
	}
}
