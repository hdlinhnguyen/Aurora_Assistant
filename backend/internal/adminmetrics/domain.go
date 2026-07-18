package adminmetrics

import (
	"errors"
	"math"
	"time"
)

const day = 24 * time.Hour

var ErrInvalidRange = errors.New("invalid telemetry range")

type Range string

const (
	Range7d  Range = "7d"
	Range30d Range = "30d"
	Range90d Range = "90d"
)

func ParseRange(value string) (Range, error) {
	switch Range(value) {
	case Range7d, Range30d, Range90d:
		return Range(value), nil
	default:
		return "", ErrInvalidRange
	}
}

func (r Range) Duration() time.Duration {
	switch r {
	case Range7d:
		return 7 * day
	case Range90d:
		return 90 * day
	default:
		return 30 * day
	}
}

type Summary struct {
	ActiveLearningMinutes float64  `json:"activeLearningMinutes"`
	Sessions              int64    `json:"sessions"`
	QuestionsAnswered     int64    `json:"questionsAnswered"`
	AccuracyRate          *float64 `json:"accuracyRate"`
	AvgSolveTimeSeconds   *float64 `json:"avgSolveTimeSeconds"`
	HintsPerQuestion      *float64 `json:"hintsPerQuestion"`
	CompletionRate        *float64 `json:"completionRate"`
	AbandonmentRate       *float64 `json:"abandonmentRate"`
	MasteryTransitions    int64    `json:"masteryTransitions"`
	APIRequests           int64    `json:"apiRequests"`
	APIErrorRate          *float64 `json:"apiErrorRate"`
	APIP95LatencyMS       *float64 `json:"apiP95LatencyMs"`
}

type ComparisonValue struct {
	Current      *float64 `json:"current"`
	Previous     *float64 `json:"previous"`
	DeltaPercent *float64 `json:"deltaPercent"`
}

type TrendPoint struct {
	Date                  string   `json:"date"`
	ActiveLearningMinutes float64  `json:"activeLearningMinutes"`
	Sessions              int64    `json:"sessions"`
	QuestionsAnswered     int64    `json:"questionsAnswered"`
	AccuracyRate          *float64 `json:"accuracyRate"`
	AvgSolveTimeSeconds   *float64 `json:"avgSolveTimeSeconds"`
	HintsPerQuestion      *float64 `json:"hintsPerQuestion"`
	CompletionRate        *float64 `json:"completionRate"`
	AbandonmentRate       *float64 `json:"abandonmentRate"`
	MasteryTransitions    int64    `json:"masteryTransitions"`
	APIRequests           int64    `json:"apiRequests"`
	APIErrorRate          *float64 `json:"apiErrorRate"`
	APIP95LatencyMS       *float64 `json:"apiP95LatencyMs"`
}

type DistributionPoint struct {
	Bucket string `json:"bucket"`
	Count  int64  `json:"count"`
}

type TopicMetric struct {
	TopicID             string   `json:"topicId"`
	TopicName           string   `json:"topicName"`
	Attempts            int64    `json:"attempts"`
	AccuracyRate        *float64 `json:"accuracyRate"`
	AvgSolveTimeSeconds *float64 `json:"avgSolveTimeSeconds"`
	HintsPerQuestion    *float64 `json:"hintsPerQuestion"`
}

type SourceMetric struct {
	Source string `json:"source"`
	Events int64  `json:"events"`
}

type MasteryTransitionMetric struct {
	From  string `json:"from"`
	To    string `json:"to"`
	Count int64  `json:"count"`
}

type QualityFlag struct {
	Flag  string `json:"flag"`
	Count int64  `json:"count"`
}

type EDA struct {
	MissingPresented           int64                     `json:"missingPresented"`
	MissingGrade               int64                     `json:"missingGrade"`
	InvalidDuration            int64                     `json:"invalidDuration"`
	OutlierAttemptCount        int64                     `json:"outlierAttemptCount"`
	OutlierThresholdSeconds    float64                   `json:"outlierThresholdSeconds"`
	P50SolveTimeSeconds        *float64                  `json:"p50SolveTimeSeconds"`
	P95SolveTimeSeconds        *float64                  `json:"p95SolveTimeSeconds"`
	SolveTimeDistribution      []DistributionPoint       `json:"solveTimeDistribution"`
	HintDistribution           []DistributionPoint       `json:"hintDistribution"`
	TopicBreakdown             []TopicMetric             `json:"topicBreakdown"`
	SourceBreakdown            []SourceMetric            `json:"sourceBreakdown"`
	MasteryTransitionBreakdown []MasteryTransitionMetric `json:"masteryTransitionBreakdown"`
	QualityFlags               []QualityFlag             `json:"qualityFlags"`
}

type Dashboard struct {
	Range       Range                      `json:"range"`
	GeneratedAt time.Time                  `json:"generatedAt"`
	HasData     bool                       `json:"hasData"`
	Summary     Summary                    `json:"summary"`
	Comparison  map[string]ComparisonValue `json:"comparison"`
	Trends      []TrendPoint               `json:"trends"`
	EDA         EDA                        `json:"eda"`
}

func percentDelta(current, previous *float64) *float64 {
	if current == nil || previous == nil || *previous == 0 {
		return nil
	}
	value := (*current - *previous) / math.Abs(*previous) * 100
	return &value
}
