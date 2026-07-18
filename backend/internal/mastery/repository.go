package mastery

import (
	"context"
	"encoding/json"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

func (r *Repository) UpsertStates(ctx context.Context, states []TopicState) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, state := range states {
			if err := ValidateState(state); err != nil {
				return err
			}
			current, err := currentModel(state)
			if err != nil {
				return err
			}
			if err := tx.Clauses(clause.OnConflict{
				Columns: []clause.Column{{Name: "student_id"}, {Name: "topic_id"}},
				DoUpdates: clause.AssignmentColumns([]string{
					"mastery_probability", "confidence_score", "consistency", "evidence_count",
					"effective_evidence", "mastery_status", "evidence_summary_json",
					"source_breakdown_json", "last_evidence_at", "version", "calculated_at", "updated_at",
				}),
			}).Create(&current).Error; err != nil {
				return err
			}
			history, err := historyModel(state)
			if err != nil {
				return err
			}
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&history).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *Repository) GetProfile(ctx context.Context, studentID uuid.UUID, subject string) (Profile, error) {
	var rows []model.StudentTopicMastery
	query := r.db.WithContext(ctx).Table("student_topic_masteries AS mastery").
		Select("mastery.*").
		Joins("JOIN nodes ON nodes.id = mastery.topic_id").
		Where("mastery.student_id = ? AND nodes.subject = ?", studentID, subject).
		Order("mastery.calculated_at DESC").Find(&rows)
	if query.Error != nil {
		return Profile{}, query.Error
	}
	profile := Profile{StudentID: studentID, Subject: subject, Topics: map[string]TopicState{}}
	for _, row := range rows {
		state, err := stateFromCurrent(row)
		if err != nil {
			return Profile{}, err
		}
		profile.Topics[row.TopicID.String()] = state
		if state.CalculatedAt.After(profile.CalculatedAt) {
			profile.CalculatedAt = state.CalculatedAt
		}
	}
	return profile, nil
}

func (r *Repository) GetHistory(ctx context.Context, studentID, topicID uuid.UUID, historyRange string) ([]HistoryPoint, error) {
	cutoff, err := HistoryCutoff(time.Now().UTC(), historyRange)
	if err != nil {
		return nil, err
	}
	query := r.db.WithContext(ctx).Where("student_id = ? AND topic_id = ?", studentID, topicID)
	if !cutoff.IsZero() {
		query = query.Where("recorded_at >= ?", cutoff)
	}
	var rows []model.StudentTopicMasteryHistory
	if err := query.Order("recorded_at ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]HistoryPoint, 0, len(rows))
	for _, row := range rows {
		state, err := stateFromHistory(row)
		if err != nil {
			return nil, err
		}
		result = append(result, HistoryPoint{TopicState: state, RecordedAt: row.RecordedAt, TriggerEvidenceID: row.TriggerEvidenceID})
	}
	return result, nil
}

func currentModel(state TopicState) (model.StudentTopicMastery, error) {
	evidenceSummary, err := json.Marshal(state.EvidenceSummary)
	if err != nil {
		return model.StudentTopicMastery{}, err
	}
	sourceBreakdown, err := json.Marshal(state.SourceBreakdown)
	if err != nil {
		return model.StudentTopicMastery{}, err
	}
	return model.StudentTopicMastery{
		ID: uuid.New(), StudentID: state.StudentID, TopicID: state.TopicID,
		MasteryProbability: state.MasteryProbability, ConfidenceScore: state.ConfidenceScore,
		Consistency: state.Consistency, EvidenceCount: state.EvidenceCount,
		EffectiveEvidence: state.EffectiveEvidence, MasteryStatus: state.Status,
		EvidenceSummaryJSON: string(evidenceSummary), SourceBreakdownJSON: string(sourceBreakdown),
		LastEvidenceAt: state.LastEvidenceAt, Version: state.Version,
		CalculatedAt: state.CalculatedAt, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
	}, nil
}

func historyModel(state TopicState) (model.StudentTopicMasteryHistory, error) {
	current, err := currentModel(state)
	if err != nil {
		return model.StudentTopicMasteryHistory{}, err
	}
	return model.StudentTopicMasteryHistory{
		ID: uuid.New(), StudentID: current.StudentID, TopicID: current.TopicID, Version: current.Version,
		MasteryProbability: current.MasteryProbability, ConfidenceScore: current.ConfidenceScore,
		Consistency: current.Consistency, EvidenceCount: current.EvidenceCount,
		EffectiveEvidence: current.EffectiveEvidence, MasteryStatus: current.MasteryStatus,
		EvidenceSummaryJSON: current.EvidenceSummaryJSON, SourceBreakdownJSON: current.SourceBreakdownJSON,
		LastEvidenceAt: current.LastEvidenceAt, CalculatedAt: current.CalculatedAt,
		RecordedAt: time.Now().UTC(),
	}, nil
}

func stateFromCurrent(row model.StudentTopicMastery) (TopicState, error) {
	var evidence map[string]float64
	var sources map[string]int
	if err := json.Unmarshal([]byte(row.EvidenceSummaryJSON), &evidence); err != nil {
		return TopicState{}, err
	}
	if err := json.Unmarshal([]byte(row.SourceBreakdownJSON), &sources); err != nil {
		return TopicState{}, err
	}
	return TopicState{StudentID: row.StudentID, TopicID: row.TopicID, MasteryProbability: row.MasteryProbability, ConfidenceScore: row.ConfidenceScore, Consistency: row.Consistency, EvidenceCount: row.EvidenceCount, EffectiveEvidence: row.EffectiveEvidence, Status: row.MasteryStatus, EvidenceSummary: evidence, SourceBreakdown: sources, Version: row.Version, LastEvidenceAt: row.LastEvidenceAt, CalculatedAt: row.CalculatedAt}, nil
}

func stateFromHistory(row model.StudentTopicMasteryHistory) (TopicState, error) {
	return stateFromCurrent(model.StudentTopicMastery{StudentID: row.StudentID, TopicID: row.TopicID, MasteryProbability: row.MasteryProbability, ConfidenceScore: row.ConfidenceScore, Consistency: row.Consistency, EvidenceCount: row.EvidenceCount, EffectiveEvidence: row.EffectiveEvidence, MasteryStatus: row.MasteryStatus, EvidenceSummaryJSON: row.EvidenceSummaryJSON, SourceBreakdownJSON: row.SourceBreakdownJSON, LastEvidenceAt: row.LastEvidenceAt, Version: row.Version, CalculatedAt: row.CalculatedAt})
}
