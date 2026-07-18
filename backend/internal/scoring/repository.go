package scoring

import (
	"errors"
	"net/http"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }
func (r *Repository) DB() *gorm.DB          { return r.db }
func (r *Repository) Transaction(fn func(*Repository) error) error {
	return r.db.Transaction(func(tx *gorm.DB) error { return fn(NewRepository(tx)) })
}

func (r *Repository) LockOwnedBatch(id, actor uuid.UUID) (*model.GradingBatch, error) {
	var batch model.GradingBatch
	err := r.db.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ? AND created_by = ?", id, actor).First(&batch).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, &DomainError{Code: ErrorCodeGradingBatchNotFound, Message: "Grading batch was not found.", Status: http.StatusNotFound}
	}
	return &batch, err
}

func (r *Repository) LockOwnedSubmission(id, actor uuid.UUID) (*model.ScoringSubmission, *model.GradingBatch, error) {
	var submission model.ScoringSubmission
	err := r.db.Clauses(clause.Locking{Strength: "UPDATE"}).
		Joins("JOIN grading_batches ON grading_batches.id = scoring_submissions.grading_batch_id").
		Where("scoring_submissions.id = ? AND grading_batches.created_by = ?", id, actor).
		First(&submission).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, &DomainError{Code: ErrorCodeSubmissionNotFound, Message: "Scoring submission was not found.", Status: http.StatusNotFound}
	}
	if err != nil {
		return nil, nil, err
	}
	var batch model.GradingBatch
	if err := r.db.First(&batch, "id = ?", submission.GradingBatchID).Error; err != nil {
		return nil, nil, err
	}
	return &submission, &batch, nil
}
