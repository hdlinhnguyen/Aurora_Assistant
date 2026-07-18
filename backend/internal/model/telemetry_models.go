package model

import (
	"time"

	"github.com/google/uuid"
)

type TelemetryEvent struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"-"`
	EventID        string    `gorm:"type:uuid;not null;uniqueIndex" json:"-"`
	EventName      string    `gorm:"type:varchar(100);not null;index:idx_telemetry_event_name_time" json:"-"`
	SchemaVersion  int       `gorm:"not null" json:"-"`
	OccurredAt     time.Time `gorm:"not null;index:idx_telemetry_event_name_time;index:idx_telemetry_actor_time,priority:2" json:"-"`
	ReceivedAt     time.Time `gorm:"not null" json:"-"`
	ActorID        string    `gorm:"type:varchar(128);not null;index:idx_telemetry_actor_time,priority:1" json:"-"`
	ActorRole      string    `gorm:"type:varchar(20);not null" json:"-"`
	SessionID      string    `gorm:"type:uuid;index" json:"-"`
	AttemptID      string    `gorm:"type:uuid;index" json:"-"`
	ClassID        string    `gorm:"type:varchar(128);index" json:"-"`
	TopicID        string    `gorm:"type:varchar(128);index" json:"-"`
	Source         string    `gorm:"type:varchar(30);not null" json:"-"`
	CorrelationID  string    `gorm:"type:uuid;index" json:"-"`
	AppVersion     string    `gorm:"type:varchar(100)" json:"-"`
	ConsentState   string    `gorm:"type:varchar(30);not null" json:"-"`
	RetentionClass string    `gorm:"type:varchar(30);not null;index" json:"-"`
	PropertiesJSON []byte    `gorm:"type:jsonb;not null" json:"-"`
	CreatedAt      time.Time `json:"-"`
}

type TelemetryOutbox struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"-"`
	EventID       string     `gorm:"type:uuid;not null;uniqueIndex" json:"-"`
	PayloadJSON   []byte     `gorm:"type:jsonb;not null" json:"-"`
	Status        string     `gorm:"type:varchar(20);not null;index:idx_telemetry_outbox_claim" json:"-"`
	Attempts      int        `gorm:"not null;default:0" json:"-"`
	NextAttemptAt time.Time  `gorm:"not null;index:idx_telemetry_outbox_claim" json:"-"`
	LeasedUntil   *time.Time `json:"-"`
	LastError     string     `gorm:"type:text" json:"-"`
	CreatedAt     time.Time  `json:"-"`
	UpdatedAt     time.Time  `json:"-"`
	DeliveredAt   *time.Time `json:"-"`
}
