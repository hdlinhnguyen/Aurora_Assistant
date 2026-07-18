package handler

import (
	"context"
	"testing"

	"backend/internal/learningpath"
	"backend/internal/model"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type recordingProgressUpdater struct {
	inputs []learningpath.ApplyEvidenceInput
}

type recordingProgressInitializer struct {
	pathID uuid.UUID
}

func (i *recordingProgressInitializer) Initialize(_ context.Context, path *model.LearningPath) error {
	i.pathID = path.ID
	return nil
}

func (u *recordingProgressUpdater) ApplyEvidence(_ context.Context, input learningpath.ApplyEvidenceInput) (learningpath.ProgressStepView, error) {
	u.inputs = append(u.inputs, input)
	return learningpath.ProgressStepView{}, nil
}

func TestRecordLearningPathEvidenceUsesStudentTopicAndKind(t *testing.T) {
	updater := &recordingProgressUpdater{}
	handler := NewTutorHandler(nil, WithLearningPathProgress(updater))
	studentID, topicID := uuid.New(), uuid.New()

	handler.recordLearningPathEvidence(studentID, topicID, learningpath.EvidenceAnswer, true)

	require.Len(t, updater.inputs, 1)
	require.Equal(t, studentID, updater.inputs[0].StudentID)
	require.Equal(t, topicID, updater.inputs[0].TopicID)
	require.Equal(t, learningpath.EvidenceAnswer, updater.inputs[0].Kind)
	require.True(t, updater.inputs[0].Correct)
}

func TestInitializeApprovedLearningPathDelegatesToProgressService(t *testing.T) {
	initializer := &recordingProgressInitializer{}
	handler := NewTutorHandler(nil, WithLearningPathProgressInitializer(initializer))
	path := &model.LearningPath{ID: uuid.New()}

	require.NoError(t, handler.initializeApprovedLearningPath(path))
	require.Equal(t, path.ID, initializer.pathID)
}
