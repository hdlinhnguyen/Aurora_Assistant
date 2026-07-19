package mastery

import (
	"context"
	"testing"
	"time"

	"backend/internal/telemetry"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeCalculator struct {
	response CalculateResponse
	received CalculateRequest
}

func TestInferenceWeightFromActivityDetail(t *testing.T) {
	require.Equal(t, 0.35, inferenceWeightFromActivityDetail("[inference_weight=0.35] distractor"))
	require.Equal(t, float64(1), inferenceWeightFromActivityDetail("direct evidence"))
	require.Equal(t, float64(1), inferenceWeightFromActivityDetail("[inference_weight=invalid]"))
}

func (f *fakeCalculator) Calculate(_ context.Context, request CalculateRequest) (CalculateResponse, error) {
	f.received = request
	return f.response, nil
}

type fakeStore struct {
	states  []TopicState
	profile Profile
}

type recordingMasteryPublisher struct {
	events []telemetry.Event
}

func (p *recordingMasteryPublisher) PublishActor(_ context.Context, _ uuid.UUID, _ string, event telemetry.Event) (telemetry.PublishResult, error) {
	p.events = append(p.events, event)
	return telemetry.PublishResult{}, nil
}

func (f *fakeStore) UpsertStates(_ context.Context, states []TopicState) error {
	f.states = append(f.states, states...)
	return nil
}

func (f *fakeStore) GetProfile(context.Context, uuid.UUID, string) (Profile, error) {
	return f.profile, nil
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

func TestServiceGetProfileAddsPriorForMissingSubjectTopics(t *testing.T) {
	studentID, knownTopicID, missingTopicID := uuid.New(), uuid.New(), uuid.New()
	store := &fakeStore{profile: Profile{
		StudentID: studentID,
		Subject:   "Toan",
		Topics: map[string]TopicState{
			knownTopicID.String(): {
				StudentID: studentID, TopicID: knownTopicID, MasteryProbability: 0.72,
				ConfidenceScore: 0.55, Consistency: 0.8, EvidenceCount: 2,
				EffectiveEvidence: 1.7, Status: StatusLearning, Version: 2,
			},
		},
	}}
	svc := &Service{
		store: store,
		subjectTopics: func(context.Context, uuid.UUID, string) ([]uuid.UUID, error) {
			return []uuid.UUID{knownTopicID, missingTopicID}, nil
		},
	}

	profile, err := svc.GetProfile(context.Background(), studentID, "Toan")

	require.NoError(t, err)
	require.Len(t, profile.Topics, 2)
	require.Equal(t, 0.72, profile.Topics[knownTopicID.String()].MasteryProbability)
	prior := profile.Topics[missingTopicID.String()]
	require.Equal(t, 0.3, prior.MasteryProbability)
	require.Equal(t, StatusUnknown, prior.Status)
	require.Zero(t, prior.ConfidenceScore)
	require.Zero(t, prior.EvidenceCount)
}

func TestServiceRecalculateReturnsPriorWithoutPersistingZeroEvidence(t *testing.T) {
	studentID, knownTopicID, missingTopicID := uuid.New(), uuid.New(), uuid.New()
	calculator := &fakeCalculator{response: CalculateResponse{States: map[string]TopicStatePayload{
		knownTopicID.String(): {
			StudentID: studentID.String(), TopicID: knownTopicID.String(),
			MasteryProbability: 0.76, ConfidenceScore: 0.68, Consistency: 0.8,
			EvidenceCount: 1, EffectiveEvidence: 0.85, MasteryStatus: StatusLearning, Version: 1,
		},
		missingTopicID.String(): {
			StudentID: studentID.String(), TopicID: missingTopicID.String(),
			MasteryProbability: 0.3, ConfidenceScore: 0, Consistency: 1,
			EvidenceCount: 0, EffectiveEvidence: 0, MasteryStatus: StatusUnknown, Version: 1,
		},
	}}}
	store := &fakeStore{}
	svc := &Service{
		store: store, calculator: calculator,
		subjectTopics: func(context.Context, uuid.UUID, string) ([]uuid.UUID, error) {
			return []uuid.UUID{knownTopicID, missingTopicID}, nil
		},
		evidence: func(context.Context, uuid.UUID, string) ([]QuizEvidence, error) {
			return []QuizEvidence{{EvidenceID: "e-1", StudentID: studentID, TopicID: knownTopicID, Score: 1, OccurredAt: time.Now()}}, nil
		},
		currentProfile: func(context.Context, uuid.UUID, string) (Profile, error) {
			return Profile{Topics: map[string]TopicState{}}, nil
		},
	}

	profile, err := svc.RecalculateStudent(context.Background(), studentID, "Toan")

	require.NoError(t, err)
	require.Len(t, profile.Topics, 2)
	require.Equal(t, 0.3, profile.Topics[missingTopicID.String()].MasteryProbability)
	require.Equal(t, StatusUnknown, profile.Topics[missingTopicID.String()].Status)
	require.Len(t, store.states, 1)
	require.Equal(t, knownTopicID, store.states[0].TopicID)
}

func TestServicePublishesMasteryDecisionSummary(t *testing.T) {
	studentID, topicID := uuid.New(), uuid.New()
	publisher := &recordingMasteryPublisher{}
	calculator := &fakeCalculator{response: CalculateResponse{States: map[string]TopicStatePayload{
		topicID.String(): {
			StudentID: studentID.String(), TopicID: topicID.String(), MasteryProbability: 0.82,
			ConfidenceScore: 0.71, Consistency: 0.9, EvidenceCount: 3, EffectiveEvidence: 2.4,
			MasteryStatus: StatusMastered, Version: 1,
		},
	}}}
	store := &fakeStore{}
	svc := &Service{
		store: store, calculator: calculator, publisher: publisher,
		subjectTopics: func(context.Context, uuid.UUID, string) ([]uuid.UUID, error) { return []uuid.UUID{topicID}, nil },
		evidence: func(context.Context, uuid.UUID, string) ([]QuizEvidence, error) {
			return []QuizEvidence{{EvidenceID: "e-1", StudentID: studentID, TopicID: topicID, Score: 1, OccurredAt: time.Now()}}, nil
		},
		currentProfile: func(context.Context, uuid.UUID, string) (Profile, error) {
			return Profile{Topics: map[string]TopicState{topicID.String(): {
				StudentID: studentID, TopicID: topicID, Version: 1, Status: StatusLearning,
			}}}, nil
		},
	}

	_, err := svc.RecalculateStudent(context.Background(), studentID, "Toan")
	require.NoError(t, err)
	require.Len(t, publisher.events, 2)
	require.Equal(t, "mastery_calculated", publisher.events[0].Name)
	require.Equal(t, "mastery_status_changed", publisher.events[1].Name)
	require.NotContains(t, publisher.events[0].Properties, "raw_quiz")
}
