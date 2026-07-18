package scoring

import (
	"encoding/json"
	"fmt"
	"sort"

	"backend/internal/model"

	"github.com/google/uuid"
)

type gradingSnapshotJSON struct {
	ID          uuid.UUID              `json:"id"`
	TotalPoints model.Score            `json:"totalPoints"`
	Questions   []snapshotQuestionJSON `json:"questions"`
}

type snapshotQuestionJSON struct {
	ID           uuid.UUID            `json:"id"`
	QuestionType string               `json:"questionType"`
	Points       model.Score          `json:"points"`
	Position     int                  `json:"position"`
	Rubrics      []snapshotRubricJSON `json:"rubrics"`
}

type snapshotRubricJSON struct {
	ID       uuid.UUID   `json:"id"`
	Points   model.Score `json:"points"`
	Position int         `json:"position"`
}

func ParseGradingSnapshot(snapshot model.ExamSnapshot) (*GradingSnapshot, error) {
	if snapshot.Purpose != "grading_lock" {
		return nil, invalidSnapshot("purpose must be grading_lock")
	}
	if snapshot.ID == uuid.Nil || snapshot.ExamID == uuid.Nil {
		return nil, invalidSnapshot("snapshot and exam IDs are required")
	}

	var payload gradingSnapshotJSON
	if err := json.Unmarshal([]byte(snapshot.SnapshotJSON), &payload); err != nil {
		return nil, invalidSnapshot("decode JSON: %v", err)
	}
	if payload.ID == uuid.Nil || payload.ID != snapshot.ExamID {
		return nil, invalidSnapshot("snapshot exam ID does not match its record")
	}
	if !positiveScore(payload.TotalPoints) {
		return nil, invalidSnapshot("exam total points must be positive")
	}
	if len(payload.Questions) == 0 {
		return nil, invalidSnapshot("snapshot must contain at least one question")
	}

	questions := make([]SnapshotQuestion, 0, len(payload.Questions))
	questionIDs := make(map[uuid.UUID]struct{}, len(payload.Questions))
	rubricIDs := make(map[uuid.UUID]struct{})
	total := model.MustScore("0.00")

	for _, rawQuestion := range payload.Questions {
		if rawQuestion.ID == uuid.Nil {
			return nil, invalidSnapshot("question ID is required")
		}
		if _, duplicate := questionIDs[rawQuestion.ID]; duplicate {
			return nil, invalidSnapshot("duplicate question ID %s", rawQuestion.ID)
		}
		questionIDs[rawQuestion.ID] = struct{}{}
		if rawQuestion.Position < 1 {
			return nil, invalidSnapshot("question position must be positive")
		}
		if !positiveScore(rawQuestion.Points) {
			return nil, invalidSnapshot("question %s points must be positive", rawQuestion.ID)
		}

		question := SnapshotQuestion{
			ID:           rawQuestion.ID,
			QuestionType: rawQuestion.QuestionType,
			Points:       rawQuestion.Points,
			Position:     rawQuestion.Position,
			Rubrics:      make([]SnapshotRubric, 0, len(rawQuestion.Rubrics)),
		}
		switch rawQuestion.QuestionType {
		case "single_choice":
			if len(rawQuestion.Rubrics) != 0 {
				return nil, invalidSnapshot(
					"single-choice question %s cannot contain rubrics", rawQuestion.ID,
				)
			}
		case "essay":
			if len(rawQuestion.Rubrics) == 0 {
				return nil, invalidSnapshot("essay question %s requires rubrics", rawQuestion.ID)
			}
		default:
			return nil, invalidSnapshot(
				"question %s has unsupported type %q", rawQuestion.ID, rawQuestion.QuestionType,
			)
		}

		rubricTotal := model.MustScore("0.00")
		for _, rawRubric := range rawQuestion.Rubrics {
			if rawRubric.ID == uuid.Nil {
				return nil, invalidSnapshot("rubric ID is required")
			}
			if _, duplicate := rubricIDs[rawRubric.ID]; duplicate {
				return nil, invalidSnapshot("duplicate rubric ID %s", rawRubric.ID)
			}
			rubricIDs[rawRubric.ID] = struct{}{}
			if rawRubric.Position < 1 {
				return nil, invalidSnapshot("rubric position must be positive")
			}
			if !positiveScore(rawRubric.Points) {
				return nil, invalidSnapshot("rubric %s points must be positive", rawRubric.ID)
			}
			question.Rubrics = append(question.Rubrics, SnapshotRubric{
				ID: rawRubric.ID, Points: rawRubric.Points, Position: rawRubric.Position,
			})
			rubricTotal.Decimal = rubricTotal.Decimal.Add(rawRubric.Points.Decimal)
		}
		if rawQuestion.QuestionType == "essay" &&
			!rubricTotal.Decimal.Equal(rawQuestion.Points.Decimal) {
			return nil, invalidSnapshot("rubric points do not equal essay question points")
		}

		sort.Slice(question.Rubrics, func(i, j int) bool {
			return question.Rubrics[i].Position < question.Rubrics[j].Position
		})
		questions = append(questions, question)
		total.Decimal = total.Decimal.Add(rawQuestion.Points.Decimal)
	}

	if !total.Decimal.Equal(payload.TotalPoints.Decimal) {
		return nil, invalidSnapshot("question points do not equal exam total points")
	}
	sort.Slice(questions, func(i, j int) bool {
		return questions[i].Position < questions[j].Position
	})

	return &GradingSnapshot{
		SnapshotID:  snapshot.ID,
		ExamID:      payload.ID,
		TotalPoints: payload.TotalPoints,
		Questions:   questions,
	}, nil
}

func positiveScore(score model.Score) bool {
	if _, err := score.Value(); err != nil {
		return false
	}
	return score.Decimal.IsPositive()
}

func invalidSnapshot(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidSnapshot, fmt.Sprintf(format, args...))
}
