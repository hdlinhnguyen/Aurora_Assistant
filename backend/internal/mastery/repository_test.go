package mastery_test

import (
	"context"
	"testing"
	"time"

	"backend/internal/mastery"
	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func setupRepository(t *testing.T) (*mastery.Repository, model.User, model.Node) {
	t.Helper()
	db := testutil.OpenPostgres(t)
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.Node{},
		&model.StudentTopicMastery{},
		&model.StudentTopicMasteryHistory{},
	))

	student := model.User{
		ID: uuid.New(), Email: uuid.NewString() + "@example.com",
		Password: "secret", Name: "Student", Role: "student",
	}
	topic := model.Node{ID: uuid.New(), Subject: "Toan dai so", Name: "Phan so"}
	require.NoError(t, db.Create(&student).Error)
	require.NoError(t, db.Create(&topic).Error)
	return mastery.NewRepository(db), student, topic
}

func sampleState(studentID, topicID uuid.UUID) mastery.TopicState {
	now := time.Date(2026, 7, 18, 8, 0, 0, 0, time.UTC)
	return mastery.TopicState{
		StudentID:          studentID,
		TopicID:            topicID,
		MasteryProbability: 0.76,
		ConfidenceScore:    0.68,
		Consistency:        0.81,
		EvidenceCount:      4,
		EffectiveEvidence:  3.2,
		Status:             mastery.StatusLearning,
		EvidenceSummary:    map[string]float64{"mean_observation": 0.75},
		SourceBreakdown:    map[string]int{"quiz": 4},
		Version:            1,
		CalculatedAt:       now,
		LastEvidenceAt:     &now,
	}
}

func TestRepositoryUpsertCreatesCurrentAndHistory(t *testing.T) {
	repo, student, topic := setupRepository(t)
	state := sampleState(student.ID, topic.ID)

	require.NoError(t, repo.UpsertStates(context.Background(), []mastery.TopicState{state}))

	profile, err := repo.GetProfile(context.Background(), student.ID, topic.Subject)
	require.NoError(t, err)
	require.Contains(t, profile.Topics, topic.ID.String())
	require.InDelta(t, 0.76, profile.Topics[topic.ID.String()].MasteryProbability, 0.0001)

	history, err := repo.GetHistory(context.Background(), student.ID, topic.ID, mastery.RangeAll)
	require.NoError(t, err)
	require.Len(t, history, 1)
	require.Equal(t, 1, history[0].Version)
}

func TestRepositoryRetryDoesNotDuplicateHistory(t *testing.T) {
	repo, student, topic := setupRepository(t)
	state := sampleState(student.ID, topic.ID)

	require.NoError(t, repo.UpsertStates(context.Background(), []mastery.TopicState{state}))
	require.NoError(t, repo.UpsertStates(context.Background(), []mastery.TopicState{state}))

	history, err := repo.GetHistory(context.Background(), student.ID, topic.ID, mastery.RangeAll)
	require.NoError(t, err)
	require.Len(t, history, 1)
}

func TestRepositoryRejectsOutOfRangeState(t *testing.T) {
	repo, student, topic := setupRepository(t)
	state := sampleState(student.ID, topic.ID)
	state.MasteryProbability = 1.1

	err := repo.UpsertStates(context.Background(), []mastery.TopicState{state})

	require.ErrorContains(t, err, "mastery_probability")
}
