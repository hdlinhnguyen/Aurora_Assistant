package syntheticseed

import (
	"context"
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func setupSeedDatabase(t *testing.T) *Service {
	t.Helper()
	db := testutil.OpenPostgres(t)
	require.NoError(t, db.AutoMigrate(
		&model.User{}, &model.ChatSession{}, &model.Message{}, &model.Topic{},
		&model.Node{}, &model.Edge{}, &model.Question{}, &model.QuestionRubricItem{},
		&model.QuestionTopicMapping{}, &model.QuestionRubricItemTopicMapping{},
		&model.QuestionTaggingState{}, &model.StudentState{}, &model.ActivityLog{},
		&model.StudentTopicMastery{}, &model.StudentTopicMasteryHistory{},
		&model.GuardrailEvent{}, &model.LearningPath{},
	))
	return New(db, DefaultConfig())
}

func TestResetAndSeedPreservesRealData(t *testing.T) {
	service := setupSeedDatabase(t)
	realUser := model.User{ID: uuid.New(), Email: "real@example.com", Password: "hash", Name: "Real User", Role: "teacher"}
	realNode := model.Node{ID: uuid.New(), Subject: "Real subject", Name: "Real topic", IsRoot: true}
	require.NoError(t, service.db.Create(&realUser).Error)
	require.NoError(t, service.db.Create(&realNode).Error)

	result, err := service.ResetAndSeed(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Students, 3)
	require.Equal(t, DefaultConfig().Subject, result.Subject)

	var userCount, nodeCount int64
	require.NoError(t, service.db.Model(&model.User{}).Where("id = ?", realUser.ID).Count(&userCount).Error)
	require.NoError(t, service.db.Model(&model.Node{}).Where("id = ?", realNode.ID).Count(&nodeCount).Error)
	require.EqualValues(t, 1, userCount)
	require.EqualValues(t, 1, nodeCount)
}

func TestResetAndSeedIsIdempotentAndCreatesAnswerEvidence(t *testing.T) {
	service := setupSeedDatabase(t)
	first, err := service.ResetAndSeed(context.Background())
	require.NoError(t, err)
	second, err := service.ResetAndSeed(context.Background())
	require.NoError(t, err)
	require.NotEqual(t, first.Teacher.ID, second.Teacher.ID)

	var users, nodes, questions, logs int64
	require.NoError(t, service.db.Model(&model.User{}).Where("email LIKE ?", "synthetic.%@aurora.local").Count(&users).Error)
	require.NoError(t, service.db.Model(&model.Node{}).Where("subject = ?", second.Subject).Count(&nodes).Error)
	require.NoError(t, service.db.Model(&model.Question{}).Where("node_id IN ?", second.NodeIDs).Count(&questions).Error)
	require.NoError(t, service.db.Model(&model.ActivityLog{}).Where("student_id IN ?", studentIDs(second.Students)).Count(&logs).Error)
	require.EqualValues(t, 4, users)
	require.EqualValues(t, 5, nodes)
	require.EqualValues(t, 12, questions)
	require.EqualValues(t, 54, logs)

	for _, student := range second.Students {
		var topicCount int64
		require.NoError(t, service.db.Model(&model.ActivityLog{}).
			Distinct("node_id").Where("student_id = ? AND action IN ?", student.ID, []string{"answer_correct", "answer_incorrect"}).
			Count(&topicCount).Error)
		require.EqualValues(t, 3, topicCount)
	}
}
