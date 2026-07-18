package exam

import (
	"strings"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
)

type TopicLookup map[uuid.UUID]string

type ValidationError struct {
	Code           string     `json:"code"`
	Message        string     `json:"message"`
	Field          string     `json:"field"`
	ExamQuestionID *uuid.UUID `json:"examQuestionId,omitempty"`
	RubricItemID   *uuid.UUID `json:"rubricItemId,omitempty"`
	Expected       string     `json:"expected,omitempty"`
	Actual         string     `json:"actual,omitempty"`
}

type ValidationResult struct {
	Valid  bool              `json:"valid"`
	Errors []ValidationError `json:"errors"`
}

func ValidateDetail(detail Detail, topics TopicLookup) []ValidationError {
	errors := make([]ValidationError, 0)
	if len(detail.Questions) == 0 {
		errors = append(errors, ValidationError{
			Code: ErrorCodeExamEmpty, Message: "Exam must contain at least one question.",
			Field: "questions",
		})
	}

	questionTotal := decimal.Zero
	for index := range detail.Questions {
		question := &detail.Questions[index]
		questionID := question.ID
		questionTotal = questionTotal.Add(question.Points.Decimal)
		if !question.Points.Decimal.IsPositive() {
			errors = append(errors, ValidationError{
				Code: ErrorCodeInvalidRequest, Message: "Question points must be greater than zero.",
				Field: "points", ExamQuestionID: &questionID,
			})
		}

		validateQuestionShape(question, &errors)
		validateQuestionTopics(detail.Subject, question, topics, &errors)
		if question.QuestionType == QuestionTypeEssay {
			validateEssayRubric(detail.Subject, question, topics, &errors)
		}
	}

	if !detail.TotalPoints.Decimal.IsPositive() {
		errors = append(errors, ValidationError{
			Code: ErrorCodeScoreMismatch, Message: "Exam total points must be greater than zero.",
			Field: "totalPoints", Expected: detail.TotalPoints.String(),
			Actual: questionTotal.StringFixed(2),
		})
	} else if !questionTotal.Equal(detail.TotalPoints.Decimal) {
		errors = append(errors, ValidationError{
			Code: ErrorCodeScoreMismatch, Message: "Question points must equal exam total points.",
			Field: "totalPoints", Expected: detail.TotalPoints.String(),
			Actual: questionTotal.StringFixed(2),
		})
	}

	return errors
}

func validateQuestionShape(question *QuestionDetail, errors *[]ValidationError) {
	questionID := question.ID
	switch question.QuestionType {
	case QuestionTypeSingleChoice:
		seen := make(map[string]struct{}, len(question.Choices))
		validChoices := len(question.Choices) >= 2
		for _, choice := range question.Choices {
			if strings.TrimSpace(choice.ID) == "" || strings.TrimSpace(choice.Content) == "" {
				validChoices = false
			}
			if _, exists := seen[choice.ID]; exists {
				validChoices = false
			}
			seen[choice.ID] = struct{}{}
		}
		if !validChoices {
			*errors = append(*errors, ValidationError{
				Code:    ErrorCodeInvalidChoiceSet,
				Message: "Single-choice questions require at least two unique non-empty choices.",
				Field:   "choices", ExamQuestionID: &questionID,
			})
		}
		if question.CorrectChoiceID == nil {
			*errors = append(*errors, ValidationError{
				Code:    ErrorCodeMissingCorrectChoice,
				Message: "Single-choice questions require a correct choice.",
				Field:   "correctChoiceId", ExamQuestionID: &questionID,
			})
		} else if _, exists := seen[*question.CorrectChoiceID]; !exists {
			*errors = append(*errors, ValidationError{
				Code:    ErrorCodeMissingCorrectChoice,
				Message: "The correct choice must identify an existing choice.",
				Field:   "correctChoiceId", ExamQuestionID: &questionID,
			})
		}
	case QuestionTypeEssay:
		if len(question.Choices) != 0 || question.CorrectChoiceID != nil {
			*errors = append(*errors, ValidationError{
				Code:    ErrorCodeInvalidChoiceSet,
				Message: "Essay questions cannot have choices or a correct choice.",
				Field:   "choices", ExamQuestionID: &questionID,
			})
		}
	default:
		*errors = append(*errors, ValidationError{
			Code: ErrorCodeInvalidChoiceSet, Message: "Question type is not supported.",
			Field: "questionType", ExamQuestionID: &questionID,
		})
	}
}

func validateQuestionTopics(
	subject string,
	question *QuestionDetail,
	topics TopicLookup,
	errors *[]ValidationError,
) {
	questionID := question.ID
	if question.SourceType == QuestionSourceManual && len(question.TopicNodeIDs) == 0 {
		*errors = append(*errors, ValidationError{
			Code: ErrorCodeTopicRequired, Message: "Manual questions require at least one topic.",
			Field: "topicNodeIds", ExamQuestionID: &questionID,
		})
	}
	for _, topicID := range question.TopicNodeIDs {
		if topics[topicID] != subject {
			*errors = append(*errors, ValidationError{
				Code:    ErrorCodeTopicNotAllowed,
				Message: "Every question topic must belong to the exam subject.",
				Field:   "topicNodeIds", ExamQuestionID: &questionID,
			})
			break
		}
	}
}

func validateEssayRubric(
	subject string,
	question *QuestionDetail,
	topics TopicLookup,
	errors *[]ValidationError,
) {
	questionID := question.ID
	if len(question.RubricItems) == 0 {
		*errors = append(*errors, ValidationError{
			Code:    ErrorCodeRubricIncomplete,
			Message: "Essay questions require at least one rubric item.",
			Field:   "rubricItems", ExamQuestionID: &questionID,
		})
		return
	}

	total := decimal.Zero
	for index := range question.RubricItems {
		rubric := &question.RubricItems[index]
		rubricID := rubric.ID
		total = total.Add(rubric.Points.Decimal)
		if strings.TrimSpace(rubric.Description) == "" || !rubric.Points.Decimal.IsPositive() {
			*errors = append(*errors, ValidationError{
				Code:    ErrorCodeRubricIncomplete,
				Message: "Every rubric item requires a description and positive points.",
				Field:   "rubricItems", ExamQuestionID: &questionID, RubricItemID: &rubricID,
			})
		}
		if len(rubric.TopicNodeIDs) == 0 {
			*errors = append(*errors, ValidationError{
				Code: ErrorCodeTopicRequired, Message: "Every rubric item requires a topic.",
				Field: "topicNodeIds", ExamQuestionID: &questionID, RubricItemID: &rubricID,
			})
		}
		for _, topicID := range rubric.TopicNodeIDs {
			if topics[topicID] != subject {
				*errors = append(*errors, ValidationError{
					Code:    ErrorCodeTopicNotAllowed,
					Message: "Every rubric topic must belong to the exam subject.",
					Field:   "topicNodeIds", ExamQuestionID: &questionID, RubricItemID: &rubricID,
				})
				break
			}
		}
	}
	if !total.Equal(question.Points.Decimal) {
		*errors = append(*errors, ValidationError{
			Code:    ErrorCodeRubricScoreMismatch,
			Message: "Rubric points must equal question points.",
			Field:   "rubricItems", ExamQuestionID: &questionID,
			Expected: question.Points.String(), Actual: total.StringFixed(2),
		})
	}
}
