package scoring

import "backend/internal/model"

func ValidateResultStatus(status string) error {
	switch status {
	case model.ScoringResultCorrect,
		model.ScoringResultIncorrect,
		model.ScoringResultUnanswered:
		return nil
	default:
		return invalidResultStatus()
	}
}

func ScoreSingleChoice(status string, points model.Score) model.Score {
	if status == model.ScoringResultCorrect {
		return points
	}
	return model.MustScore("0.00")
}

func DeriveEssay(rubrics []RubricScore) DerivedQuestion {
	result := DerivedQuestion{
		Status:        model.ScoringResultUnanswered,
		Reviewed:      len(rubrics) > 0,
		AwardedPoints: model.MustScore("0.00"),
	}
	if len(rubrics) == 0 {
		return result
	}

	allCorrect := true
	allUnanswered := true
	for _, rubric := range rubrics {
		result.Reviewed = result.Reviewed && rubric.Reviewed
		allCorrect = allCorrect && rubric.Status == model.ScoringResultCorrect
		allUnanswered = allUnanswered && rubric.Status == model.ScoringResultUnanswered
		if rubric.Status == model.ScoringResultCorrect {
			result.AwardedPoints.Decimal = result.AwardedPoints.Decimal.Add(rubric.Points.Decimal)
		}
	}

	switch {
	case allUnanswered:
		result.Status = model.ScoringResultUnanswered
	case allCorrect:
		result.Status = model.ScoringResultCorrect
	default:
		result.Status = model.ScoringResultIncorrect
	}
	return result
}

func SumQuestions(questions []DerivedQuestion) model.Score {
	total := model.MustScore("0.00")
	for _, question := range questions {
		total.Decimal = total.Decimal.Add(question.AwardedPoints.Decimal)
	}
	return total
}
