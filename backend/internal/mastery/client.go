package mastery

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

type QuizEvidence struct {
	EvidenceID      string    `json:"evidence_id"`
	StudentID       uuid.UUID `json:"student_id"`
	SessionID       string    `json:"session_id"`
	QuestionID      string    `json:"question_id"`
	TopicID         uuid.UUID `json:"topic_id"`
	Score           float64   `json:"score"`
	AttemptNumber   int       `json:"attempt_number"`
	HintsUsed       int       `json:"hints_used"`
	GradingMethod   string    `json:"grading_method"`
	OccurredAt      time.Time `json:"occurred_at"`
	InferenceWeight float64   `json:"inference_weight,omitempty"`
	Difficulty      string    `json:"difficulty,omitempty"`
}

type CalculateRequest struct {
	StudentID string         `json:"student_id"`
	TopicIDs  []uuid.UUID    `json:"topic_ids"`
	RawQuiz   []QuizEvidence `json:"raw_quiz"`
	RawPaper  []any          `json:"raw_paper"`
	AsOf      time.Time      `json:"as_of"`
}

type TopicStatePayload struct {
	StudentID          string             `json:"student_id"`
	TopicID            string             `json:"topic_id"`
	MasteryProbability float64            `json:"mastery_probability"`
	ConfidenceScore    float64            `json:"confidence_score"`
	Consistency        float64            `json:"consistency"`
	EvidenceCount      int                `json:"evidence_count"`
	EffectiveEvidence  float64            `json:"effective_evidence"`
	LastEvidenceAt     *time.Time         `json:"last_evidence_at"`
	MasteryStatus      string             `json:"mastery_status"`
	EvidenceSummary    map[string]float64 `json:"evidence_summary"`
	SourceBreakdown    map[string]int     `json:"source_breakdown"`
	Version            int                `json:"version"`
}

type CalculateResponse struct {
	StudentID    string                       `json:"student_id"`
	CalculatedAt string                       `json:"calculated_at"`
	States       map[string]TopicStatePayload `json:"states"`
}

type Calculator interface {
	Calculate(context.Context, CalculateRequest) (CalculateResponse, error)
}

type Client struct {
	baseURL    string
	httpClient *http.Client
}

func NewClient(baseURL string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 10 * time.Second}
	}
	return &Client{baseURL: strings.TrimRight(baseURL, "/"), httpClient: httpClient}
}

func (c *Client) Calculate(ctx context.Context, request CalculateRequest) (CalculateResponse, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return CalculateResponse{}, fmt.Errorf("marshal mastery request: %w", err)
	}
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/mastery/calculate", bytes.NewReader(body))
	if err != nil {
		return CalculateResponse{}, fmt.Errorf("create mastery request: %w", err)
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	response, err := c.httpClient.Do(httpRequest)
	if err != nil {
		return CalculateResponse{}, fmt.Errorf("mastery service unavailable: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return CalculateResponse{}, fmt.Errorf("mastery service returned HTTP %d", response.StatusCode)
	}
	var result CalculateResponse
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		return CalculateResponse{}, fmt.Errorf("decode mastery response: %w", err)
	}
	if result.States == nil {
		result.States = map[string]TopicStatePayload{}
	}
	for key, payload := range result.States {
		if payload.MasteryProbability < 0 || payload.MasteryProbability > 1 {
			return CalculateResponse{}, fmt.Errorf("mastery_probability for %s must be between 0 and 1", key)
		}
		if payload.ConfidenceScore < 0 || payload.ConfidenceScore > 1 {
			return CalculateResponse{}, fmt.Errorf("confidence_score for %s must be between 0 and 1", key)
		}
		if payload.Version < 1 {
			return CalculateResponse{}, fmt.Errorf("version for %s must be positive", key)
		}
	}
	return result, nil
}
