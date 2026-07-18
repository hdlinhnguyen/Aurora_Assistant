package adminmetrics

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"backend/internal/model"
	"backend/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

var dashboardNow = time.Date(2026, 7, 18, 0, 0, 0, 0, time.UTC)

func dashboardDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := testutil.OpenPostgres(t)
	require.NoError(t, db.AutoMigrate(&model.TelemetryEvent{}, &model.QuestionAttemptFact{}, &model.Node{}))
	return db
}

func insertEvent(t *testing.T, db *gorm.DB, name string, at time.Time, source string, properties map[string]any) {
	t.Helper()
	encoded, err := json.Marshal(properties)
	require.NoError(t, err)
	require.NoError(t, db.Create(&model.TelemetryEvent{
		EventID:        uuid.NewString(),
		EventName:      name,
		SchemaVersion:  1,
		OccurredAt:     at,
		ReceivedAt:     at,
		ActorID:        "actor-secret",
		ActorRole:      "student",
		Source:         source,
		ConsentState:   "required",
		RetentionClass: "interaction",
		PropertiesJSON: encoded,
	}).Error)
}

func insertFact(t *testing.T, db *gorm.DB, fact model.QuestionAttemptFact) {
	t.Helper()
	if fact.AttemptID == "" {
		fact.AttemptID = uuid.NewString()
	}
	if fact.QuestionID == "" {
		fact.QuestionID = uuid.NewString()
	}
	if fact.ActorID == "" {
		fact.ActorID = "fact-actor-secret"
	}
	if fact.QualityFlagsJSON == nil {
		fact.QualityFlagsJSON = []byte("[]")
	}
	require.NoError(t, db.Create(&fact).Error)
}

func TestDashboardAggregatesCurrentAndPreviousWindows(t *testing.T) {
	db := dashboardDB(t)
	currentPresented := dashboardNow.Add(-2 * time.Hour)
	currentSubmitted := currentPresented.Add(2 * time.Minute)
	abandonedPresented := dashboardNow.Add(-time.Hour)
	previousPresented := dashboardNow.Add(-40 * 24 * time.Hour)
	previousSubmitted := previousPresented.Add(time.Minute)
	session1, session2, session3 := uuid.NewString(), uuid.NewString(), uuid.NewString()

	insertFact(t, db, model.QuestionAttemptFact{SessionID: &session1, PresentedAt: &currentPresented, SubmittedAt: &currentSubmitted, ActiveTimeMS: 120_000, HintCount: 1, IsCorrect: boolValue(true), TopicID: uuid.NewString(), UpdatedAt: currentSubmitted})
	insertFact(t, db, model.QuestionAttemptFact{SessionID: &session2, PresentedAt: &abandonedPresented, ActiveTimeMS: 300_000, HintCount: 2, Abandoned: true, TopicID: uuid.NewString(), UpdatedAt: abandonedPresented})
	insertFact(t, db, model.QuestionAttemptFact{SessionID: &session3, PresentedAt: &previousPresented, SubmittedAt: &previousSubmitted, ActiveTimeMS: 60_000, IsCorrect: boolValue(false), TopicID: uuid.NewString(), UpdatedAt: previousSubmitted})

	insertEvent(t, db, "api_request_completed", dashboardNow.Add(-90*time.Minute), "frontend", map[string]any{"status_class": "2xx", "duration_ms": 100, "endpoint": "/ok"})
	insertEvent(t, db, "api_request_completed", dashboardNow.Add(-80*time.Minute), "frontend", map[string]any{"status_class": "5xx", "duration_ms": 300, "endpoint": "/fail"})
	insertEvent(t, db, "mastery_status_changed", dashboardNow.Add(-70*time.Minute), "learning_path", map[string]any{"status_before": "learning", "status_after": "mastered"})
	insertEvent(t, db, "api_request_completed", dashboardNow.Add(-40*24*time.Hour), "frontend", map[string]any{"status_class": "2xx", "duration_ms": 50, "endpoint": "/old"})

	result, err := NewService(db).Dashboard(context.Background(), dashboardNow, Range30d)
	require.NoError(t, err)
	require.True(t, result.HasData)
	require.InDelta(t, 7.0, result.Summary.ActiveLearningMinutes, 0.001)
	require.Equal(t, int64(2), result.Summary.Sessions)
	require.Equal(t, int64(1), result.Summary.QuestionsAnswered)
	require.InDelta(t, 1.0, *result.Summary.AccuracyRate, 0.001)
	require.InDelta(t, 120.0, *result.Summary.AvgSolveTimeSeconds, 0.001)
	require.InDelta(t, 1.5, *result.Summary.HintsPerQuestion, 0.001)
	require.InDelta(t, 0.5, *result.Summary.CompletionRate, 0.001)
	require.InDelta(t, 0.5, *result.Summary.AbandonmentRate, 0.001)
	require.Equal(t, int64(1), result.Summary.MasteryTransitions)
	require.Equal(t, int64(2), result.Summary.APIRequests)
	require.InDelta(t, 0.5, *result.Summary.APIErrorRate, 0.001)
	require.InDelta(t, 290.0, *result.Summary.APIP95LatencyMS, 0.001)
	require.Len(t, result.Trends, 30)
	require.Equal(t, dashboardNow, result.GeneratedAt)
}

func TestDashboardReturnsNullRatesAndEmptyEDAWithoutData(t *testing.T) {
	db := dashboardDB(t)
	result, err := NewService(db).Dashboard(context.Background(), dashboardNow, Range7d)
	require.NoError(t, err)
	require.False(t, result.HasData)
	require.Nil(t, result.Summary.AccuracyRate)
	require.Nil(t, result.Summary.AvgSolveTimeSeconds)
	require.Nil(t, result.Summary.APIErrorRate)
	require.Empty(t, result.Trends)
	require.Empty(t, result.EDA.TopicBreakdown)
	require.Empty(t, result.EDA.SourceBreakdown)
}

func TestDashboardBuildsQualityFlagsDistributionsAndBreakdowns(t *testing.T) {
	db := dashboardDB(t)
	topicID := uuid.New()
	require.NoError(t, db.Create(&model.Node{ID: topicID, Subject: "Toán", Name: "Phân số"}).Error)
	presented := dashboardNow.Add(-3 * time.Hour)
	submitted := presented.Add(301 * time.Second)
	missingGradeSubmitted := dashboardNow.Add(-2 * time.Hour)
	missingPresentedSubmitted := dashboardNow.Add(-time.Hour)

	insertFact(t, db, model.QuestionAttemptFact{PresentedAt: &presented, SubmittedAt: &submitted, ActiveTimeMS: 301_000, HintCount: 3, IsCorrect: boolValue(true), TopicID: topicID.String(), QualityFlagsJSON: []byte(`["clock_skew"]`), UpdatedAt: submitted})
	insertFact(t, db, model.QuestionAttemptFact{PresentedAt: &presented, SubmittedAt: &missingGradeSubmitted, ActiveTimeMS: 30_000, HintCount: 1, TopicID: topicID.String(), QualityFlagsJSON: []byte(`["clock_skew"]`), UpdatedAt: missingGradeSubmitted})
	insertFact(t, db, model.QuestionAttemptFact{SubmittedAt: &missingPresentedSubmitted, ActiveTimeMS: 10_000, HintCount: 0, IsCorrect: boolValue(false), TopicID: topicID.String(), UpdatedAt: missingPresentedSubmitted})
	insertFact(t, db, model.QuestionAttemptFact{TopicID: topicID.String(), UpdatedAt: dashboardNow.Add(-30 * time.Minute)})

	insertEvent(t, db, "api_request_completed", dashboardNow.Add(-time.Hour), "frontend", map[string]any{"status_class": "2xx", "duration_ms": -1})
	insertEvent(t, db, "api_request_completed", dashboardNow.Add(-time.Hour), "go_backend", map[string]any{"status_class": "2xx", "duration_ms": "bad"})
	insertEvent(t, db, "mastery_status_changed", dashboardNow.Add(-time.Hour), "learning_path", map[string]any{"status_before": "learning", "status_after": "mastered"})

	result, err := NewService(db).Dashboard(context.Background(), dashboardNow, Range7d)
	require.NoError(t, err)
	require.Equal(t, int64(1), result.EDA.MissingPresented)
	require.Equal(t, int64(1), result.EDA.MissingGrade)
	require.Equal(t, int64(2), result.EDA.InvalidDuration)
	require.Equal(t, int64(1), result.EDA.OutlierAttemptCount)
	require.InDelta(t, 300.0, result.EDA.OutlierThresholdSeconds, 0.001)
	require.NotNil(t, result.EDA.P50SolveTimeSeconds)
	require.NotNil(t, result.EDA.P95SolveTimeSeconds)
	require.Contains(t, result.EDA.SolveTimeDistribution, DistributionPoint{Bucket: "300s+", Count: 1})
	require.Contains(t, result.EDA.HintDistribution, DistributionPoint{Bucket: "3+", Count: 1})
	require.Equal(t, "Phân số", result.EDA.TopicBreakdown[0].TopicName)
	require.Contains(t, result.EDA.SourceBreakdown, SourceMetric{Source: "frontend", Events: 1})
	require.Contains(t, result.EDA.MasteryTransitionBreakdown, MasteryTransitionMetric{From: "learning", To: "mastered", Count: 1})
	require.Contains(t, result.EDA.QualityFlags, QualityFlag{Flag: "clock_skew", Count: 2})
	require.Contains(t, result.EDA.QualityFlags, QualityFlag{Flag: "missing_timestamp", Count: 1})
}

func TestDashboardDoesNotLeakIdentifiersOrProperties(t *testing.T) {
	db := dashboardDB(t)
	presented, submitted := dashboardNow.Add(-time.Hour), dashboardNow.Add(-59*time.Minute)
	sessionID, attemptID := uuid.NewString(), uuid.NewString()
	insertFact(t, db, model.QuestionAttemptFact{AttemptID: attemptID, SessionID: &sessionID, ActorID: "fact-actor-secret", PresentedAt: &presented, SubmittedAt: &submitted, ActiveTimeMS: 60_000, IsCorrect: boolValue(true), TopicID: uuid.NewString(), UpdatedAt: submitted})
	insertEvent(t, db, "api_request_completed", presented, "frontend", map[string]any{"status_class": "2xx", "duration_ms": 25, "private_marker": "raw-property-secret"})

	result, err := NewService(db).Dashboard(context.Background(), dashboardNow, Range7d)
	require.NoError(t, err)
	encoded, err := json.Marshal(result)
	require.NoError(t, err)
	for _, forbidden := range []string{"fact-actor-secret", "actor-secret", sessionID, attemptID, "raw-property-secret", "properties"} {
		require.NotContains(t, string(encoded), forbidden)
	}
}

func boolValue(value bool) *bool { return &value }
