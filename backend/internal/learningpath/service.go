package learningpath

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"time"

	"backend/internal/model"
	"backend/internal/telemetry"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Service struct {
	db        *gorm.DB
	publisher telemetry.ActorPublisher
	mastery   MasteryReader
}

type pathPayload struct {
	OrderedSteps []pathStepPayload `json:"ordered_steps"`
}

type pathStepPayload struct {
	Order   int    `json:"order"`
	TopicID string `json:"topic_id"`
	StepKey string `json:"step_key"`
}

func NewService(db *gorm.DB, publisher telemetry.ActorPublisher, mastery MasteryReader) *Service {
	return &Service{db: db, publisher: publisher, mastery: mastery}
}

func (s *Service) Initialize(ctx context.Context, path *model.LearningPath) error {
	var payload pathPayload
	if err := json.Unmarshal([]byte(path.StepsJSON), &payload); err != nil {
		return err
	}
	seen := make(map[uuid.UUID]struct{}, len(payload.OrderedSteps))
	parsedTopics := make([]uuid.UUID, len(payload.OrderedSteps))
	for index, step := range payload.OrderedSteps {
		topicID, err := uuid.Parse(step.TopicID)
		if err != nil {
			return err
		}
		if _, exists := seen[topicID]; exists {
			return ErrDuplicateTopic
		}
		seen[topicID] = struct{}{}
		parsedTopics[index] = topicID
	}
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		activeAssigned := false
		for index, step := range payload.OrderedSteps {
			topicID := parsedTopics[index]
			stepKey := step.StepKey
			if stepKey == "" {
				stepKey = topicID.String()
			}
			status := StatusPending
			var masteryBefore, confidenceBefore *float64
			if s.mastery != nil {
				mastery, confidence, found, err := s.mastery.TopicMastery(ctx, path.StudentID, topicID)
				if err != nil {
					return err
				}
				if found {
					masteryBefore = &mastery
					confidenceBefore = &confidence
					if mastery >= CompletionMasteryThreshold && confidence >= CompletionConfidenceThreshold {
						status = StatusCompleted
					}
				}
			}
			if status != StatusCompleted && !activeAssigned {
				status = StatusInProgress
				activeAssigned = true
			}
			row := model.LearningPathStepProgress{
				ID: uuid.New(), LearningPathID: path.ID, StudentID: path.StudentID, TopicID: topicID,
				StepKey: stepKey, StepOrder: step.Order, Status: status,
				MasteryBefore: masteryBefore, MasteryAfter: masteryBefore,
				ConfidenceBefore: confidenceBefore, ConfidenceAfter: confidenceBefore,
				CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
			}
			if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&row).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *Service) ApplyEvidence(ctx context.Context, input ApplyEvidenceInput) (ProgressStepView, error) {
	var result model.LearningPathStepProgress
	beforeStatus := ""
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var path model.LearningPath
		if err := tx.Where("student_id = ? AND status = ?", input.StudentID, "Approved").Order("created_at DESC").First(&path).Error; err != nil {
			return err
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where(
			"learning_path_id = ? AND student_id = ? AND topic_id = ?", path.ID, input.StudentID, input.TopicID,
		).First(&result).Error; err != nil {
			return err
		}

		before := result.Status
		beforeStatus = before
		now := time.Now().UTC()
		switch input.Kind {
		case EvidenceAnswer:
			result.Attempts++
			if input.Correct {
				result.CorrectAnswers++
			}
		case EvidenceHint:
			result.HintCount++
		case EvidenceCantDo:
			input.Reason = BlockedReasonCantDo
		case EvidenceAdaptiveDowngrade:
			input.Reason = BlockedReasonAdaptiveDowngrade
		}
		if (input.Mastery == nil || input.Confidence == nil) && s.mastery != nil {
			mastery, confidence, found, masteryErr := s.mastery.TopicMastery(ctx, input.StudentID, input.TopicID)
			if masteryErr != nil {
				log.Printf("learning path mastery lookup failed: %v", masteryErr)
			} else if found {
				input.Mastery = &mastery
				input.Confidence = &confidence
			}
		}
		if input.Mastery != nil {
			result.MasteryAfter = input.Mastery
		}
		if input.Confidence != nil {
			result.ConfidenceAfter = input.Confidence
		}
		mastery, confidence := 0.0, 0.0
		if result.MasteryAfter != nil {
			mastery = *result.MasteryAfter
		}
		if result.ConfidenceAfter != nil {
			confidence = *result.ConfidenceAfter
		}
		if input.Reason == "" && result.Attempts >= 3 && float64(result.CorrectAnswers)/float64(result.Attempts) < .50 {
			input.Reason = BlockedReasonLowAccuracy
		}
		result.Status = NextStatus(before, result.Attempts, result.CorrectAnswers, input.Reason, mastery, confidence)
		result.LastActivityAt = &now
		result.UpdatedAt = now
		if result.Status == StatusCompleted {
			result.CompletedAt = &now
			result.BlockedReason = nil
			result.BlockedAt = nil
		} else if result.Status == StatusBlocked {
			reason := input.Reason
			result.BlockedReason = &reason
			result.BlockedAt = &now
		}
		if err := tx.Save(&result).Error; err != nil {
			return err
		}
		if before != StatusCompleted && result.Status == StatusCompleted {
			var next model.LearningPathStepProgress
			err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where(
				"learning_path_id = ? AND step_order > ? AND status = ?", path.ID, result.StepOrder, StatusPending,
			).Order("step_order").First(&next).Error
			if err == nil {
				next.Status = StatusInProgress
				next.StartedAt = &now
				next.UpdatedAt = now
				return tx.Save(&next).Error
			}
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
		}
		return nil
	})
	if err == nil {
		s.publishProgressEvent(ctx, input.StudentID, beforeStatus, result)
	}
	return stepView(result), err
}

func (s *Service) publishProgressEvent(ctx context.Context, studentID uuid.UUID, before string, row model.LearningPathStepProgress) {
	if s.publisher == nil {
		return
	}
	name := "learning_path_step_progressed"
	if row.Status == StatusCompleted && before != StatusCompleted {
		name = "learning_path_step_completed"
	} else if row.Status == StatusBlocked && before != StatusBlocked {
		name = "learning_path_step_blocked"
	}
	properties := map[string]any{
		"learning_path_id": row.LearningPathID.String(), "topic_id": row.TopicID.String(),
		"step_order": row.StepOrder, "status_before": before, "status_after": row.Status,
		"attempt_count": row.Attempts, "correct_count": row.CorrectAnswers, "hint_count": row.HintCount,
	}
	if row.MasteryAfter != nil {
		properties["mastery"] = *row.MasteryAfter
	}
	if row.ConfidenceAfter != nil {
		properties["confidence"] = *row.ConfidenceAfter
	}
	if row.BlockedReason != nil {
		properties["blocked_reason"] = *row.BlockedReason
	}
	event := telemetry.Event{
		EventID: uuid.NewString(), Name: name, SchemaVersion: telemetry.CurrentSchemaVersion,
		OccurredAt: time.Now().UTC(), TopicID: row.TopicID.String(), Source: "go_backend",
		ConsentState: "required", RetentionClass: "decision", Properties: properties,
	}
	if _, err := s.publisher.PublishActor(ctx, studentID, "student", event); err != nil {
		log.Printf("learning path progress telemetry failed: %v", err)
	}
}

func (s *Service) GetStudentProgress(ctx context.Context, studentID uuid.UUID) (LearningPathProgressView, error) {
	var path model.LearningPath
	if err := s.db.WithContext(ctx).Where("student_id = ? AND status = ?", studentID, "Approved").Order("created_at DESC").First(&path).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return LearningPathProgressView{}, ErrPathNotFound
		}
		return LearningPathProgressView{}, err
	}
	return s.getProgressForPath(ctx, &path)
}

func (s *Service) GetTeacherProgress(ctx context.Context, teacherID, classID, studentID uuid.UUID) (LearningPathProgressView, error) {
	var classroomCount int64
	if err := s.db.WithContext(ctx).Model(&model.Classroom{}).Where("id = ? AND teacher_id = ?", classID, teacherID).Count(&classroomCount).Error; err != nil {
		return LearningPathProgressView{}, err
	}
	var studentCount int64
	if err := s.db.WithContext(ctx).Model(&model.User{}).Where(
		"id = ? AND role = ? AND classroom_id = ?", studentID, "student", classID,
	).Count(&studentCount).Error; err != nil {
		return LearningPathProgressView{}, err
	}
	if classroomCount != 1 || studentCount != 1 {
		return LearningPathProgressView{}, ErrForbidden
	}
	var path model.LearningPath
	if err := s.db.WithContext(ctx).Where(
		"student_id = ? AND class_id = ? AND status = ?", studentID, classID.String(), "Approved",
	).Order("created_at DESC").First(&path).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return LearningPathProgressView{}, ErrPathNotFound
		}
		return LearningPathProgressView{}, err
	}
	return s.getProgressForPath(ctx, &path)
}

func (s *Service) getProgressForPath(ctx context.Context, path *model.LearningPath) (LearningPathProgressView, error) {
	var count int64
	if err := s.db.WithContext(ctx).Model(&model.LearningPathStepProgress{}).Where("learning_path_id = ?", path.ID).Count(&count).Error; err != nil {
		return LearningPathProgressView{}, err
	}
	if count == 0 {
		if err := s.Initialize(ctx, path); err != nil {
			return LearningPathProgressView{}, err
		}
	}

	var rows []model.LearningPathStepProgress
	if err := s.db.WithContext(ctx).Where("learning_path_id = ?", path.ID).Order("step_order").Find(&rows).Error; err != nil {
		return LearningPathProgressView{}, err
	}
	var payload pathPayload
	if err := json.Unmarshal([]byte(path.StepsJSON), &payload); err != nil {
		return LearningPathProgressView{}, err
	}
	orderedSteps := make([]map[string]any, 0, len(payload.OrderedSteps))
	for _, step := range payload.OrderedSteps {
		orderedSteps = append(orderedSteps, map[string]any{"order": step.Order, "topic_id": step.TopicID})
	}
	view := LearningPathProgressView{
		ID: path.ID, ClassID: path.ClassID, OrderedSteps: orderedSteps,
		TotalSteps: len(rows), Steps: make([]ProgressStepView, 0, len(rows)), BlockedSteps: []ProgressStepView{},
	}
	for _, row := range rows {
		step := stepView(row)
		view.Steps = append(view.Steps, step)
		if row.Status == StatusCompleted {
			view.CompletedSteps++
		}
		if row.Status == StatusBlocked {
			view.BlockedSteps = append(view.BlockedSteps, step)
			if view.NextStep == nil {
				copy := step
				view.NextStep = &copy
			}
		}
	}
	if view.NextStep == nil {
		for _, step := range view.Steps {
			if step.Status == StatusInProgress {
				copy := step
				view.NextStep = &copy
				break
			}
		}
	}
	if view.TotalSteps > 0 {
		view.CompletionPercent = view.CompletedSteps * 100 / view.TotalSteps
	}
	return view, nil
}

func (s *Service) StartStep(ctx context.Context, studentID, topicID uuid.UUID) (ProgressStepView, error) {
	var result model.LearningPathStepProgress
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var path model.LearningPath
		if err := tx.Where("student_id = ? AND status = ?", studentID, "Approved").Order("created_at DESC").First(&path).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPathNotFound
			}
			return err
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where(
			"learning_path_id = ? AND student_id = ? AND topic_id = ?", path.ID, studentID, topicID,
		).First(&result).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrStepNotFound
			}
			return err
		}
		if result.Status == StatusPending {
			return ErrPrerequisiteIncomplete
		}
		if result.StartedAt != nil || result.Status == StatusCompleted {
			return nil
		}
		now := time.Now().UTC()
		result.StartedAt = &now
		result.LastActivityAt = &now
		if s.mastery != nil {
			mastery, confidence, found, err := s.mastery.TopicMastery(ctx, studentID, topicID)
			if err != nil {
				return err
			}
			if found {
				result.MasteryBefore = &mastery
				result.ConfidenceBefore = &confidence
			}
		}
		return tx.Save(&result).Error
	})
	return stepView(result), err
}

func stepView(row model.LearningPathStepProgress) ProgressStepView {
	return ProgressStepView{
		LearningPathID: row.LearningPathID, TopicID: row.TopicID, StepOrder: row.StepOrder,
		Status: row.Status, Attempts: row.Attempts, CorrectAnswers: row.CorrectAnswers, HintCount: row.HintCount,
		MasteryBefore: row.MasteryBefore, MasteryAfter: row.MasteryAfter,
		ConfidenceBefore: row.ConfidenceBefore, ConfidenceAfter: row.ConfidenceAfter,
		BlockedReason: row.BlockedReason, StartedAt: row.StartedAt, CompletedAt: row.CompletedAt,
		BlockedAt: row.BlockedAt, LastActivityAt: row.LastActivityAt,
	}
}
