package syntheticseed

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestHistoricalExamFixturesContainTenGrade7Assessments(t *testing.T) {
	nodes := make(map[string]uuid.UUID)
	for _, key := range grade7TargetKeys() {
		nodes[key] = uuid.New()
	}
	fixtures := historicalExamFixtures(DefaultConfig(), nodes)
	require.Len(t, fixtures, 10)
	objectiveExams, essayExams := 0, 0
	objectiveQuestions, essayQuestions := 0, 0
	covered := map[uuid.UUID]struct{}{}
	for _, fixture := range fixtures {
		require.Equal(t, "7", fixture.GradeLevel)
		if fixture.Questions[0].QuestionType == "single_choice" {
			objectiveExams++
		} else {
			essayExams++
		}
		for _, question := range fixture.Questions {
			covered[question.TopicNodeID] = struct{}{}
			if question.QuestionType == "single_choice" {
				objectiveQuestions++
				require.NotEmpty(t, question.Choices)
				choiceIDs := make(map[string]struct{}, len(question.Choices))
				choiceContent := make(map[string]struct{}, len(question.Choices))
				for _, choice := range question.Choices {
					choiceIDs[choice.ID] = struct{}{}
					choiceContent[choice.Content] = struct{}{}
				}
				require.Len(t, choiceIDs, len(question.Choices))
				require.Len(t, choiceContent, len(question.Choices))
				require.Contains(t, choiceIDs, question.CorrectChoiceID)
			} else {
				essayQuestions++
				require.NotEmpty(t, question.Rubrics)
			}
		}
	}
	require.Equal(t, 7, objectiveExams)
	require.Equal(t, 3, essayExams)
	require.Equal(t, 28, objectiveQuestions)
	require.Equal(t, 6, essayQuestions)
	require.Len(t, covered, 8)
}

func TestHistoricalOutcomesDeriveRubricAndSubmissionTotals(t *testing.T) {
	nodes := make(map[string]uuid.UUID)
	for _, key := range grade7TargetKeys() {
		nodes[key] = uuid.New()
	}
	fixtures := historicalExamFixtures(DefaultConfig(), nodes)
	for _, exam := range fixtures {
		strong := deriveHistoricalOutcome(exam, 0)
		developing := deriveHistoricalOutcome(exam, 1)
		struggling := deriveHistoricalOutcome(exam, 2)
		require.NoError(t, validateHistoricalOutcome(exam, strong))
		require.NoError(t, validateHistoricalOutcome(exam, developing))
		require.NoError(t, validateHistoricalOutcome(exam, struggling))
		require.True(t, strong.Total.Decimal.GreaterThan(developing.Total.Decimal))
		require.True(t, developing.Total.Decimal.GreaterThan(struggling.Total.Decimal))
	}
}
