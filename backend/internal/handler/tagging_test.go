package handler

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"backend/internal/model"
	"backend/internal/service"
	"backend/internal/testutil"

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

func TestTaggingHandlerUsesJWTSubjectInsteadOfUserIDLocal(t *testing.T) {
	app := fiber.New()
	capture := &capturingTaggingService{}
	taggingHandler := NewTaggingHandler(capture)
	teacherID := uuid.New()
	differentLocalID := uuid.New()
	questionID := uuid.New()
	app.Put("/questions/:questionId/topics", func(c fiber.Ctx) error {
		c.Locals("user", jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":  teacherID.String(),
			"role": "teacher",
		}))
		c.Locals("userID", differentLocalID.String())
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
		t.Fatalf("actor = %s, want JWT sub %s", capture.actorID, teacherID)
	}
}

func TestTaggingHandlerPersistsAuthenticatedTeacherAsMappingCreator(t *testing.T) {
	db := testutil.OpenPostgres(t)
	if err := db.AutoMigrate(
		&model.User{},
		&model.Node{},
		&model.Question{},
		&model.QuestionRubricItem{},
		&model.QuestionTopicMapping{},
		&model.QuestionRubricItemTopicMapping{},
		&model.QuestionTaggingState{},
	); err != nil {
		t.Fatal(err)
	}
	teacher := model.User{
		ID: uuid.New(), Email: uuid.NewString() + "@example.test",
		Password: "test-only", Name: "Teacher", Role: "teacher",
	}
	sourceNode := model.Node{ID: uuid.New(), Subject: "Algebra", Name: "Fractions"}
	targetNode := model.Node{ID: uuid.New(), Subject: "Algebra", Name: "Decimals"}
	question := model.Question{
		ID: uuid.New(), NodeID: sourceNode.ID, Content: "1 + 1 = ?",
		OptionsJSON: `["1","2"]`, CorrectOption: 1,
		QuestionType: "multiple_choice",
	}
	if err := db.Create(&teacher).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&[]model.Node{sourceNode, targetNode}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&question).Error; err != nil {
		t.Fatal(err)
	}

	app := fiber.New()
	taggingHandler := NewTaggingHandler(service.NewTaggingService(db))
	app.Put("/questions/:questionId/topics", func(c fiber.Ctx) error {
		c.Locals("user", jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":  teacher.ID.String(),
			"role": "teacher",
		}))
		c.Locals("userID", teacher.ID.String())
		return c.Next()
	}, taggingHandler.SetQuestionTopics)

	request := httptest.NewRequest(
		http.MethodPut,
		"/questions/"+question.ID.String()+"/topics",
		strings.NewReader(
			`{"topicIds":["`+targetNode.ID.String()+`"],"expectedVersion":1}`,
		),
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

	var mapping model.QuestionTopicMapping
	if err := db.First(
		&mapping,
		"question_id = ? AND node_id = ?",
		question.ID,
		targetNode.ID,
	).Error; err != nil {
		t.Fatal(err)
	}
	if mapping.CreatedBy != teacher.ID {
		t.Fatalf("CreatedBy = %s, want %s", mapping.CreatedBy, teacher.ID)
	}
}

func TestTaggingHandlerRequiresExplicitTopicIDsField(t *testing.T) {
	for name, body := range map[string]string{
		"missing": `{"expectedVersion":1}`,
		"null":    `{"topicIds":null,"expectedVersion":1}`,
		"unknown": `{"topicIds":[],"expectedVersion":1,"updatedBy":"attacker"}`,
	} {
		t.Run(name, func(t *testing.T) {
			app := fiber.New()
			handler := NewTaggingHandler(&capturingTaggingService{})
			teacherID := uuid.New()
			questionID := uuid.New()
			app.Put("/questions/:questionId/topics", func(c fiber.Ctx) error {
				c.Locals("user", jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
					"sub":  teacherID.String(),
					"role": "teacher",
				}))
				c.Locals("userID", teacherID.String())
				return c.Next()
			}, handler.SetQuestionTopics)

			request := httptest.NewRequest(
				http.MethodPut,
				"/questions/"+questionID.String()+"/topics",
				strings.NewReader(body),
			)
			request.Header.Set("Content-Type", "application/json")
			response, err := app.Test(request)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			if response.StatusCode != http.StatusUnprocessableEntity {
				responseBody, _ := io.ReadAll(response.Body)
				t.Fatalf(
					"status = %d, want 422: %s",
					response.StatusCode,
					responseBody,
				)
			}
		})
	}
}
