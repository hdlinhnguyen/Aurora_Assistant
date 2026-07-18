package handler

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"backend/internal/learningpath"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeLearningPathProgressService struct {
	view      learningpath.LearningPathProgressView
	err       error
	studentID uuid.UUID
	topicID   uuid.UUID
	teacherID uuid.UUID
	classID   uuid.UUID
}

func (f *fakeLearningPathProgressService) StartStep(_ context.Context, studentID, topicID uuid.UUID) (learningpath.ProgressStepView, error) {
	f.studentID, f.topicID = studentID, topicID
	return learningpath.ProgressStepView{TopicID: topicID, Status: learningpath.StatusInProgress}, f.err
}

func (f *fakeLearningPathProgressService) GetTeacherProgress(_ context.Context, teacherID, classID, studentID uuid.UUID) (learningpath.LearningPathProgressView, error) {
	f.teacherID, f.classID, f.studentID = teacherID, classID, studentID
	return f.view, f.err
}

func TestStartLearningPathStepUsesAuthenticatedStudent(t *testing.T) {
	studentID, topicID := uuid.New(), uuid.New()
	svc := &fakeLearningPathProgressService{}
	handler := NewLearningPathProgressHandler(svc)
	app := fiber.New()
	app.Post("/student/learning-path/steps/:topicId/start", func(c fiber.Ctx) error {
		c.Locals("userID", studentID.String())
		return handler.StartStep(c)
	})

	response, err := app.Test(httptest.NewRequest("POST", "/student/learning-path/steps/"+topicID.String()+"/start", nil))
	require.NoError(t, err)
	require.Equal(t, 200, response.StatusCode)
	require.Equal(t, studentID, svc.studentID)
	require.Equal(t, topicID, svc.topicID)
}

func TestStartLearningPathStepMapsPrerequisiteConflict(t *testing.T) {
	svc := &fakeLearningPathProgressService{err: learningpath.ErrPrerequisiteIncomplete}
	handler := NewLearningPathProgressHandler(svc)
	app := fiber.New()
	app.Post("/student/learning-path/steps/:topicId/start", func(c fiber.Ctx) error {
		c.Locals("userID", uuid.NewString())
		return handler.StartStep(c)
	})

	response, err := app.Test(httptest.NewRequest("POST", "/student/learning-path/steps/"+uuid.NewString()+"/start", nil))
	require.NoError(t, err)
	require.Equal(t, 409, response.StatusCode)
}

func TestGetStudentLearningPathPreservesOrderedStepsAndAddsProgress(t *testing.T) {
	topicID := uuid.New()
	reader := &fakeStudentProgressReader{view: learningpath.LearningPathProgressView{
		ID: uuid.New(), OrderedSteps: []map[string]any{{"order": 1, "topic_id": topicID.String()}},
		TotalSteps: 1, CompletionPercent: 0,
	}}
	handler := NewTutorHandler(nil, WithLearningPathProgressReader(reader))
	app := fiber.New()
	app.Get("/student/learning-path", func(c fiber.Ctx) error {
		c.Locals("userID", uuid.NewString())
		return handler.GetStudentLearningPath(c)
	})

	response, err := app.Test(httptest.NewRequest("GET", "/student/learning-path", nil))
	require.NoError(t, err)
	require.Equal(t, 200, response.StatusCode)
	var body map[string]any
	require.NoError(t, json.NewDecoder(response.Body).Decode(&body))
	require.Len(t, body["ordered_steps"], 1)
	require.NotNil(t, body["progress"])
}

type fakeStudentProgressReader struct {
	view learningpath.LearningPathProgressView
	err  error
}

func (f *fakeStudentProgressReader) GetStudentProgress(context.Context, uuid.UUID) (learningpath.LearningPathProgressView, error) {
	return f.view, f.err
}
