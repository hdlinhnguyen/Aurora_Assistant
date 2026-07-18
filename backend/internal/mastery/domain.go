package mastery

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

const (
	StatusUnknown      = "unknown"
	StatusUncertain    = "uncertain"
	StatusLearning     = "learning"
	StatusConfirmedGap = "confirmed_gap"
	StatusMastered     = "mastered"
	Range30d           = "30d"
	Range90d           = "90d"
	RangeAll           = "all"
)

var ErrForbidden = errors.New("mastery profile access forbidden")

type TopicState struct {
	StudentID          uuid.UUID          `json:"studentId"`
	TopicID            uuid.UUID          `json:"topicId"`
	MasteryProbability float64            `json:"masteryProbability"`
	ConfidenceScore    float64            `json:"confidenceScore"`
	Consistency        float64            `json:"consistency"`
	EvidenceCount      int                `json:"evidenceCount"`
	EffectiveEvidence  float64            `json:"effectiveEvidence"`
	Status             string             `json:"masteryStatus"`
	EvidenceSummary    map[string]float64 `json:"evidenceSummary"`
	SourceBreakdown    map[string]int     `json:"sourceBreakdown"`
	Version            int                `json:"version"`
	LastEvidenceAt     *time.Time         `json:"lastEvidenceAt"`
	CalculatedAt       time.Time          `json:"calculatedAt"`
}

type HistoryPoint struct {
	TopicState
	RecordedAt        time.Time `json:"recordedAt"`
	TriggerEvidenceID string    `json:"triggerEvidenceId"`
}

type Profile struct {
	StudentID    uuid.UUID             `json:"studentId"`
	Subject      string                `json:"subject"`
	CalculatedAt time.Time             `json:"calculatedAt"`
	Topics       map[string]TopicState `json:"topics"`
}

func ValidateState(state TopicState) error {
	if state.StudentID == uuid.Nil || state.TopicID == uuid.Nil {
		return errors.New("student_id and topic_id are required")
	}
	if state.MasteryProbability < 0 || state.MasteryProbability > 1 {
		return fmt.Errorf("mastery_probability must be between 0 and 1")
	}
	if state.ConfidenceScore < 0 || state.ConfidenceScore > 1 {
		return fmt.Errorf("confidence_score must be between 0 and 1")
	}
	if state.Consistency < 0 || state.Consistency > 1 {
		return fmt.Errorf("consistency must be between 0 and 1")
	}
	if state.EvidenceCount < 0 || state.EffectiveEvidence < 0 || state.Version < 1 {
		return errors.New("evidence and version values must be non-negative and version must be positive")
	}
	switch state.Status {
	case StatusUnknown, StatusUncertain, StatusLearning, StatusConfirmedGap, StatusMastered:
		return nil
	default:
		return fmt.Errorf("invalid mastery status %q", state.Status)
	}
}

func HistoryCutoff(now time.Time, historyRange string) (time.Time, error) {
	switch historyRange {
	case RangeAll:
		return time.Time{}, nil
	case Range30d:
		return now.Add(-30 * 24 * time.Hour), nil
	case Range90d:
		return now.Add(-90 * 24 * time.Hour), nil
	default:
		return time.Time{}, fmt.Errorf("invalid history range %q", historyRange)
	}
}
