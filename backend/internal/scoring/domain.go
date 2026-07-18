package scoring

import (
	"errors"
	"net/http"

	"backend/internal/model"

	"github.com/google/uuid"
)

const (
	ErrorCodeInvalidRequest        = "invalid_request"
	ErrorCodeInvalidSnapshot       = "invalid_snapshot"
	ErrorCodeGradingBatchExists    = "grading_batch_exists"
	ErrorCodeGradingBatchNotFound  = "grading_batch_not_found"
	ErrorCodeExamNotPrepared       = "exam_not_prepared"
	ErrorCodeInvalidStudent        = "invalid_student"
	ErrorCodeDuplicateStudent      = "duplicate_student"
	ErrorCodeSubmissionNotFound    = "submission_not_found"
	ErrorCodeQuestionNotInSnapshot = "question_not_in_snapshot"
	ErrorCodeRubricNotInSnapshot   = "rubric_not_in_snapshot"
	ErrorCodeResultIncomplete      = "result_incomplete"
	ErrorCodeVersionConflict       = "version_conflict"
	ErrorCodeRevisionRequired      = "revision_required"
	ErrorCodeInvalidTransition     = "invalid_transition"
	ErrorCodeIdempotencyConflict   = "idempotency_conflict"
)

var ErrInvalidSnapshot = errors.New("invalid grading snapshot")

type DomainError struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Field   string         `json:"field,omitempty"`
	Status  int            `json:"-"`
	Meta    map[string]any `json:"meta,omitempty"`
}

func (e *DomainError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

type GradingSnapshot struct {
	SnapshotID  uuid.UUID
	ExamID      uuid.UUID
	TotalPoints model.Score
	Questions   []SnapshotQuestion
}

type SnapshotQuestion struct {
	ID           uuid.UUID
	QuestionType string
	Points       model.Score
	Position     int
	Rubrics      []SnapshotRubric
}

type SnapshotRubric struct {
	ID       uuid.UUID
	Points   model.Score
	Position int
}

type RubricScore struct {
	Status   string
	Reviewed bool
	Points   model.Score
}

type DerivedQuestion struct {
	Status        string
	Reviewed      bool
	AwardedPoints model.Score
}

type CreateBatchInput struct {
	ExamID              uuid.UUID   `json:"examId"`
	StudentIDs          []uuid.UUID `json:"studentIds"`
	ExpectedExamVersion int         `json:"expectedExamVersion"`
	IdempotencyKey      string      `json:"-"`
}

type BatchDetail struct {
	model.GradingBatch
	Submissions []model.ScoringSubmission `json:"submissions"`
}

type SubmissionDetail struct {
	model.ScoringSubmission
	Questions []model.ScoringQuestionResult `json:"questions"`
	Rubrics   []model.ScoringRubricResult   `json:"rubrics"`
}

type ResultInput struct {
	Status          string `json:"status"`
	ExpectedVersion int    `json:"expectedVersion"`
}

type VersionInput struct {
	ExpectedVersion int    `json:"expectedVersion"`
	IdempotencyKey  string `json:"-"`
}

func invalidResultStatus() *DomainError {
	return &DomainError{
		Code:    ErrorCodeInvalidRequest,
		Message: "Result status must be correct, incorrect, or unanswered.",
		Field:   "status",
		Status:  http.StatusBadRequest,
	}
}
