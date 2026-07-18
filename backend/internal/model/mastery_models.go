package model

import (
	"time"

	"github.com/google/uuid"
)

type StudentTopicMastery struct {
	ID                  uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	StudentID           uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_student_topic_mastery" json:"studentId"`
	TopicID             uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_student_topic_mastery" json:"topicId"`
	MasteryProbability  float64    `gorm:"not null" json:"masteryProbability"`
	ConfidenceScore     float64    `gorm:"not null" json:"confidenceScore"`
	Consistency         float64    `gorm:"not null" json:"consistency"`
	EvidenceCount       int        `gorm:"not null" json:"evidenceCount"`
	EffectiveEvidence   float64    `gorm:"not null" json:"effectiveEvidence"`
	MasteryStatus       string     `gorm:"type:varchar(30);not null" json:"masteryStatus"`
	EvidenceSummaryJSON string     `gorm:"type:text;not null" json:"evidenceSummaryJson"`
	SourceBreakdownJSON string     `gorm:"type:text;not null" json:"sourceBreakdownJson"`
	LastEvidenceAt      *time.Time `json:"lastEvidenceAt"`
	Version             int        `gorm:"not null" json:"version"`
	CalculatedAt        time.Time  `gorm:"not null" json:"calculatedAt"`
	CreatedAt           time.Time  `json:"createdAt"`
	UpdatedAt           time.Time  `json:"updatedAt"`
}

type StudentTopicMasteryHistory struct {
	ID                  uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	StudentID           uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_student_topic_mastery_history" json:"studentId"`
	TopicID             uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_student_topic_mastery_history" json:"topicId"`
	Version             int        `gorm:"not null;uniqueIndex:idx_student_topic_mastery_history" json:"version"`
	MasteryProbability  float64    `gorm:"not null" json:"masteryProbability"`
	ConfidenceScore     float64    `gorm:"not null" json:"confidenceScore"`
	Consistency         float64    `gorm:"not null" json:"consistency"`
	EvidenceCount       int        `gorm:"not null" json:"evidenceCount"`
	EffectiveEvidence   float64    `gorm:"not null" json:"effectiveEvidence"`
	MasteryStatus       string     `gorm:"type:varchar(30);not null" json:"masteryStatus"`
	EvidenceSummaryJSON string     `gorm:"type:text;not null" json:"evidenceSummaryJson"`
	SourceBreakdownJSON string     `gorm:"type:text;not null" json:"sourceBreakdownJson"`
	LastEvidenceAt      *time.Time `json:"lastEvidenceAt"`
	CalculatedAt        time.Time  `gorm:"not null" json:"calculatedAt"`
	TriggerEvidenceID   string     `gorm:"type:varchar(255)" json:"triggerEvidenceId"`
	RecordedAt          time.Time  `gorm:"not null" json:"recordedAt"`
}
