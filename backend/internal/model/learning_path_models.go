package model

import (
	"time"

	"github.com/google/uuid"
)

type LearningPathStepProgress struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	LearningPathID   uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_learning_path_step_key;index:idx_learning_path_step_order" json:"learningPathId"`
	StudentID        uuid.UUID  `gorm:"type:uuid;not null;index:idx_student_path_status" json:"studentId"`
	TopicID          uuid.UUID  `gorm:"type:uuid;not null" json:"topicId"`
	StepKey          string     `gorm:"type:varchar(200);not null;uniqueIndex:idx_learning_path_step_key" json:"stepKey"`
	StepOrder        int        `gorm:"not null;index:idx_learning_path_step_order" json:"stepOrder"`
	Status           string     `gorm:"type:varchar(20);not null;index:idx_student_path_status" json:"status"`
	Attempts         int        `gorm:"not null;default:0" json:"attempts"`
	CorrectAnswers   int        `gorm:"not null;default:0" json:"correctAnswers"`
	HintCount        int        `gorm:"not null;default:0" json:"hintCount"`
	MasteryBefore    *float64   `json:"masteryBefore"`
	MasteryAfter     *float64   `json:"masteryAfter"`
	ConfidenceBefore *float64   `json:"confidenceBefore"`
	ConfidenceAfter  *float64   `json:"confidenceAfter"`
	BlockedReason    *string    `gorm:"type:varchar(40)" json:"blockedReason"`
	StartedAt        *time.Time `json:"startedAt"`
	CompletedAt      *time.Time `json:"completedAt"`
	BlockedAt        *time.Time `json:"blockedAt"`
	LastActivityAt   *time.Time `json:"lastActivityAt"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}
