package exam_test

import (
	"testing"

	"backend/internal/exam"
	"backend/internal/model"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestValidationReportsStableCodesAndScoreMetadata(t *testing.T) {
	topicID := uuid.New()
	foreignTopicID := uuid.New()
	questionID := uuid.New()
	rubricID := uuid.New()

	valid := exam.Detail{
		Exam: model.Exam{
			Subject:     "Algebra",
			TotalPoints: model.MustScore("2.00"),
		},
		Questions: []exam.QuestionDetail{{
			ExamQuestion: model.ExamQuestion{
				ID: questionID, SourceType: exam.QuestionSourceManual,
				QuestionType: exam.QuestionTypeEssay,
				Points:       model.MustScore("2.00"),
			},
			TopicNodeIDs: []uuid.UUID{topicID},
			RubricItems: []exam.RubricItemDetail{{
				ExamRubricItem: model.ExamRubricItem{
					ID: rubricID, Description: "Complete explanation",
					Points: model.MustScore("2.00"),
				},
				TopicNodeIDs: []uuid.UUID{topicID},
			}},
		}},
	}
	topics := exam.TopicLookup{
		topicID:        "Algebra",
		foreignTopicID: "Geometry",
	}

	tests := []struct {
		name   string
		mutate func(*exam.Detail)
		code   string
	}{
		{
			name: "empty exam",
			mutate: func(detail *exam.Detail) {
				detail.Questions = nil
			},
			code: exam.ErrorCodeExamEmpty,
		},
		{
			name: "question score mismatch",
			mutate: func(detail *exam.Detail) {
				detail.TotalPoints = model.MustScore("3.00")
			},
			code: exam.ErrorCodeScoreMismatch,
		},
		{
			name: "essay rubric missing",
			mutate: func(detail *exam.Detail) {
				detail.Questions[0].RubricItems = nil
			},
			code: exam.ErrorCodeRubricIncomplete,
		},
		{
			name: "rubric sum mismatch",
			mutate: func(detail *exam.Detail) {
				detail.Questions[0].RubricItems[0].Points = model.MustScore("1.00")
			},
			code: exam.ErrorCodeRubricScoreMismatch,
		},
		{
			name: "manual topic missing",
			mutate: func(detail *exam.Detail) {
				detail.Questions[0].TopicNodeIDs = nil
			},
			code: exam.ErrorCodeTopicRequired,
		},
		{
			name: "foreign topic",
			mutate: func(detail *exam.Detail) {
				detail.Questions[0].TopicNodeIDs = []uuid.UUID{foreignTopicID}
			},
			code: exam.ErrorCodeTopicNotAllowed,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			detail := valid
			detail.Questions = append([]exam.QuestionDetail(nil), valid.Questions...)
			detail.Questions[0].TopicNodeIDs = append(
				[]uuid.UUID(nil), valid.Questions[0].TopicNodeIDs...,
			)
			detail.Questions[0].RubricItems = append(
				[]exam.RubricItemDetail(nil), valid.Questions[0].RubricItems...,
			)
			testCase.mutate(&detail)

			errors := exam.ValidateDetail(detail, topics)
			require.Contains(t, validationCodes(errors), testCase.code)
			if testCase.code == exam.ErrorCodeScoreMismatch {
				found := findValidationError(errors, testCase.code)
				require.Equal(t, "3.00", found.Expected)
				require.Equal(t, "2.00", found.Actual)
			}
			if testCase.code == exam.ErrorCodeRubricScoreMismatch {
				found := findValidationError(errors, testCase.code)
				require.Equal(t, &questionID, found.ExamQuestionID)
				require.Equal(t, "2.00", found.Expected)
				require.Equal(t, "1.00", found.Actual)
			}
		})
	}
}

func TestValidationRejectsInvalidSingleChoiceAnswerShape(t *testing.T) {
	topicID := uuid.New()
	questionID := uuid.New()
	detail := exam.Detail{
		Exam: model.Exam{Subject: "Algebra", TotalPoints: model.MustScore("1.00")},
		Questions: []exam.QuestionDetail{{
			ExamQuestion: model.ExamQuestion{
				ID: questionID, SourceType: exam.QuestionSourceManual,
				QuestionType: exam.QuestionTypeSingleChoice,
				Points:       model.MustScore("1.00"),
			},
			Choices: []exam.Choice{
				{ID: "same", Content: "A"},
				{ID: "same", Content: "B"},
			},
			TopicNodeIDs: []uuid.UUID{topicID},
		}},
	}

	errors := exam.ValidateDetail(detail, exam.TopicLookup{topicID: "Algebra"})
	require.Contains(t, validationCodes(errors), exam.ErrorCodeInvalidChoiceSet)
	require.Contains(t, validationCodes(errors), exam.ErrorCodeMissingCorrectChoice)
}

func validationCodes(errors []exam.ValidationError) []string {
	codes := make([]string, 0, len(errors))
	for _, validationError := range errors {
		codes = append(codes, validationError.Code)
	}
	return codes
}

func findValidationError(errors []exam.ValidationError, code string) exam.ValidationError {
	for _, validationError := range errors {
		if validationError.Code == code {
			return validationError
		}
	}
	return exam.ValidationError{}
}
