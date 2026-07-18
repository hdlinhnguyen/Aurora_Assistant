package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
)

func TestQuestionBankHandlerRejectsStudentRole(t *testing.T) {
	app := fiber.New()
	questionBankHandler := NewQuestionBankHandler(nil)
	app.Get("/questions", func(c fiber.Ctx) error {
		c.Locals("user", jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub":  "11111111-1111-1111-1111-111111111111",
			"role": "student",
		}))
		c.Locals("userID", "11111111-1111-1111-1111-111111111111")
		return c.Next()
	}, questionBankHandler.ListQuestions)

	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/questions", nil))
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusForbidden)
	}
}
