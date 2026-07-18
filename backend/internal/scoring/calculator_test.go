package scoring_test

import (
	"testing"

	"backend/internal/model"
	"backend/internal/scoring"

	"github.com/stretchr/testify/require"
)

func TestScoreSingleChoiceUsesExactPoints(t *testing.T) {
	points := model.MustScore("4.00")

	require.Equal(t, "4.00", scoring.ScoreSingleChoice("correct", points).String())
	require.Equal(t, "0.00", scoring.ScoreSingleChoice("incorrect", points).String())
	require.Equal(t, "0.00", scoring.ScoreSingleChoice("unanswered", points).String())
}

func TestDeriveEssaySumsReviewedRubrics(t *testing.T) {
	essay := scoring.DeriveEssay([]scoring.RubricScore{
		{Status: "correct", Reviewed: true, Points: model.MustScore("2.00")},
		{Status: "incorrect", Reviewed: true, Points: model.MustScore("1.00")},
	})

	require.Equal(t, "incorrect", essay.Status)
	require.True(t, essay.Reviewed)
	require.Equal(t, "2.00", essay.AwardedPoints.String())
}

func TestDeriveEssayDistinguishesInitialAndExplicitUnanswered(t *testing.T) {
	initial := scoring.DeriveEssay([]scoring.RubricScore{
		{Status: "unanswered", Reviewed: false, Points: model.MustScore("2.00")},
	})
	explicit := scoring.DeriveEssay([]scoring.RubricScore{
		{Status: "unanswered", Reviewed: true, Points: model.MustScore("2.00")},
	})

	require.False(t, initial.Reviewed)
	require.True(t, explicit.Reviewed)
	require.Equal(t, "unanswered", explicit.Status)
	require.Equal(t, "0.00", explicit.AwardedPoints.String())
}

func TestDeriveEssayAndSumQuestionsRemainExact(t *testing.T) {
	correct := scoring.DeriveEssay([]scoring.RubricScore{
		{Status: "correct", Reviewed: true, Points: model.MustScore("0.10")},
		{Status: "correct", Reviewed: true, Points: model.MustScore("0.20")},
	})
	total := scoring.SumQuestions([]scoring.DerivedQuestion{
		correct,
		{Status: "correct", Reviewed: true, AwardedPoints: model.MustScore("0.30")},
	})

	require.Equal(t, "correct", correct.Status)
	require.Equal(t, "0.30", correct.AwardedPoints.String())
	require.Equal(t, "0.60", total.String())
}

func TestValidateResultStatusRejectsUnknownStatus(t *testing.T) {
	require.NoError(t, scoring.ValidateResultStatus("correct"))
	require.NoError(t, scoring.ValidateResultStatus("incorrect"))
	require.NoError(t, scoring.ValidateResultStatus("unanswered"))
	require.Error(t, scoring.ValidateResultStatus("partial"))
}
