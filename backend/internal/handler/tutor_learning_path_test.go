package handler

import (
	"fmt"
	"net/http/httptest"
	"testing"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestTutorLearningPathUsesConfiguredURL(t *testing.T) {
	tests := []struct {
		name   string
		suffix string
	}{
		{name: "base URL"},
		{name: "base URL with trailing slash", suffix: "/"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(nil)
			defer server.Close()

			handler := NewTutorHandler(nil, WithLearningPathURL(server.URL+test.suffix))
			require.Equal(t, server.URL, handler.learningPathURL)
		})
	}
}

func TestBuildRawQuizFromLogsPreservesQuestionAndAttemptIdentity(t *testing.T) {
	studentID := uuid.New()
	nodeID := uuid.New()
	questionID := uuid.New()
	now := time.Now().UTC()
	logs := []model.ActivityLog{
		{ID: uuid.New(), StudentID: studentID, NodeID: nodeID, Action: "answer_incorrect", Detail: fmt.Sprintf("[question_id=%s] [difficulty=hard] [inference_weight=0.35] first", questionID), CreatedAt: now},
		{ID: uuid.New(), StudentID: studentID, NodeID: nodeID, Action: "answer_correct", Detail: fmt.Sprintf("[question_id=%s] [difficulty=hard] retry", questionID), CreatedAt: now.Add(time.Minute)},
	}

	evidence := buildRawQuizFromLogs(logs)
	if len(evidence) != 2 {
		t.Fatalf("evidence length = %d, want 2", len(evidence))
	}
	if evidence[0].QuestionID != questionID.String() || evidence[1].QuestionID != questionID.String() {
		t.Fatalf("question IDs were not preserved: %#v", evidence)
	}
	if evidence[0].AttemptNumber != 1 || evidence[1].AttemptNumber != 2 {
		t.Fatalf("attempt numbers = %d, %d; want 1, 2", evidence[0].AttemptNumber, evidence[1].AttemptNumber)
	}
	if evidence[0].InferenceWeight != 0.35 || evidence[1].InferenceWeight != 1 {
		t.Fatalf("inference weights = %v, %v; want 0.35, 1", evidence[0].InferenceWeight, evidence[1].InferenceWeight)
	}
	if evidence[0].Difficulty != "hard" || evidence[1].Difficulty != "hard" {
		t.Fatalf("difficulties = %q, %q; want hard, hard", evidence[0].Difficulty, evidence[1].Difficulty)
	}
}
