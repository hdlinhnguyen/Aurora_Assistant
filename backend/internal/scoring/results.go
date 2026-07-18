package scoring

import (
	"encoding/json"
	"net/http"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
)

func (s *Service) UpdateQuestionResult(actor, submissionID, questionID uuid.UUID, input ResultInput) (*SubmissionDetail, error) {
	if err := ValidateResultStatus(input.Status); err != nil {
		return nil, err
	}
	err := s.repository.Transaction(func(tx *Repository) error {
		submission, batch, err := tx.LockOwnedSubmission(submissionID, actor)
		if err != nil {
			return err
		}
		if err := mutableSubmission(submission, input.ExpectedVersion); err != nil {
			return err
		}
		snapshot, err := batchSnapshot(tx, batch)
		if err != nil {
			return err
		}
		var question *SnapshotQuestion
		for i := range snapshot.Questions {
			if snapshot.Questions[i].ID == questionID {
				question = &snapshot.Questions[i]
				break
			}
		}
		if question == nil || question.QuestionType != "single_choice" {
			return &DomainError{Code: ErrorCodeQuestionNotInSnapshot, Message: "Question is not a directly scorable snapshot question.", Status: http.StatusNotFound}
		}
		awarded := ScoreSingleChoice(input.Status, question.Points)
		result := model.ScoringQuestionResult{SubmissionID: submissionID, ExamQuestionID: questionID}
		if err := tx.db.First(&result).Error; err != nil {
			return err
		}
		previous, _ := json.Marshal(result)
		result.Status, result.Reviewed, result.AwardedPoints, result.UpdatedBy, result.UpdatedAt = input.Status, true, awarded, actor, time.Now().UTC()
		if err := tx.db.Save(&result).Error; err != nil {
			return err
		}
		return recalculateAndAudit(tx, submission, batch.ID, actor, "question_result_updated", string(previous), result)
	})
	if err != nil {
		return nil, err
	}
	return s.GetSubmission(actor, submissionID)
}

func (s *Service) UpdateRubricResult(actor, submissionID, rubricID uuid.UUID, input ResultInput) (*SubmissionDetail, error) {
	if err := ValidateResultStatus(input.Status); err != nil {
		return nil, err
	}
	err := s.repository.Transaction(func(tx *Repository) error {
		submission, batch, err := tx.LockOwnedSubmission(submissionID, actor)
		if err != nil {
			return err
		}
		if err := mutableSubmission(submission, input.ExpectedVersion); err != nil {
			return err
		}
		snapshot, err := batchSnapshot(tx, batch)
		if err != nil {
			return err
		}
		var owner *SnapshotQuestion
		var rubric *SnapshotRubric
		for i := range snapshot.Questions {
			for j := range snapshot.Questions[i].Rubrics {
				if snapshot.Questions[i].Rubrics[j].ID == rubricID {
					owner, rubric = &snapshot.Questions[i], &snapshot.Questions[i].Rubrics[j]
				}
			}
		}
		if rubric == nil {
			return &DomainError{Code: ErrorCodeRubricNotInSnapshot, Message: "Rubric item is not in the grading snapshot.", Status: http.StatusNotFound}
		}
		result := model.ScoringRubricResult{SubmissionID: submissionID, ExamRubricItemID: rubricID}
		if err := tx.db.First(&result).Error; err != nil {
			return err
		}
		previous, _ := json.Marshal(result)
		result.Status, result.Reviewed, result.AwardedPoints, result.UpdatedBy, result.UpdatedAt = input.Status, true, ScoreSingleChoice(input.Status, rubric.Points), actor, time.Now().UTC()
		if err := tx.db.Save(&result).Error; err != nil {
			return err
		}
		var rubricRows []model.ScoringRubricResult
		if err := tx.db.Where("submission_id = ?", submissionID).Find(&rubricRows).Error; err != nil {
			return err
		}
		byID := make(map[uuid.UUID]model.ScoringRubricResult, len(rubricRows))
		for _, row := range rubricRows {
			byID[row.ExamRubricItemID] = row
		}
		scores := make([]RubricScore, 0, len(owner.Rubrics))
		for _, item := range owner.Rubrics {
			row := byID[item.ID]
			scores = append(scores, RubricScore{Status: row.Status, Reviewed: row.Reviewed, Points: row.AwardedPoints})
		}
		derived := DeriveEssay(scores)
		if err := tx.db.Model(&model.ScoringQuestionResult{}).Where("submission_id = ? AND exam_question_id = ?", submissionID, owner.ID).
			Updates(map[string]any{"status": derived.Status, "reviewed": derived.Reviewed, "awarded_points": derived.AwardedPoints, "updated_by": actor, "updated_at": time.Now().UTC()}).Error; err != nil {
			return err
		}
		return recalculateAndAudit(tx, submission, batch.ID, actor, "rubric_result_updated", string(previous), result)
	})
	if err != nil {
		return nil, err
	}
	return s.GetSubmission(actor, submissionID)
}

func mutableSubmission(submission *model.ScoringSubmission, expected int) error {
	if submission.Version != expected {
		return &DomainError{Code: ErrorCodeVersionConflict, Message: "Submission version is stale.", Status: http.StatusConflict, Meta: map[string]any{"currentVersion": submission.Version}}
	}
	if submission.Status == model.ScoringSubmissionStatusApproved {
		return &DomainError{Code: ErrorCodeRevisionRequired, Message: "Start a revision before editing an approved submission.", Status: http.StatusConflict}
	}
	return nil
}

func batchSnapshot(tx *Repository, batch *model.GradingBatch) (*GradingSnapshot, error) {
	var stored model.ExamSnapshot
	if err := tx.db.First(&stored, "id = ?", batch.ExamSnapshotID).Error; err != nil {
		return nil, err
	}
	return ParseGradingSnapshot(stored)
}

func recalculateAndAudit(tx *Repository, submission *model.ScoringSubmission, batchID, actor uuid.UUID, action, previous string, current any) error {
	var rows []model.ScoringQuestionResult
	if err := tx.db.Where("submission_id = ?", submission.ID).Find(&rows).Error; err != nil {
		return err
	}
	total := model.MustScore("0.00")
	for _, row := range rows {
		total.Decimal = total.Decimal.Add(row.AwardedPoints.Decimal)
	}
	submission.AwardedPoints, submission.Version = total, submission.Version+1
	if err := tx.db.Save(submission).Error; err != nil {
		return err
	}
	next, _ := json.Marshal(current)
	return tx.db.Create(&model.ScoringAuditLog{BatchID: batchID, SubmissionID: &submission.ID, Action: action, ActorID: actor, PreviousValueJSON: previous, NewValueJSON: string(next), OccurredAt: time.Now().UTC()}).Error
}
