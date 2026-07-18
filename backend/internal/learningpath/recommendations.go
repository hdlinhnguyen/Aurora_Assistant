package learningpath

import (
	"context"
	"sort"
	"strings"

	"backend/internal/model"

	"gorm.io/gorm"
)

const (
	AutoDraftMasteryThreshold    = 0.40
	AutoDraftConfidenceThreshold = 0.60
)

type RecommendationState struct {
	StudentID  string  `json:"studentId"`
	TopicID    string  `json:"topicId"`
	Mastery    float64 `json:"mastery"`
	Confidence float64 `json:"confidence"`
}

type RecommendationResult struct {
	Reliable             []RecommendationState `json:"reliable"`
	InsufficientEvidence []RecommendationState `json:"insufficientEvidence"`
	TargetsByStudent     map[string][]string   `json:"targetsByStudent"`
}

func ClassifyRecommendations(states []RecommendationState) RecommendationResult {
	result := RecommendationResult{TargetsByStudent: make(map[string][]string)}
	for _, state := range states {
		if state.Mastery >= AutoDraftMasteryThreshold {
			continue
		}
		if state.Confidence > AutoDraftConfidenceThreshold {
			result.Reliable = append(result.Reliable, state)
			result.TargetsByStudent[state.StudentID] = append(result.TargetsByStudent[state.StudentID], state.TopicID)
			continue
		}
		result.InsufficientEvidence = append(result.InsufficientEvidence, state)
	}

	sortRecommendationStates(result.Reliable)
	sortRecommendationStates(result.InsufficientEvidence)
	for studentID := range result.TargetsByStudent {
		sort.Strings(result.TargetsByStudent[studentID])
	}
	return result
}

func LoadRecommendationStates(ctx context.Context, db *gorm.DB, studentIDs []string, subject string) ([]RecommendationState, error) {
	if len(studentIDs) == 0 || strings.TrimSpace(subject) == "" {
		return []RecommendationState{}, nil
	}
	var rows []model.StudentTopicMastery
	err := db.WithContext(ctx).Table("student_topic_masteries AS mastery").
		Select("mastery.*").
		Joins("JOIN nodes ON nodes.id = mastery.topic_id").
		Where("mastery.student_id IN ? AND nodes.subject = ? AND nodes.is_root = ?", studentIDs, subject, false).
		Order("mastery.student_id, mastery.topic_id").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	states := make([]RecommendationState, 0, len(rows))
	for _, row := range rows {
		states = append(states, RecommendationState{
			StudentID: row.StudentID.String(), TopicID: row.TopicID.String(),
			Mastery: row.MasteryProbability, Confidence: row.ConfidenceScore,
		})
	}
	return states, nil
}

func sortRecommendationStates(states []RecommendationState) {
	sort.Slice(states, func(i, j int) bool {
		if states[i].Mastery != states[j].Mastery {
			return states[i].Mastery < states[j].Mastery
		}
		if states[i].Confidence != states[j].Confidence {
			return states[i].Confidence > states[j].Confidence
		}
		if states[i].StudentID != states[j].StudentID {
			return states[i].StudentID < states[j].StudentID
		}
		return states[i].TopicID < states[j].TopicID
	})
}
