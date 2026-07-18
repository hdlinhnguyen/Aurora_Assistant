package middleware_test

import (
	"net/http/httptest"
	"testing"

	"backend/internal/middleware"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
)

func TestRequireRoleAllowsExactRoleAndRejectsOthers(t *testing.T) {
	tests := []struct {
		name       string
		token      *jwt.Token
		wantStatus int
	}{
		{
			name: "teacher allowed",
			token: jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
				"sub": "teacher-id", "role": "teacher",
			}),
			wantStatus: fiber.StatusNoContent,
		},
		{
			name: "student forbidden",
			token: jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
				"sub": "student-id", "role": "student",
			}),
			wantStatus: fiber.StatusForbidden,
		},
		{
			name:       "missing token unauthorized",
			token:      nil,
			wantStatus: fiber.StatusUnauthorized,
		},
	}

	for _, testCase := range tests {
		t.Run(testCase.name, func(t *testing.T) {
			app := fiber.New()
			app.Use(func(c fiber.Ctx) error {
				if testCase.token != nil {
					c.Locals("user", testCase.token)
				}
				return c.Next()
			})
			app.Get("/", middleware.RequireRole("teacher"), func(c fiber.Ctx) error {
				return c.SendStatus(fiber.StatusNoContent)
			})

			response, err := app.Test(httptest.NewRequest("GET", "/", nil))
			require.NoError(t, err)
			require.Equal(t, testCase.wantStatus, response.StatusCode)
		})
	}
}
