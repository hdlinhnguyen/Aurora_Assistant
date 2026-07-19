package service

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (s *tutorService) learningState(studentID, topicID uuid.UUID) (*model.TutorLearningState, error) {
	var state model.TutorLearningState
	err := s.db.Where("student_id = ? AND topic_id = ?", studentID, topicID).First(&state).Error
	if err == nil {
		return &state, nil
	}
	if err != gorm.ErrRecordNotFound {
		return nil, err
	}
	state = model.TutorLearningState{
		ID: uuid.New(), StudentID: studentID, TopicID: topicID,
		Phase: "diagnose", LastAction: "ASK_DIAGNOSTIC",
	}
	if err := s.db.Create(&state).Error; err != nil {
		return nil, err
	}
	return &state, nil
}

func (s *tutorService) RecordHint(studentID, topicID uuid.UUID, level int) (*model.TutorLearningState, error) {
	state, err := s.learningState(studentID, topicID)
	if err != nil {
		return nil, err
	}
	if level < 1 {
		level = 1
	}
	state.HintLevel = min(level, 3)
	state.Phase = "guided_practice"
	state.VerificationRequired = true
	switch {
	case level == 1:
		state.LastAction = "GIVE_SMALL_HINT"
	case level == 2:
		state.LastAction = "GIVE_FIRST_PRINCIPLE"
	case level == 3:
		state.LastAction = "GIVE_WORKED_EXAMPLE"
	default:
		state.LastAction = "MOVE_TO_PREREQUISITE"
	}
	state.UpdatedAt = time.Now()
	return state, s.db.Save(state).Error
}

func (s *tutorService) RecordLearningAnswer(
	studentID uuid.UUID,
	question *model.Question,
	selectedOption int,
	correct bool,
) (*model.TutorLearningState, error) {
	state, err := s.learningState(studentID, question.NodeID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	if correct {
		state.ConsecutiveErrors = 0
		switch {
		case state.VerificationRequired && state.Phase != "independent_practice":
			state.Phase = "independent_practice"
			state.LastAction = "GIVE_INDEPENDENT_QUESTION"
		case state.VerificationRequired:
			state.Phase = "review_later"
			state.VerificationRequired = false
			state.HintLevel = 0
			state.LastAction = "SCHEDULE_REVIEW"
			reviewAt := now.Add(7 * 24 * time.Hour)
			state.NextReviewAt = &reviewAt
		default:
			state.Phase = "verify"
			state.LastAction = "INCREASE_DIFFICULTY"
		}
		_ = s.resolveMisconceptions(studentID, question.NodeID)
	} else {
		state.ConsecutiveErrors++
		state.VerificationRequired = true
		switch {
		case state.ConsecutiveErrors == 1:
			state.Phase = "diagnose"
			state.LastAction = "ASK_DIAGNOSTIC"
		case state.ConsecutiveErrors == 2:
			state.Phase = "explain"
			state.LastAction = "GIVE_COUNTEREXAMPLE"
		default:
			state.Phase = "guided_practice"
			state.LastAction = "RETEACH_CONCEPT"
		}
		_ = s.rememberMisconception(studentID, question, selectedOption, now)
	}
	state.UpdatedAt = now
	return state, s.db.Save(state).Error
}

// RecordChatSignal adapts the tutoring action without treating free-form chat as
// verified mastery evidence. Only a subsequent scored answer may change mastery.
func (s *tutorService) RecordChatSignal(studentID, topicID uuid.UUID, message string) (*model.TutorLearningState, error) {
	state, err := s.learningState(studentID, topicID)
	if err != nil {
		return nil, err
	}

	normalized := strings.ToLower(strings.TrimSpace(message))
	switch {
	case containsAny(normalized, "gợi ý", "goi y", "hint"):
		return s.RecordHint(studentID, topicID, state.HintLevel+1)
	case containsAny(normalized, "không biết", "khong biet", "không hiểu", "khong hieu", "chịu", "chiu", "khó quá", "kho qua"):
		state.ConsecutiveErrors++
		state.VerificationRequired = true
		state.Phase = "explain"
		if state.ConsecutiveErrors >= 2 {
			state.LastAction = "RETEACH_CONCEPT"
		} else {
			state.LastAction = "GIVE_COUNTEREXAMPLE"
		}
	case state.VerificationRequired:
		state.Phase = "independent_practice"
		state.LastAction = "GIVE_INDEPENDENT_QUESTION"
	default:
		state.Phase = "diagnose"
		state.LastAction = "ASK_DIAGNOSTIC"
	}
	state.UpdatedAt = time.Now()
	return state, s.db.Save(state).Error
}

func containsAny(value string, candidates ...string) bool {
	for _, candidate := range candidates {
		if strings.Contains(value, candidate) {
			return true
		}
	}
	return false
}

func (s *tutorService) rememberMisconception(studentID uuid.UUID, question *model.Question, selectedOption int, now time.Time) error {
	var mappings map[string]string
	if json.Unmarshal([]byte(question.DistractorMappings), &mappings) != nil {
		return nil
	}
	key := fmt.Sprintf("option_%c", rune('a'+selectedOption))
	mapped := mappings[fmt.Sprintf("%d", selectedOption)]
	if mapped == "" {
		mapped = mappings[key]
	}
	if strings.TrimSpace(mapped) == "" {
		return nil
	}
	row := model.MisconceptionMemory{
		ID: uuid.New(), StudentID: studentID, TopicID: question.NodeID,
		Key: mapped, Occurrences: 1, Confidence: 0.35,
		LastObservedAt: now, CreatedAt: now, UpdatedAt: now,
	}
	return s.db.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "student_id"}, {Name: "topic_id"}, {Name: "key"}},
		DoUpdates: clause.Assignments(map[string]any{
			"occurrences":      gorm.Expr("misconception_memories.occurrences + 1"),
			"confidence":       gorm.Expr("LEAST(0.95, misconception_memories.confidence + 0.15)"),
			"resolved":         false,
			"last_observed_at": now,
			"updated_at":       now,
		}),
	}).Create(&row).Error
}

func (s *tutorService) resolveMisconceptions(studentID, topicID uuid.UUID) error {
	return s.db.Model(&model.MisconceptionMemory{}).
		Where("student_id = ? AND topic_id = ? AND resolved = ?", studentID, topicID, false).
		Updates(map[string]any{
			"confidence": gorm.Expr("GREATEST(0, confidence - ?)", 0.2),
			"resolved":   gorm.Expr("confidence <= ?", 0.2),
			"updated_at": time.Now(),
		}).Error
}
