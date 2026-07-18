package scoring

import (
	"encoding/json"
	"net/http"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
)

func (s *Service) Approve(actor, submissionID uuid.UUID, input VersionInput) (*SubmissionDetail, error) {
	err := s.repository.Transaction(func(tx *Repository) error {
		submission, batch, err := tx.LockOwnedSubmission(submissionID, actor)
		if err != nil {
			return err
		}
		if submission.Version != input.ExpectedVersion {
			return &DomainError{Code: ErrorCodeVersionConflict, Message: "Submission version is stale.", Status: http.StatusConflict, Meta: map[string]any{"currentVersion": submission.Version}}
		}
		if submission.Status == model.ScoringSubmissionStatusApproved {
			return &DomainError{Code: ErrorCodeInvalidTransition, Message: "Submission is already approved.", Status: http.StatusConflict}
		}
		var questions []model.ScoringQuestionResult
		var rubrics []model.ScoringRubricResult
		if err := tx.db.Where("submission_id = ?", submissionID).Find(&questions).Error; err != nil {
			return err
		}
		if err := tx.db.Where("submission_id = ?", submissionID).Find(&rubrics).Error; err != nil {
			return err
		}
		for _, row := range questions {
			if !row.Reviewed {
				return incomplete(row.ExamQuestionID, uuid.Nil)
			}
		}
		for _, row := range rubrics {
			if !row.Reviewed {
				return incomplete(uuid.Nil, row.ExamRubricItemID)
			}
		}
		payload, _ := json.Marshal(struct {
			Questions []model.ScoringQuestionResult `json:"questions"`
			Rubrics   []model.ScoringRubricResult   `json:"rubrics"`
		}{questions, rubrics})
		version := submission.EffectiveApprovalVersion + 1
		now := time.Now().UTC()
		if err := tx.db.Create(&model.ScoringApprovalSnapshot{SubmissionID: submissionID, ApprovalVersion: version, ResultJSON: string(payload), TotalPoints: submission.AwardedPoints, ApprovedBy: actor, ApprovedAt: now}).Error; err != nil {
			return err
		}
		first := submission.EffectiveApprovalVersion == 0
		submission.Status, submission.EffectiveApprovalVersion, submission.ApprovedBy, submission.ApprovedAt, submission.Version = model.ScoringSubmissionStatusApproved, version, &actor, &now, submission.Version+1
		if err := tx.db.Save(submission).Error; err != nil {
			return err
		}
		if first {
			batch.ApprovedSubmissions++
			if batch.ApprovedSubmissions == batch.TotalSubmissions {
				batch.Status, batch.CompletedAt = model.GradingBatchStatusCompleted, &now
			}
			if err := tx.db.Save(batch).Error; err != nil {
				return err
			}
		}
		action := "submission_approved"
		if !first {
			action = "revision_approved"
		}
		return tx.db.Create(&model.ScoringAuditLog{BatchID: batch.ID, SubmissionID: &submission.ID, Action: action, ActorID: actor, NewValueJSON: string(payload), OccurredAt: now}).Error
	})
	if err != nil {
		return nil, err
	}
	return s.GetSubmission(actor, submissionID)
}

func (s *Service) StartRevision(actor, submissionID uuid.UUID, input VersionInput) (*SubmissionDetail, error) {
	err := s.repository.Transaction(func(tx *Repository) error {
		submission, batch, err := tx.LockOwnedSubmission(submissionID, actor)
		if err != nil {
			return err
		}
		if submission.Version != input.ExpectedVersion {
			return &DomainError{Code: ErrorCodeVersionConflict, Message: "Submission version is stale.", Status: http.StatusConflict, Meta: map[string]any{"currentVersion": submission.Version}}
		}
		if submission.Status != model.ScoringSubmissionStatusApproved {
			return &DomainError{Code: ErrorCodeInvalidTransition, Message: "Only an approved submission can enter revision.", Status: http.StatusConflict}
		}
		submission.Status, submission.Version = model.ScoringSubmissionStatusRevision, submission.Version+1
		if err := tx.db.Save(submission).Error; err != nil {
			return err
		}
		return tx.db.Create(&model.ScoringAuditLog{BatchID: batch.ID, SubmissionID: &submission.ID, Action: "revision_started", ActorID: actor, OccurredAt: time.Now().UTC()}).Error
	})
	if err != nil {
		return nil, err
	}
	return s.GetSubmission(actor, submissionID)
}

func (s *Service) History(actor, submissionID uuid.UUID) ([]model.ScoringApprovalSnapshot, error) {
	if _, _, err := s.repository.LockOwnedSubmission(submissionID, actor); err != nil {
		return nil, err
	}
	var rows []model.ScoringApprovalSnapshot
	return rows, s.repository.db.Where("submission_id = ?", submissionID).Order("approval_version").Find(&rows).Error
}

func (s *Service) Audit(actor, submissionID uuid.UUID) ([]model.ScoringAuditLog, error) {
	if _, _, err := s.repository.LockOwnedSubmission(submissionID, actor); err != nil {
		return nil, err
	}
	var rows []model.ScoringAuditLog
	return rows, s.repository.db.Where("submission_id = ?", submissionID).Order("occurred_at, id").Find(&rows).Error
}

func incomplete(questionID, rubricID uuid.UUID) *DomainError {
	meta := map[string]any{}
	if questionID != uuid.Nil {
		meta["examQuestionId"] = questionID
	}
	if rubricID != uuid.Nil {
		meta["rubricItemId"] = rubricID
	}
	return &DomainError{Code: ErrorCodeResultIncomplete, Message: "Every result must be reviewed before approval.", Status: http.StatusUnprocessableEntity, Meta: meta}
}
