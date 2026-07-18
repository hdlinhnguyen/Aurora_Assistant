package telemetry

import (
	"context"
	"encoding/json"
	"time"

	"backend/internal/model"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type RebuildResult struct {
	AttemptsUpserted int
	MissingPresented int
	MissingGrade     int
}

type attemptAccumulator struct {
	fact       model.QuestionAttemptFact
	presented  bool
	submitted  bool
	graded     bool
	hintEvents int
}

func RebuildRange(ctx context.Context, db *gorm.DB, from, to time.Time) (RebuildResult, error) {
	var events []model.TelemetryEvent
	if err := db.WithContext(ctx).
		Where("occurred_at >= ? AND occurred_at < ? AND attempt_id IS NOT NULL", from, to).
		Where("event_name IN ?", []string{
			"question_presented", "question_answer_submitted", "question_graded",
			"question_abandoned", "hint_rendered",
		}).Order("occurred_at ASC, event_id ASC").Find(&events).Error; err != nil {
		return RebuildResult{}, err
	}

	attempts := map[string]*attemptAccumulator{}
	for _, event := range events {
		if event.AttemptID == nil {
			continue
		}
		attemptID := *event.AttemptID
		current := attempts[attemptID]
		if current == nil {
			current = &attemptAccumulator{fact: model.QuestionAttemptFact{
				AttemptID: attemptID, SessionID: event.SessionID, ActorID: event.ActorID,
				TopicID: event.TopicID, QualityFlagsJSON: []byte("[]"),
			}}
			attempts[attemptID] = current
		}
		var properties map[string]any
		if err := json.Unmarshal(event.PropertiesJSON, &properties); err != nil {
			continue
		}
		if questionID, ok := properties["question_id"].(string); ok {
			current.fact.QuestionID = questionID
		}
		switch event.EventName {
		case "question_presented":
			occurredAt := event.OccurredAt
			current.fact.PresentedAt = &occurredAt
			current.presented = true
		case "question_answer_submitted":
			occurredAt := event.OccurredAt
			current.fact.SubmittedAt = &occurredAt
			current.fact.ElapsedTimeMS = int64Property(properties, "elapsed_time_ms")
			current.fact.ActiveTimeMS = int64Property(properties, "active_time_ms")
			current.fact.HintTimeMS = int64Property(properties, "hint_time_ms")
			current.fact.AnswerChangeCount = intProperty(properties, "answer_change_count")
			current.fact.HintCount = intProperty(properties, "hint_count")
			if selected, ok := intPointer(properties, "selected_option"); ok {
				current.fact.SelectedOption = selected
			}
			current.submitted = true
		case "question_graded":
			if correct, ok := properties["is_correct"].(bool); ok {
				current.fact.IsCorrect = &correct
			}
			current.graded = true
		case "question_abandoned":
			current.fact.Abandoned = true
			current.fact.ElapsedTimeMS = int64Property(properties, "elapsed_time_ms")
			current.fact.ActiveTimeMS = int64Property(properties, "active_time_ms")
		case "hint_rendered":
			current.hintEvents++
		}
	}

	result := RebuildResult{}
	for _, current := range attempts {
		flags := make([]string, 0, 2)
		if !current.presented {
			flags = append(flags, "missing_presented")
			result.MissingPresented++
		}
		if current.submitted && !current.graded {
			flags = append(flags, "missing_grade")
			result.MissingGrade++
		}
		if current.hintEvents > current.fact.HintCount {
			current.fact.HintCount = current.hintEvents
		}
		current.fact.QualityFlagsJSON, _ = json.Marshal(flags)
		current.fact.UpdatedAt = time.Now().UTC()
		if err := db.WithContext(ctx).Clauses(clause.OnConflict{
			Columns:   []clause.Column{{Name: "attempt_id"}},
			UpdateAll: true,
		}).Create(&current.fact).Error; err != nil {
			return result, err
		}
		result.AttemptsUpserted++
	}
	return result, nil
}

func PurgeRawInteractions(ctx context.Context, db *gorm.DB, cutoff time.Time) (int64, error) {
	result := db.WithContext(ctx).
		Where("retention_class = ? AND occurred_at < ?", "interaction", cutoff).
		Delete(&model.TelemetryEvent{})
	return result.RowsAffected, result.Error
}

func int64Property(properties map[string]any, key string) int64 {
	if value, ok := properties[key].(float64); ok && value >= 0 {
		return int64(value)
	}
	return 0
}

func intProperty(properties map[string]any, key string) int {
	return int(int64Property(properties, key))
}

func intPointer(properties map[string]any, key string) (*int, bool) {
	value, ok := properties[key].(float64)
	if !ok {
		return nil, false
	}
	converted := int(value)
	return &converted, true
}
