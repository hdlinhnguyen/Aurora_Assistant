package syntheticseed

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestHistoricalExamFixturesContainObjectiveAndEssayExams(t *testing.T) {
	nodes := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}
	fixtures := historicalExamFixtures(DefaultConfig(), nodes)
	require.Len(t, fixtures, 2)
	require.Equal(t, "single_choice", fixtures[0].Questions[0].QuestionType)
	require.Equal(t, "essay", fixtures[1].Questions[0].QuestionType)
	require.NotEmpty(t, fixtures[0].Questions[0].Choices)
	require.NotEmpty(t, fixtures[1].Questions[0].Rubrics)
}

func TestHistoricalOutcomesDeriveRubricAndSubmissionTotals(t *testing.T) {
	fixtures := historicalExamFixtures(DefaultConfig(), []uuid.UUID{uuid.New(), uuid.New(), uuid.New()})
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
