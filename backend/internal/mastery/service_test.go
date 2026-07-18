package mastery

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeCalculator struct {
	response CalculateResponse
	received CalculateRequest
}

func (f *fakeCalculator) Calculate(_ context.Context, request CalculateRequest) (CalculateResponse, error) {
	f.received = request
	return f.response, nil
}

type fakeStore struct{ states []TopicState }

func (f *fakeStore) UpsertStates(_ context.Context, states []TopicState) error {
	f.states = append(f.states, states...)
	return nil
}

func (f *fakeStore) GetProfile(context.Context, uuid.UUID, string) (Profile, error) {
	return Profile{}, nil
}

func (f *fakeStore) GetHistory(context.Context, uuid.UUID, uuid.UUID, string) ([]HistoryPoint, error) {
	return nil, nil
}

func TestServicePersistsCalculatedStatesWithIncrementedVersion(t *testing.T) {
	studentID, topicID := uuid.New(), uuid.New()
	calculator := &fakeCalculator{response: CalculateResponse{
		StudentID:    "student-1",
		CalculatedAt: "2026-07-18T01:00:00Z",
		States: map[string]TopicStatePayload{
			topicID.String(): {StudentID: studentID.String(), TopicID: topicID.String(), MasteryProbability: 0.76, ConfidenceScore: 0.68, Consistency: 0.8, EvidenceCount: 1, EffectiveEvidence: 0.85, MasteryStatus: StatusLearning, Version: 1},
		},
	}}
	store := &fakeStore{}
	svc := &Service{store: store, calculator: calculator, subjectTopics: func(context.Context, uuid.UUID, string) ([]uuid.UUID, error) { return []uuid.UUID{topicID}, nil }, evidence: func(context.Context, uuid.UUID, string) ([]QuizEvidence, error) {
		return []QuizEvidence{{EvidenceID: "e-1", StudentID: studentID, TopicID: topicID, Score: 1, OccurredAt: time.Now()}}, nil
	}, currentProfile: func(context.Context, uuid.UUID, string) (Profile, error) {
		return Profile{Topics: map[string]TopicState{topicID.String(): {StudentID: studentID, TopicID: topicID, Version: 3}}}, nil
	}}

	_, err := svc.RecalculateStudent(context.Background(), studentID, "Toan dai so")

	require.NoError(t, err)
	require.Len(t, store.states, 1)
	require.Equal(t, 4, store.states[0].Version)
	require.Equal(t, topicID, calculator.received.TopicIDs[0])
	require.Len(t, calculator.received.RawQuiz, 1)
}
