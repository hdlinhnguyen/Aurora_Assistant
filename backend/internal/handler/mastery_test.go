package handler

import (
	"context"
	"net/http/httptest"
	"testing"

	"backend/internal/mastery"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type fakeMasteryService struct {
	profile        mastery.Profile
	serviceErr     error
	authorized     error
	requestedID    uuid.UUID
	subject        string
	recalculations int
}

func (f *fakeMasteryService) BuildReviewPath(context.Context, uuid.UUID, string, int) ([]mastery.ReviewItem, error) {
	return []mastery.ReviewItem{}, nil
}

func (f *fakeMasteryService) GetProfile(_ context.Context, studentID uuid.UUID, _ string) (mastery.Profile, error) {
	f.requestedID = studentID
	return f.profile, f.serviceErr
}

func (f *fakeMasteryService) GetHistory(context.Context, uuid.UUID, uuid.UUID, string) ([]mastery.HistoryPoint, error) {
	return nil, f.serviceErr
}

func (f *fakeMasteryService) RecalculateStudent(_ context.Context, studentID uuid.UUID, subject string) (mastery.Profile, error) {
	f.requestedID = studentID
	f.subject = subject
	f.recalculations++
	return f.profile, f.serviceErr
}

func (f *fakeMasteryService) CanTeacherView(context.Context, uuid.UUID, uuid.UUID) error {
	return f.authorized
}

func TestMasteryHandlerStudentProfileUsesAuthenticatedUserID(t *testing.T) {
	studentID := uuid.New()
	service := &fakeMasteryService{}
	h := NewMasteryHandler(service)
	app := fiber.New()
	app.Get("/student/mastery", func(c fiber.Ctx) error {
		c.Locals("userID", studentID.String())
		return h.GetStudentProfile(c)
	})

	response, err := app.Test(httptest.NewRequest("GET", "/student/mastery?subject=Toan%20dai%20so", nil))

	require.NoError(t, err)
	require.Equal(t, fiber.StatusOK, response.StatusCode)
	require.Equal(t, studentID, service.requestedID)
}

func TestMasteryHandlerLetsStudentRecoverPersistedDiagnosticEvidence(t *testing.T) {
	studentID := uuid.New()
	service := &fakeMasteryService{}
	h := NewMasteryHandler(service)
	app := fiber.New()
	app.Post("/student/mastery/recalculate", func(c fiber.Ctx) error {
		c.Locals("userID", studentID.String())
		return h.RecalculateStudentProfile(c)
	})

	response, err := app.Test(httptest.NewRequest(
		"POST",
		"/student/mastery/recalculate?subject=Logic%20%26%20Tap%20hop",
		nil,
	))

	require.NoError(t, err)
	require.Equal(t, fiber.StatusOK, response.StatusCode)
	require.Equal(t, studentID, service.requestedID)
	require.Equal(t, "Logic & Tap hop", service.subject)
	require.Equal(t, 1, service.recalculations)
}

func TestMasteryHandlerTeacherReturnsForbiddenWhenOutOfScope(t *testing.T) {
	service := &fakeMasteryService{authorized: mastery.ErrForbidden}
	h := NewMasteryHandler(service)
	app := fiber.New()
	app.Get("/teacher/students/:studentId/mastery", func(c fiber.Ctx) error {
		c.Locals("userID", uuid.New().String())
		return h.GetTeacherProfile(c)
	})

	response, err := app.Test(httptest.NewRequest("GET", "/teacher/students/"+uuid.NewString()+"/mastery?subject=Toan", nil))

	require.NoError(t, err)
	require.Equal(t, fiber.StatusForbidden, response.StatusCode)
}

func TestMasteryHandlerRejectsInvalidHistoryRange(t *testing.T) {
	h := NewMasteryHandler(&fakeMasteryService{})
	app := fiber.New()
	app.Get("/student/mastery/:topicId/history", func(c fiber.Ctx) error {
		c.Locals("userID", uuid.New().String())
		return h.GetStudentHistory(c)
	})

	response, err := app.Test(httptest.NewRequest("GET", "/student/mastery/"+uuid.NewString()+"/history?range=bad", nil))

	require.NoError(t, err)
	require.Equal(t, fiber.StatusBadRequest, response.StatusCode)
}
