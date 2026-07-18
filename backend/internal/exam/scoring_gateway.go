package exam

import (
	"errors"
	"net/http"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// ScoringGateway is the narrow adapter used by the scoring domain to lock an
// exam and report grading progress without making loopback HTTP calls.
type ScoringGateway interface {
	LockForScoring(actor, examID uuid.UUID, expectedVersion, totalSubmissions int, idempotencyKey string) (*model.ExamSnapshot, error)
	RecordScoringProgress(examID uuid.UUID, gradedSubmissions, scoredSubmissions int, idempotencyKey string) error
}

type scoringGateway struct{ db *gorm.DB }

func NewScoringGateway(db *gorm.DB) ScoringGateway { return &scoringGateway{db: db} }

func (g *scoringGateway) LockForScoring(actor, examID uuid.UUID, expectedVersion, total int, key string) (*model.ExamSnapshot, error) {
	var snapshot model.ExamSnapshot
	err := g.db.Transaction(func(tx *gorm.DB) error {
		var current model.Exam
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND created_by = ?", examID, actor).First(&current).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return examNotFound()
			}
			return err
		}
		if current.Version != expectedVersion {
			return versionConflict(expectedVersion, current.Version)
		}
		// Delegate the canonical lock/snapshot implementation after ownership
		// and optimistic-version checks. GORM savepoints keep this rollback-safe
		// when called from a transaction-bound gateway.
		result, err := (&Service{repository: NewRepository(tx)}).FirstSubmission(
			examID, key, FirstSubmissionInput{TotalSubmissions: total},
		)
		if err != nil {
			return err
		}
		return tx.First(&snapshot, "id = ?", result.SnapshotID).Error
	})
	return &snapshot, err
}

func (g *scoringGateway) RecordScoringProgress(examID uuid.UUID, graded, scored int, key string) error {
	var progress model.ExamGradingProgress
	if err := g.db.Where("exam_id = ?", examID).First(&progress).Error; err != nil {
		return err
	}
	_, err := (&Service{repository: NewRepository(g.db)}).GradingCompleted(
		examID, key, GradingCompletedInput{
			TotalSubmissions:  progress.TotalSubmissions,
			GradedSubmissions: graded,
			ScoredSubmissions: scored,
		},
	)
	if err != nil {
		var domainErr *DomainError
		if errors.As(err, &domainErr) && domainErr.Status == 0 {
			domainErr.Status = http.StatusConflict
		}
	}
	return err
}
