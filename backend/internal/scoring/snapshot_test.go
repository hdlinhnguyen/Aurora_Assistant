package scoring_test

import (
	"encoding/json"
	"testing"

	"backend/internal/model"
	"backend/internal/scoring"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type snapshotFixture struct {
	ID          uuid.UUID                 `json:"id"`
	TotalPoints model.Score               `json:"totalPoints"`
	Questions   []snapshotQuestionFixture `json:"questions"`
}

type snapshotQuestionFixture struct {
	ID           uuid.UUID               `json:"id"`
	QuestionType string                  `json:"questionType"`
	Points       model.Score             `json:"points"`
	Position     int                     `json:"position"`
	Rubrics      []snapshotRubricFixture `json:"rubrics"`
}

type snapshotRubricFixture struct {
	ID       uuid.UUID   `json:"id"`
	Points   model.Score `json:"points"`
	Position int         `json:"position"`
}

func validSnapshotFixture(t *testing.T) (model.ExamSnapshot, snapshotFixture) {
	t.Helper()

	payload := snapshotFixture{
		ID:          uuid.New(),
		TotalPoints: model.MustScore("10.00"),
		Questions: []snapshotQuestionFixture{
			{
				ID: uuid.New(), QuestionType: "essay",
				Points: model.MustScore("6.00"), Position: 2,
				Rubrics: []snapshotRubricFixture{
					{ID: uuid.New(), Points: model.MustScore("2.00"), Position: 2},
					{ID: uuid.New(), Points: model.MustScore("4.00"), Position: 1},
				},
			},
			{
				ID: uuid.New(), QuestionType: "single_choice",
				Points: model.MustScore("4.00"), Position: 1,
			},
		},
	}
	return encodeSnapshot(t, payload), payload
}

func encodeSnapshot(t *testing.T, payload snapshotFixture) model.ExamSnapshot {
	t.Helper()
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	return model.ExamSnapshot{
		ID: uuid.New(), ExamID: payload.ID, Purpose: "grading_lock",
		SnapshotJSON: string(raw),
	}
}

func TestParseGradingSnapshotRejectsWrongPurpose(t *testing.T) {
	_, err := scoring.ParseGradingSnapshot(model.ExamSnapshot{
		Purpose:      "export",
		SnapshotJSON: `{}`,
	})
	require.ErrorIs(t, err, scoring.ErrInvalidSnapshot)
}

func TestParseGradingSnapshotBuildsOrderedWholeExam(t *testing.T) {
	snapshot, payload := validSnapshotFixture(t)

	parsed, err := scoring.ParseGradingSnapshot(snapshot)

	require.NoError(t, err)
	require.Equal(t, snapshot.ID, parsed.SnapshotID)
	require.Equal(t, payload.ID, parsed.ExamID)
	require.Equal(t, "10.00", parsed.TotalPoints.String())
	require.Equal(t, []uuid.UUID{
		payload.Questions[1].ID,
		payload.Questions[0].ID,
	}, []uuid.UUID{
		parsed.Questions[0].ID,
		parsed.Questions[1].ID,
	})
	require.Equal(t, []uuid.UUID{
		payload.Questions[0].Rubrics[1].ID,
		payload.Questions[0].Rubrics[0].ID,
	}, []uuid.UUID{
		parsed.Questions[1].Rubrics[0].ID,
		parsed.Questions[1].Rubrics[1].ID,
	})
}

func TestParseGradingSnapshotRejectsInvalidContracts(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*snapshotFixture)
	}{
		{
			name: "duplicate question ID",
			mutate: func(payload *snapshotFixture) {
				payload.Questions[1].ID = payload.Questions[0].ID
			},
		},
		{
			name: "duplicate rubric ID",
			mutate: func(payload *snapshotFixture) {
				payload.Questions[0].Rubrics[1].ID = payload.Questions[0].Rubrics[0].ID
			},
		},
		{
			name: "rubric on single choice",
			mutate: func(payload *snapshotFixture) {
				payload.Questions[1].Rubrics = []snapshotRubricFixture{{
					ID: uuid.New(), Points: model.MustScore("4.00"), Position: 1,
				}}
			},
		},
		{
			name: "essay without rubric",
			mutate: func(payload *snapshotFixture) {
				payload.Questions[0].Rubrics = nil
			},
		},
		{
			name: "rubric total mismatch",
			mutate: func(payload *snapshotFixture) {
				payload.Questions[0].Rubrics[0].Points = model.MustScore("1.00")
			},
		},
		{
			name: "exam total mismatch",
			mutate: func(payload *snapshotFixture) {
				payload.TotalPoints = model.MustScore("9.00")
			},
		},
		{
			name: "unsupported question type",
			mutate: func(payload *snapshotFixture) {
				payload.Questions[1].QuestionType = "true_false"
			},
		},
		{
			name: "zero question ID",
			mutate: func(payload *snapshotFixture) {
				payload.Questions[1].ID = uuid.Nil
			},
		},
		{
			name: "non-positive score",
			mutate: func(payload *snapshotFixture) {
				payload.Questions[1].Points = model.MustScore("0.00")
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, payload := validSnapshotFixture(t)
			test.mutate(&payload)

			_, err := scoring.ParseGradingSnapshot(encodeSnapshot(t, payload))

			require.ErrorIs(t, err, scoring.ErrInvalidSnapshot)
		})
	}
}
