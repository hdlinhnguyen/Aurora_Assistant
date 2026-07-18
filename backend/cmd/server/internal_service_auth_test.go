package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/stretchr/testify/require"
)

func TestInternalServiceAuth(t *testing.T) {
	tests := []struct {
		name     string
		expected string
		provided string
		status   int
	}{
		{name: "missing server token", status: http.StatusServiceUnavailable},
		{name: "missing request token", expected: "shared-secret", status: http.StatusUnauthorized},
		{name: "wrong request token", expected: "shared-secret", provided: "wrong", status: http.StatusUnauthorized},
		{name: "matching request token", expected: "shared-secret", provided: "shared-secret", status: http.StatusNoContent},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/internal", internalServiceAuth(test.expected), func(c fiber.Ctx) error {
				return c.SendStatus(http.StatusNoContent)
			})
			request := httptest.NewRequest(http.MethodGet, "/internal", nil)
			if test.provided != "" {
				request.Header.Set("X-Internal-Token", test.provided)
			}

			response, err := app.Test(request)

			require.NoError(t, err)
			require.Equal(t, test.status, response.StatusCode)
		})
	}
}
