package handler

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"backend/internal/service"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type capturingTaggingService struct {
	actorID uuid.UUID
}

func (s *capturingTaggingService) GetContext(uuid.UUID) (*service.TaggingContext, error) {
	return &service.TaggingContext{}, nil
}

func (s *capturingTaggingService) GetEffectiveTopics(uuid.UUID) (*service.EffectiveQuestionTopics, error) {
	return &service.EffectiveQuestionTopics{}, nil
}

func (s *capturingTaggingService) SetQuestionTopics(
	_ uuid.UUID,
	_ []uuid.UUID,
	_ int,
	actorID uuid.UUID,
) (*service.TaggingContext, error) {
	s.actorID = actorID
	return &service.TaggingContext{Version: 2}, nil
}

func (s *capturingTaggingService) SetRubricItemTopics(
	_ uuid.UUID,
	_ uuid.UUID,
	_ []uuid.UUID,
	_ int,
	_ uuid.UUID,
) (*service.TaggingContext, error) {
	return &service.TaggingContext{}, nil
}

func TestTaggingHandlerRejectsStudentRole(t *testing.T) {
	app := fiber.New()
	taggingHandler := NewTaggingHandler(nil)
	app.Get("/questions/:questionId/tagging-context", func(c fiber.Ctx) error {
		c.Locals("user", jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":  "11111111-1111-1111-1111-111111111111",
			"role": "student",
		}))
		c.Locals("userID", "11111111-1111-1111-1111-111111111111")
		return c.Next()
	}, taggingHandler.GetContext)

	request := httptest.NewRequest(
		http.MethodGet,
		"/questions/22222222-2222-2222-2222-222222222222/tagging-context",
		nil,
	)
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusForbidden)
	}
}

func TestTaggingHandlerUsesAuthenticatedTeacherAsActor(t *testing.T) {
	app := fiber.New()
	capture := &capturingTaggingService{}
	taggingHandler := NewTaggingHandler(capture)
	teacherID := uuid.New()
	questionID := uuid.New()
	app.Put("/questions/:questionId/topics", func(c fiber.Ctx) error {
		c.Locals("user", jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":  teacherID.String(),
			"role": "teacher",
		}))
		c.Locals("userID", teacherID.String())
		return c.Next()
	}, taggingHandler.SetQuestionTopics)

	request := httptest.NewRequest(
		http.MethodPut,
		"/questions/"+questionID.String()+"/topics",
		strings.NewReader(`{"topicIds":[],"expectedVersion":1}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("status = %d, want 200: %s", response.StatusCode, body)
	}
	if capture.actorID != teacherID {
		t.Fatalf("actor = %s, want JWT teacher %s", capture.actorID, teacherID)
	}
}
