package syntheticseed

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestGenerateAttemptsIsDeterministicAndUsesValidQuestions(t *testing.T) {
	first := GenerateAttempts(42, 1, 2, 5)
	second := GenerateAttempts(42, 1, 2, 5)
	require.Equal(t, first, second)
	require.NotEmpty(t, first)
	for _, attempt := range first {
		require.GreaterOrEqual(t, attempt.QuestionIndex, 0)
		require.Less(t, attempt.QuestionIndex, 5)
	}
}

func TestGenerateAttemptsCreatesDistinctStudentProfiles(t *testing.T) {
	strong := GenerateAttempts(42, 0, 0, 5)
	developing := GenerateAttempts(42, 1, 0, 5)
	struggling := GenerateAttempts(42, 2, 0, 5)

	correctCount := func(attempts []Attempt) int {
		count := 0
		for _, attempt := range attempts {
			if attempt.Correct {
				count++
			}
		}
		return count
	}
	require.Greater(t, correctCount(strong), correctCount(developing))
	require.Greater(t, correctCount(developing), correctCount(struggling))
}
