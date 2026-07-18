package learningpath

import (
	"context"
	"testing"
	"time"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestClassifyRecommendationsUsesStrictThresholds(t *testing.T) {
	result := ClassifyRecommendations([]RecommendationState{
		{StudentID: "s1", TopicID: "t1", Mastery: .399, Confidence: .601},
		{StudentID: "s2", TopicID: "t1", Mastery: .40, Confidence: .90},
		{StudentID: "s3", TopicID: "t1", Mastery: .20, Confidence: .60},
	})

	require.Len(t, result.Reliable, 1)
	require.Equal(t, "s1", result.Reliable[0].StudentID)
	require.Len(t, result.InsufficientEvidence, 1)
	require.Equal(t, "s3", result.InsufficientEvidence[0].StudentID)
}

func TestClassifyRecommendationsKeepsTopicsMappedToStudents(t *testing.T) {
	result := ClassifyRecommendations([]RecommendationState{
		{StudentID: "s1", TopicID: "a", Mastery: .10, Confidence: .80},
		{StudentID: "s2", TopicID: "b", Mastery: .20, Confidence: .70},
	})

	require.Equal(t, []string{"a"}, result.TargetsByStudent["s1"])
	require.Equal(t, []string{"b"}, result.TargetsByStudent["s2"])
}

func TestLoadRecommendationStatesUsesCurrentSubjectAndSkipsRootNodes(t *testing.T) {
	db := testutil.OpenPostgres(t)
	require.NoError(t, db.AutoMigrate(&model.Node{}, &model.StudentTopicMastery{}))
	studentID := uuid.New()
	toanTopic := model.Node{ID: uuid.New(), Subject: "Toan", Name: "Phan so"}
	rootTopic := model.Node{ID: uuid.New(), Subject: "Toan", Name: "Root", IsRoot: true}
	vanTopic := model.Node{ID: uuid.New(), Subject: "Van", Name: "Doc hieu"}
	require.NoError(t, db.Create([]model.Node{toanTopic, rootTopic, vanTopic}).Error)
	for _, topic := range []model.Node{toanTopic, rootTopic, vanTopic} {
		require.NoError(t, db.Create(&model.StudentTopicMastery{
			ID: uuid.New(), StudentID: studentID, TopicID: topic.ID,
			MasteryProbability: .2, ConfidenceScore: .8, Consistency: 1,
			EvidenceCount: 4, EffectiveEvidence: 4, MasteryStatus: "confirmed_gap",
			EvidenceSummaryJSON: "{}", SourceBreakdownJSON: "{}", Version: 1,
			CalculatedAt: time.Now().UTC(),
		}).Error)
	}

	states, err := LoadRecommendationStates(context.Background(), db, []string{studentID.String()}, "Toan")
	require.NoError(t, err)
	require.Len(t, states, 1)
	require.Equal(t, toanTopic.ID.String(), states[0].TopicID)
}
