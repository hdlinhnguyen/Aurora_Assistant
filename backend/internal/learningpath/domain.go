package learningpath

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrPathNotFound           = errors.New("learning path not found")
	ErrStepNotFound           = errors.New("learning path step not found")
	ErrPrerequisiteIncomplete = errors.New("learning path prerequisite incomplete")
	ErrDuplicateTopic         = errors.New("learning path contains duplicate topic")
	ErrForbidden              = errors.New("learning path access forbidden")
)

const (
	StatusPending    = "pending"
	StatusInProgress = "in_progress"
	StatusCompleted  = "completed"
	StatusBlocked    = "blocked"

	BlockedReasonLowAccuracy       = "low_accuracy"
	BlockedReasonCantDo            = "cant_do"
	BlockedReasonAdaptiveDowngrade = "adaptive_downgrade"

	CompletionMasteryThreshold    = 0.80
	CompletionConfidenceThreshold = 0.60
)

const (
	EvidenceAnswer            = "answer"
	EvidenceHint              = "hint"
	EvidenceCantDo            = "cant_do"
	EvidenceAdaptiveDowngrade = "adaptive_downgrade"
)

type MasteryReader interface {
	TopicMastery(context.Context, uuid.UUID, uuid.UUID) (mastery float64, confidence float64, found bool, err error)
}

type ApplyEvidenceInput struct {
	StudentID  uuid.UUID
	TopicID    uuid.UUID
	Kind       string
	Correct    bool
	Mastery    *float64
	Confidence *float64
	Reason     string
}

type ProgressStepView struct {
	LearningPathID   uuid.UUID  `json:"learningPathId"`
	TopicID          uuid.UUID  `json:"topicId"`
	StepOrder        int        `json:"stepOrder"`
	Status           string     `json:"status"`
	Attempts         int        `json:"attempts"`
	CorrectAnswers   int        `json:"correctAnswers"`
	HintCount        int        `json:"hintCount"`
	MasteryBefore    *float64   `json:"masteryBefore"`
	MasteryAfter     *float64   `json:"masteryAfter"`
	ConfidenceBefore *float64   `json:"confidenceBefore"`
	ConfidenceAfter  *float64   `json:"confidenceAfter"`
	BlockedReason    *string    `json:"blockedReason"`
	StartedAt        *time.Time `json:"startedAt"`
	CompletedAt      *time.Time `json:"completedAt"`
	BlockedAt        *time.Time `json:"blockedAt"`
	LastActivityAt   *time.Time `json:"lastActivityAt"`
}

type LearningPathProgressView struct {
	ID                uuid.UUID          `json:"id"`
	ClassID           string             `json:"classId"`
	OrderedSteps      []map[string]any   `json:"ordered_steps"`
	CompletedSteps    int                `json:"completedSteps"`
	TotalSteps        int                `json:"totalSteps"`
	CompletionPercent int                `json:"completionPercent"`
	NextStep          *ProgressStepView  `json:"nextStep"`
	BlockedSteps      []ProgressStepView `json:"blockedSteps"`
	Steps             []ProgressStepView `json:"steps"`
}

func NextStatus(current string, attempts, correctAnswers int, blockedReason string, mastery, confidence float64) string {
	if mastery >= CompletionMasteryThreshold && confidence >= CompletionConfidenceThreshold {
		return StatusCompleted
	}
	if blockedReason == BlockedReasonCantDo || blockedReason == BlockedReasonAdaptiveDowngrade {
		return StatusBlocked
	}
	if attempts >= 3 && float64(correctAnswers)/float64(attempts) < 0.50 {
		return StatusBlocked
	}
	if current == StatusBlocked {
		return StatusInProgress
	}
	return current
}
