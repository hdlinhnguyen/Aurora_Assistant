package service

import (
	"context"
	"testing"

	"backend/internal/model"
	"backend/internal/telemetry"
	"backend/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type recordingActorPublisher struct {
	events []telemetry.Event
}

func (p *recordingActorPublisher) PublishActor(_ context.Context, actorID uuid.UUID, role string, event telemetry.Event) (telemetry.PublishResult, error) {
	event.ActorID = actorID.String()
	event.ActorRole = role
	p.events = append(p.events, event)
	return telemetry.PublishResult{}, nil
}

func (p *recordingActorPublisher) Publish(context.Context, telemetry.Event) (telemetry.PublishResult, error) {
	panic("tutor service should use PublishActor")
}

func setupTutorTelemetryDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := testutil.OpenPostgres(t)
	require.NoError(t, db.AutoMigrate(
		&model.User{}, &model.Node{}, &model.Edge{}, &model.Question{}, &model.StudentState{},
		&model.ActivityLog{}, &model.TelemetryEvent{}, &model.TelemetryOutbox{},
	))
	return db
}

func TestSubmitAnswerPublishesSubmissionAndGradeWithoutQuestionContent(t *testing.T) {
	db := setupTutorTelemetryDB(t)
	publisher := &recordingActorPublisher{}
	svc := NewTutorService(db, nil, WithTelemetryPublisher(publisher))
	studentID := uuid.New()
	nodeID := uuid.New()
	questionID := uuid.New()
	require.NoError(t, db.Create(&model.User{ID: studentID, Email: "telemetry-student@example.test", Password: "test", Role: "student"}).Error)
	require.NoError(t, db.Create(&model.Node{ID: nodeID, Subject: "Toan", Name: "Fractions", Status: "active"}).Error)
	require.NoError(t, db.Create(&model.Question{ID: questionID, NodeID: nodeID, Content: "secret question text", OptionsJSON: `["A","B"]`, CorrectOption: 0, Difficulty: "easy"}).Error)
	require.NoError(t, db.Create(&model.StudentState{
		ID: uuid.New(), StudentID: studentID, Subject: "Toan",
		InitialLevelNodeID: nodeID, CurrentLevelNodeID: nodeID,
	}).Error)

	correct, _, err := svc.SubmitAnswer(studentID, nodeID, questionID, 0)
	require.NoError(t, err)
	require.True(t, correct)
	require.Len(t, publisher.events, 2)
	require.Equal(t, "question_answer_submitted", publisher.events[0].Name)
	require.Equal(t, "question_graded", publisher.events[1].Name)
	for _, event := range publisher.events {
		_, leaked := event.Properties["content"]
		require.False(t, leaked)
	}
}
