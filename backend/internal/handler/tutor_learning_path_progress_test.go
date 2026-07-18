package handler

import (
	"context"
	"testing"

	"backend/internal/learningpath"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type recordingProgressUpdater struct {
	inputs []learningpath.ApplyEvidenceInput
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
