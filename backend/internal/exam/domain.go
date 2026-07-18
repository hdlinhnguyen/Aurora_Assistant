package exam

import (
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"backend/internal/model"
)

const (
	ExamStatusDrafting  = model.ExamStatusDrafting
	ExamStatusPreparing = model.ExamStatusPreparingExam
	ExamStatusDone      = model.ExamStatusDone
)

const (
	ErrorCodeInvalidRequest    = "invalid_request"
	ErrorCodeExamNotFound      = "exam_not_found"
	ErrorCodeExamLocked        = "exam_locked"
	ErrorCodeInvalidTransition = "invalid_transition"
	ErrorCodeVersionConflict   = "version_conflict"

	ErrorCodeExamEmpty            = "exam_empty"
	ErrorCodeScoreMismatch        = "score_mismatch"
	ErrorCodeInvalidChoiceSet     = "invalid_choice_set"
	ErrorCodeMissingCorrectChoice = "missing_correct_choice"
	ErrorCodeRubricIncomplete     = "rubric_incomplete"
	ErrorCodeRubricScoreMismatch  = "rubric_score_mismatch"
	ErrorCodeTopicRequired        = "topic_required"
	ErrorCodeTopicNotAllowed      = "topic_not_allowed"
	ErrorCodeBankTopicImmutable   = "bank_topic_immutable"
	ErrorCodeRubricNotAllowed     = "rubric_not_allowed"
	ErrorCodeQuestionNotFound     = "question_not_found"
	ErrorCodeRubricItemNotFound   = "rubric_item_not_found"
	ErrorCodeInvalidQuestionOrder = "invalid_question_order"
	ErrorCodeInvalidRubricOrder   = "invalid_rubric_order"
)

const (
	AuditActionCreated = "exam_created"
	AuditActionUpdated = "exam_updated"
	AuditActionDeleted = "exam_deleted"
)

// DomainError is a stable error contract suitable for transport-layer mapping.
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

type CreateInput struct {
	Title           string
	Subject         string
	GradeLevel      string
	DurationMinutes int
	Instructions    string
	TotalPoints     model.Score
}

type PatchInput struct {
	Title           *string
	DurationMinutes *int
	Instructions    *string
	TotalPoints     *model.Score
	ExpectedVersion int
}

type ListFilter struct {
	Status string
	Search string
}

// Detail is the owned aggregate returned by service mutations and reads.
// Question and rubric mapping is expanded by the authoring tasks.
type Detail struct {
	model.Exam
	Questions []model.ExamQuestion `json:"questions"`
}

func validateCreateInput(input *CreateInput) error {
	input.Title = strings.TrimSpace(input.Title)
	input.Subject = strings.TrimSpace(input.Subject)
	input.GradeLevel = strings.TrimSpace(input.GradeLevel)

	if err := validateTrimmedRunes("title", input.Title, 1, 300); err != nil {
		return err
	}
	if err := validateTrimmedRunes("subject", input.Subject, 1, 255); err != nil {
		return err
	}
	if err := validateTrimmedRunes("gradeLevel", input.GradeLevel, 1, 50); err != nil {
		return err
	}
	if err := validateDuration(input.DurationMinutes); err != nil {
		return err
	}
	if utf8.RuneCountInString(input.Instructions) > 10000 {
		return invalidField("instructions", "Instructions must contain at most 10000 characters.")
	}
	if err := validateTotalPoints(input.TotalPoints); err != nil {
		return err
	}
	return nil
}

func validatePatchInput(input *PatchInput) error {
	if input.ExpectedVersion < 1 {
		return invalidField("expectedVersion", "Expected version must be at least 1.")
	}
	if input.Title == nil && input.DurationMinutes == nil &&
		input.Instructions == nil && input.TotalPoints == nil {
		return invalidField("", "At least one exam field must be supplied.")
	}
	if input.Title != nil {
		trimmed := strings.TrimSpace(*input.Title)
		input.Title = &trimmed
		if err := validateTrimmedRunes("title", trimmed, 1, 300); err != nil {
			return err
		}
	}
	if input.DurationMinutes != nil {
		if err := validateDuration(*input.DurationMinutes); err != nil {
			return err
		}
	}
	if input.Instructions != nil && utf8.RuneCountInString(*input.Instructions) > 10000 {
		return invalidField("instructions", "Instructions must contain at most 10000 characters.")
	}
	if input.TotalPoints != nil {
		if err := validateTotalPoints(*input.TotalPoints); err != nil {
			return err
		}
	}
	return nil
}

func validateListFilter(filter ListFilter) error {
	switch filter.Status {
	case "", ExamStatusDrafting, ExamStatusPreparing, ExamStatusDone:
		return nil
	default:
		return invalidField("status", "Status is not a supported exam status.")
	}
}

func validateTrimmedRunes(field, value string, minimum, maximum int) error {
	length := utf8.RuneCountInString(value)
	if length < minimum || length > maximum {
		return invalidField(
			field,
			fmt.Sprintf("%s must contain between %d and %d characters.", field, minimum, maximum),
		)
	}
	return nil
}

func validateDuration(duration int) error {
	if duration < 1 || duration > 600 {
		return invalidField("durationMinutes", "Duration must be between 1 and 600 minutes.")
	}
	return nil
}

func validateTotalPoints(score model.Score) error {
	if _, err := score.Value(); err != nil {
		return invalidField("totalPoints", "Total points must be an exact score with at most two decimal places.")
	}
	if !score.Decimal.IsPositive() {
		return invalidField("totalPoints", "Total points must be greater than zero.")
	}
	return nil
}

func invalidField(field, message string) *DomainError {
	return &DomainError{
		Code:    ErrorCodeInvalidRequest,
		Message: message,
		Field:   field,
		Status:  http.StatusBadRequest,
	}
}

func examNotFound() *DomainError {
	return &DomainError{
		Code:    ErrorCodeExamNotFound,
		Message: "Exam does not exist.",
		Status:  http.StatusNotFound,
	}
}

func versionConflict(expected, current int) *DomainError {
	return &DomainError{
		Code:    ErrorCodeVersionConflict,
		Message: "Exam data has changed. Reload the latest exam before saving.",
		Status:  http.StatusConflict,
		Meta: map[string]any{
			"expectedVersion": expected,
			"currentVersion":  current,
		},
	}
}

func examLocked() *DomainError {
	return &DomainError{
		Code:    ErrorCodeExamLocked,
		Message: "Exam is locked because submissions have been received.",
		Status:  http.StatusConflict,
	}
}

func invalidTransition(message string) *DomainError {
	return &DomainError{
		Code:    ErrorCodeInvalidTransition,
		Message: message,
		Status:  http.StatusConflict,
	}
}
