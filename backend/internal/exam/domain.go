package exam

import (
	"fmt"
	"net/http"
	"strings"
	"unicode/utf8"

	"backend/internal/model"

	"github.com/google/uuid"
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

	ErrorCodeExamEmpty                 = "exam_empty"
	ErrorCodeScoreMismatch             = "score_mismatch"
	ErrorCodeInvalidChoiceSet          = "invalid_choice_set"
	ErrorCodeMissingCorrectChoice      = "missing_correct_choice"
	ErrorCodeRubricIncomplete          = "rubric_incomplete"
	ErrorCodeRubricScoreMismatch       = "rubric_score_mismatch"
	ErrorCodeTopicRequired             = "topic_required"
	ErrorCodeTopicNotAllowed           = "topic_not_allowed"
	ErrorCodeBankTopicImmutable        = "bank_topic_immutable"
	ErrorCodeRubricNotAllowed          = "rubric_not_allowed"
	ErrorCodeQuestionNotFound          = "question_not_found"
	ErrorCodeRubricItemNotFound        = "rubric_item_not_found"
	ErrorCodeInvalidQuestionOrder      = "invalid_question_order"
	ErrorCodeInvalidRubricOrder        = "invalid_rubric_order"
	ErrorCodeExamInvalid               = "exam_invalid"
	ErrorCodeIdempotencyConflict       = "idempotency_conflict"
	ErrorCodeExamNotLocked             = "exam_not_locked"
	ErrorCodeInvalidGradingCounts      = "invalid_grading_counts"
	ErrorCodeGradingProgressRegression = "grading_progress_regression"
	ErrorCodeSubmissionCountConflict   = "submission_count_conflict"
	ErrorCodeExamDone                  = "exam_done"
)

const (
	AuditActionCreated = "exam_created"
	AuditActionUpdated = "exam_updated"
	AuditActionDeleted = "exam_deleted"
)

const (
	QuestionSourceBank   = "question_bank"
	QuestionSourceManual = "manual"

	QuestionTypeSingleChoice = "single_choice"
	QuestionTypeEssay        = "essay"
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
	Subject string
	Status  string
	Search  string
}

type Choice struct {
	ID      string `json:"choiceId"`
	Content string `json:"content"`
}

type BankFilter struct {
	Subject    string
	NodeID     *uuid.UUID
	Difficulty string
	Search     string
}

type BankQuestion struct {
	ID              uuid.UUID `json:"id"`
	NodeID          uuid.UUID `json:"nodeId"`
	Subject         string    `json:"subject"`
	NodeName        string    `json:"nodeName"`
	Content         string    `json:"content"`
	Difficulty      string    `json:"difficulty"`
	Choices         []Choice  `json:"choices"`
	CorrectChoiceID *string   `json:"correctChoiceId"`
}

type AddBankQuestionInput struct {
	QuestionID      uuid.UUID
	Points          model.Score
	ExpectedVersion int
}

type ManualQuestionInput struct {
	QuestionType    string
	Content         string
	Points          model.Score
	TopicNodeIDs    []uuid.UUID
	Choices         []Choice
	CorrectChoiceID *string
	ExpectedVersion int
}

type ReorderQuestionsInput struct {
	ExamQuestionIDs []uuid.UUID
	ExpectedVersion int
}

type RubricItemInput struct {
	Description     string
	Points          model.Score
	TopicNodeIDs    []uuid.UUID
	ExpectedVersion int
}

type PatchRubricItemInput struct {
	Description     *string
	Points          *model.Score
	TopicNodeIDs    []uuid.UUID
	ExpectedVersion int
}

type ReorderRubricItemsInput struct {
	RubricItemIDs   []uuid.UUID
	ExpectedVersion int
}

type VersionInput struct {
	ExpectedVersion int
}

type FirstSubmissionInput struct {
	TotalSubmissions int `json:"totalSubmissions"`
}

type GradingCompletedInput struct {
	TotalSubmissions  int `json:"totalSubmissions"`
	GradedSubmissions int `json:"gradedSubmissions"`
	ScoredSubmissions int `json:"scoredSubmissions"`
}

type FirstSubmissionResult struct {
	ExamID           uuid.UUID `json:"examId"`
	Locked           bool      `json:"locked"`
	Status           string    `json:"status"`
	TotalSubmissions int       `json:"totalSubmissions"`
	SnapshotID       uuid.UUID `json:"snapshotId"`
}

type GradingCompletedResult struct {
	ExamID            uuid.UUID `json:"examId"`
	Status            string    `json:"status"`
	TotalSubmissions  int       `json:"totalSubmissions"`
	GradedSubmissions int       `json:"gradedSubmissions"`
	ScoredSubmissions int       `json:"scoredSubmissions"`
}

type RubricItemDetail struct {
	model.ExamRubricItem
	TopicNodeIDs []uuid.UUID `json:"topicNodeIds"`
}

type QuestionDetail struct {
	model.ExamQuestion
	Choices      []Choice           `json:"choices"`
	TopicNodeIDs []uuid.UUID        `json:"topicNodeIds"`
	RubricItems  []RubricItemDetail `json:"rubricItems"`
}

// Detail is the owned aggregate returned by service mutations and reads.
// Question and rubric mapping is expanded by the authoring tasks.
type Detail struct {
	model.Exam
	Questions []QuestionDetail `json:"questions"`
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

func validateQuestionPoints(score model.Score) error {
	if _, err := score.Value(); err != nil {
		return invalidField("points", "Points must be an exact score with at most two decimal places.")
	}
	if !score.Decimal.IsPositive() {
		return invalidField("points", "Points must be greater than zero.")
	}
	return nil
}

func validateExpectedVersion(version int) error {
	if version < 1 {
		return invalidField("expectedVersion", "Expected version must be at least 1.")
	}
	return nil
}

func validateManualQuestionInput(input *ManualQuestionInput) error {
	if err := validateExpectedVersion(input.ExpectedVersion); err != nil {
		return err
	}
	input.QuestionType = strings.TrimSpace(input.QuestionType)
	input.Content = strings.TrimSpace(input.Content)
	if input.QuestionType != QuestionTypeSingleChoice && input.QuestionType != QuestionTypeEssay {
		return invalidField("questionType", "Question type must be single_choice or essay.")
	}
	if err := validateTrimmedRunes("content", input.Content, 1, 10000); err != nil {
		return err
	}
	if err := validateQuestionPoints(input.Points); err != nil {
		return err
	}
	if len(input.TopicNodeIDs) == 0 {
		return questionError(
			ErrorCodeTopicRequired, "topicNodeIds",
			"At least one topic is required.", http.StatusBadRequest,
		)
	}

	switch input.QuestionType {
	case QuestionTypeSingleChoice:
		if len(input.Choices) < 2 {
			return questionError(
				ErrorCodeInvalidChoiceSet, "choices",
				"A single-choice question requires at least two choices.", http.StatusBadRequest,
			)
		}
		seen := make(map[string]struct{}, len(input.Choices))
		for i := range input.Choices {
			input.Choices[i].ID = strings.TrimSpace(input.Choices[i].ID)
			input.Choices[i].Content = strings.TrimSpace(input.Choices[i].Content)
			if input.Choices[i].ID == "" || input.Choices[i].Content == "" {
				return questionError(
					ErrorCodeInvalidChoiceSet, "choices",
					"Every choice requires a non-empty ID and content.", http.StatusBadRequest,
				)
			}
			if _, exists := seen[input.Choices[i].ID]; exists {
				return questionError(
					ErrorCodeInvalidChoiceSet, "choices",
					"Choice IDs must be unique.", http.StatusBadRequest,
				)
			}
			seen[input.Choices[i].ID] = struct{}{}
		}
		if input.CorrectChoiceID == nil {
			return questionError(
				ErrorCodeMissingCorrectChoice, "correctChoiceId",
				"A correct choice is required.", http.StatusBadRequest,
			)
		}
		if _, exists := seen[*input.CorrectChoiceID]; !exists {
			return questionError(
				ErrorCodeMissingCorrectChoice, "correctChoiceId",
				"The correct choice must identify an existing choice.", http.StatusBadRequest,
			)
		}
	case QuestionTypeEssay:
		if len(input.Choices) != 0 || input.CorrectChoiceID != nil {
			return questionError(
				ErrorCodeInvalidChoiceSet, "choices",
				"Essay questions cannot have choices or a correct choice.", http.StatusBadRequest,
			)
		}
	}
	return nil
}

func validateRubricItemInput(input *RubricItemInput) error {
	if err := validateExpectedVersion(input.ExpectedVersion); err != nil {
		return err
	}
	input.Description = strings.TrimSpace(input.Description)
	if err := validateTrimmedRunes("description", input.Description, 1, 10000); err != nil {
		return err
	}
	if err := validateQuestionPoints(input.Points); err != nil {
		return err
	}
	if err := validateTopicIDs(input.TopicNodeIDs); err != nil {
		return err
	}
	return nil
}

func validatePatchRubricItemInput(input *PatchRubricItemInput) error {
	if err := validateExpectedVersion(input.ExpectedVersion); err != nil {
		return err
	}
	if input.Description == nil && input.Points == nil && input.TopicNodeIDs == nil {
		return invalidField("", "At least one rubric field must be supplied.")
	}
	if input.Description != nil {
		trimmed := strings.TrimSpace(*input.Description)
		input.Description = &trimmed
		if err := validateTrimmedRunes("description", trimmed, 1, 10000); err != nil {
			return err
		}
	}
	if input.Points != nil {
		if err := validateQuestionPoints(*input.Points); err != nil {
			return err
		}
	}
	if input.TopicNodeIDs != nil {
		if err := validateTopicIDs(input.TopicNodeIDs); err != nil {
			return err
		}
	}
	return nil
}

func validateTopicIDs(ids []uuid.UUID) error {
	if len(ids) == 0 {
		return questionError(
			ErrorCodeTopicRequired, "topicNodeIds",
			"At least one topic is required.", http.StatusBadRequest,
		)
	}
	seen := make(map[uuid.UUID]struct{}, len(ids))
	for _, id := range ids {
		if id == uuid.Nil {
			return topicNotAllowed()
		}
		if _, exists := seen[id]; exists {
			return topicNotAllowed()
		}
		seen[id] = struct{}{}
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

func questionError(code, field, message string, status int) *DomainError {
	return &DomainError{Code: code, Field: field, Message: message, Status: status}
}
