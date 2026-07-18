package mastery

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestClientCalculateMapsPythonStates(t *testing.T) {
	topicID := uuid.New()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/mastery/calculate", r.URL.Path)
		var request CalculateRequest
		require.NoError(t, json.NewDecoder(r.Body).Decode(&request))
		require.Equal(t, "student-1", request.StudentID)
		require.Equal(t, topicID, request.TopicIDs[0])
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(CalculateResponse{
			StudentID:    "student-1",
			CalculatedAt: "2026-07-18T01:00:00Z",
			States: map[string]TopicStatePayload{
				"topic-1": {StudentID: "student-1", TopicID: "topic-1", MasteryProbability: 0.76, ConfidenceScore: 0.68, Consistency: 0.8, EvidenceCount: 4, EffectiveEvidence: 3.2, MasteryStatus: StatusLearning, Version: 1},
			},
		})
	}))
	defer server.Close()

	client := NewClient(server.URL, server.Client())
	result, err := client.Calculate(context.Background(), CalculateRequest{StudentID: "student-1", TopicIDs: []uuid.UUID{topicID}})

	require.NoError(t, err)
	require.InDelta(t, 0.76, result.States["topic-1"].MasteryProbability, 0.0001)
}

func TestClientCalculateRejectsMalformedProbability(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(CalculateResponse{StudentID: "student-1", States: map[string]TopicStatePayload{
			"topic-1": {StudentID: "student-1", TopicID: "topic-1", MasteryProbability: 1.5, MasteryStatus: StatusLearning},
		}})
	}))
	defer server.Close()

	_, err := NewClient(server.URL, server.Client()).Calculate(context.Background(), CalculateRequest{StudentID: "student-1", TopicIDs: []uuid.UUID{uuid.New()}})

	require.ErrorContains(t, err, "mastery_probability")
}

func TestNextVersionsIncrementsExistingStates(t *testing.T) {
	studentID, topicID := uuid.New(), uuid.New()
	versions := nextVersions(map[string]TopicState{topicID.String(): {StudentID: studentID, TopicID: topicID, Version: 4}})
	require.Equal(t, 5, versions[topicID.String()])
}
