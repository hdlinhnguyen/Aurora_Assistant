package handler

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestExamHandlerRejectsUnknownCreateField(t *testing.T) {
	app := fiber.New()
	h := NewExamHandler(nil, "internal-secret")
	app.Post("/exams", func(c fiber.Ctx) error {
		c.Locals("user", jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": uuid.NewString(), "role": "teacher",
		}))
		return h.Create(c)
	})

	request := httptest.NewRequest("POST", "/exams", strings.NewReader(
		`{"title":"Exam","subject":"Math","gradeLevel":"4","durationMinutes":45,`+
			`"instructions":"","totalPoints":"10","teacherId":"forged"}`,
	))
	request.Header.Set("Content-Type", "application/json")
	response, err := app.Test(request)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusBadRequest, response.StatusCode)
}

func TestExamInternalCallbackRequiresConfiguredToken(t *testing.T) {
	app := fiber.New()
	h := NewExamHandler(nil, "internal-secret")
	app.Post("/internal/exams/:examId/first-submission", h.FirstSubmission)

	request := httptest.NewRequest(
		"POST", "/internal/exams/"+uuid.NewString()+"/first-submission",
		strings.NewReader(`{"totalSubmissions":1}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response, err := app.Test(request)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusUnauthorized, response.StatusCode)
}
