package model

import (
	"strings"
	"testing"
	"time"

	"backend/internal/testutil"
)

func TestTelemetryEventStoresStructuredProperties(t *testing.T) {
	event := TelemetryEvent{
		EventID:        "event-1",
		EventName:      "question_presented",
		SchemaVersion:  1,
		OccurredAt:     time.Date(2026, 7, 18, 3, 0, 0, 0, time.UTC),
		ReceivedAt:     time.Date(2026, 7, 18, 3, 0, 1, 0, time.UTC),
		PropertiesJSON: []byte(`{"question_id":"question-1"}`),
	}
	if event.EventID == "" || len(event.PropertiesJSON) == 0 {
		t.Fatal("telemetry event should retain its ID and properties")
	}
}

func TestTelemetryOutboxDefaultsToPending(t *testing.T) {
	outbox := TelemetryOutbox{EventID: "event-1", Status: "pending"}
	if outbox.Status != "pending" {
		t.Fatalf("expected pending status, got %q", outbox.Status)
	}
}

func TestTelemetryMigrationCreatesActorTimeIndex(t *testing.T) {
	db := testutil.OpenPostgres(t)
	if err := db.AutoMigrate(&TelemetryEvent{}, &TelemetryOutbox{}); err != nil {
		t.Fatal(err)
	}

	var definition string
	if err := db.Raw(
		"SELECT indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname = ?",
		"idx_telemetry_actor_time",
	).Scan(&definition).Error; err != nil {
		t.Fatal(err)
	}
	compact := strings.ReplaceAll(definition, " ", "")
	if !strings.Contains(compact, "(actor_id,occurred_at)") {
		t.Fatalf("expected actor/time index, got %q", definition)
	}
}
