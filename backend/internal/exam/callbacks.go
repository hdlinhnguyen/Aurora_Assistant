package exam

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	eventTypeFirstSubmission   = "first_submission"
	eventTypeGradingCompleted  = "grading_completed"
	snapshotPurposeGradingLock = "grading_lock"
)

func (s *Service) FirstSubmission(
	examID uuid.UUID,
	idempotencyKey string,
	input FirstSubmissionInput,
) (FirstSubmissionResult, error) {
	if err := validateCallbackKey(idempotencyKey); err != nil {
		return FirstSubmissionResult{}, err
	}
	if input.TotalSubmissions < 1 || input.TotalSubmissions > 100000 {
		return FirstSubmissionResult{}, invalidField(
			"totalSubmissions", "Total submissions must be between 1 and 100000.",
		)
	}
	payloadJSON, err := canonicalJSON(input)
	if err != nil {
		return FirstSubmissionResult{}, err
	}

	var result FirstSubmissionResult
	err = s.repository.Transaction(func(tx *Repository) error {
		found, err := loadIdempotentResult(
			tx, examID, eventTypeFirstSubmission, idempotencyKey, payloadJSON, &result,
		)
		if err != nil || found {
			return err
		}

		current, err := tx.lockExam(examID)
		if err != nil {
			return err
		}
		if isLocked(current) {
			return examLocked()
		}
		if current.Status != ExamStatusPreparing {
			return invalidTransition("Exam must be preparing before submissions are accepted.")
		}
		detail, err := tx.ExamDetail(current.ID, current.CreatedBy)
		if err != nil {
			return err
		}
		topics, err := tx.topicLookup(detailTopicIDs(*detail))
		if err != nil {
			return err
		}
		validationErrors := ValidateDetail(*detail, topics)
		if len(validationErrors) != 0 {
			return &DomainError{
				Code: ErrorCodeExamInvalid, Message: "Exam is invalid and cannot be locked.",
				Status: http.StatusUnprocessableEntity,
				Meta:   map[string]any{"errors": validationErrors},
			}
		}
		snapshotJSON, err := canonicalJSON(detail)
		if err != nil {
			return err
		}
		snapshot := model.ExamSnapshot{
			ExamID: current.ID, ExamVersion: current.Version,
			Purpose: snapshotPurposeGradingLock, SnapshotJSON: snapshotJSON,
		}
		if err := tx.db.Create(&snapshot).Error; err != nil {
			return err
		}
		now := time.Now().UTC()
		if err := tx.db.Model(&model.Exam{}).
			Where("id = ? AND locked_snapshot_id IS NULL", current.ID).
			Updates(map[string]any{
				"first_submission_received_at": now,
				"locked_snapshot_id":           snapshot.ID,
			}).Error; err != nil {
			return err
		}
		progress := model.ExamGradingProgress{
			ExamID: current.ID, TotalSubmissions: input.TotalSubmissions,
			UpdatedAt: now,
		}
		if err := tx.db.Create(&progress).Error; err != nil {
			return err
		}

		result = FirstSubmissionResult{
			ExamID: current.ID, Locked: true, Status: current.Status,
			TotalSubmissions: input.TotalSubmissions, SnapshotID: snapshot.ID,
		}
		return storeInternalEvent(
			tx, current.ID, eventTypeFirstSubmission, idempotencyKey, payloadJSON, result,
		)
	})
	return result, err
}

func (s *Service) GradingCompleted(
	examID uuid.UUID,
	idempotencyKey string,
	input GradingCompletedInput,
) (GradingCompletedResult, error) {
	if err := validateCallbackKey(idempotencyKey); err != nil {
		return GradingCompletedResult{}, err
	}
	if err := validateGradingCounts(input); err != nil {
		return GradingCompletedResult{}, err
	}
	payloadJSON, err := canonicalJSON(input)
	if err != nil {
		return GradingCompletedResult{}, err
	}

	var result GradingCompletedResult
	err = s.repository.Transaction(func(tx *Repository) error {
		found, err := loadIdempotentResult(
			tx, examID, eventTypeGradingCompleted, idempotencyKey, payloadJSON, &result,
		)
		if err != nil || found {
			return err
		}

		current, err := tx.lockExam(examID)
		if err != nil {
			return err
		}
		if !isLocked(current) {
			return questionError(
				ErrorCodeExamNotLocked, "", "Exam has no grading snapshot.",
				http.StatusConflict,
			)
		}
		if current.Status == ExamStatusDone {
			return questionError(
				ErrorCodeExamDone, "", "Completed grading cannot be changed.",
				http.StatusConflict,
			)
		}

		var progress model.ExamGradingProgress
		err = tx.db.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&progress, "exam_id = ?", current.ID).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return questionError(
				ErrorCodeExamNotLocked, "", "Exam has no grading progress.",
				http.StatusConflict,
			)
		}
		if err != nil {
			return err
		}
		if progress.TotalSubmissions != input.TotalSubmissions {
			return questionError(
				ErrorCodeSubmissionCountConflict, "totalSubmissions",
				"Submission total differs from the first-submission event.",
				http.StatusConflict,
			)
		}
		if input.GradedSubmissions < progress.GradedSubmissions ||
			input.ScoredSubmissions < progress.ScoredSubmissions {
			return questionError(
				ErrorCodeGradingProgressRegression, "",
				"Grading progress cannot move backwards.", http.StatusConflict,
			)
		}

		progress.GradedSubmissions = input.GradedSubmissions
		progress.ScoredSubmissions = input.ScoredSubmissions
		progress.UpdatedAt = time.Now().UTC()
		if err := tx.db.Save(&progress).Error; err != nil {
			return err
		}
		status := current.Status
		if input.GradedSubmissions == input.TotalSubmissions &&
			input.ScoredSubmissions == input.TotalSubmissions {
			status = ExamStatusDone
			if err := tx.db.Model(&model.Exam{}).
				Where("id = ?", current.ID).
				Update("status", status).Error; err != nil {
				return err
			}
		}
		result = GradingCompletedResult{
			ExamID: current.ID, Status: status,
			TotalSubmissions:  input.TotalSubmissions,
			GradedSubmissions: input.GradedSubmissions,
			ScoredSubmissions: input.ScoredSubmissions,
		}
		return storeInternalEvent(
			tx, current.ID, eventTypeGradingCompleted, idempotencyKey, payloadJSON, result,
		)
	})
	return result, err
}

func (r *Repository) lockExam(examID uuid.UUID) (*model.Exam, error) {
	var current model.Exam
	err := r.db.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&current, "id = ?", examID).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, examNotFound()
	}
	return &current, err
}

func validateCallbackKey(key string) error {
	if strings.TrimSpace(key) == "" || len(key) > 200 {
		return invalidField(
			"idempotencyKey", "Idempotency key must contain between 1 and 200 characters.",
		)
	}
	return nil
}

func validateGradingCounts(input GradingCompletedInput) error {
	if input.TotalSubmissions < 1 || input.TotalSubmissions > 100000 ||
		input.GradedSubmissions < 0 || input.GradedSubmissions > input.TotalSubmissions ||
		input.ScoredSubmissions < 0 || input.ScoredSubmissions > input.GradedSubmissions {
		return questionError(
			ErrorCodeInvalidGradingCounts, "",
			"Graded and scored counts must not exceed their parent totals.",
			http.StatusUnprocessableEntity,
		)
	}
	return nil
}

func loadIdempotentResult(
	tx *Repository,
	examID uuid.UUID,
	eventType, key, payloadJSON string,
	result any,
) (bool, error) {
	var event model.ExamInternalEvent
	err := tx.db.Where("event_type = ? AND idempotency_key = ?", eventType, key).
		Take(&event).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if event.ExamID != examID || event.PayloadJSON != payloadJSON {
		return false, questionError(
			ErrorCodeIdempotencyConflict, "idempotencyKey",
			"Idempotency key was already used with another exam or payload.",
			http.StatusConflict,
		)
	}
	if err := json.Unmarshal([]byte(event.ResultJSON), result); err != nil {
		return false, err
	}
	return true, nil
}

func storeInternalEvent(
	tx *Repository,
	examID uuid.UUID,
	eventType, key, payloadJSON string,
	result any,
) error {
	resultJSON, err := canonicalJSON(result)
	if err != nil {
		return err
	}
	return tx.db.Create(&model.ExamInternalEvent{
		ExamID: examID, EventType: eventType, IdempotencyKey: key,
		PayloadJSON: payloadJSON, ResultJSON: resultJSON, ProcessedAt: time.Now().UTC(),
	}).Error
}

func canonicalJSON(value any) (string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}
