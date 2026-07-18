package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"backend/internal/adminmetrics"
	"backend/internal/middleware"
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
)

type fakeAdminMetricsService struct {
	rangeSeen adminmetrics.Range
	result    adminmetrics.Dashboard
	err       error
}

func (f *fakeAdminMetricsService) Dashboard(_ context.Context, _ time.Time, r adminmetrics.Range) (adminmetrics.Dashboard, error) {
	f.rangeSeen = r
	return f.result, f.err
}

func TestAdminTelemetryDefaultsTo30Days(t *testing.T) {
	service := &fakeAdminMetricsService{result: adminmetrics.Dashboard{Range: adminmetrics.Range30d}}
	app := fiber.New()
	app.Get("/api/admin/telemetry-dashboard", NewAdminMetricsHandler(service).GetTelemetryDashboard)

	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/admin/telemetry-dashboard", nil))
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, response.StatusCode)
	require.Equal(t, adminmetrics.Range30d, service.rangeSeen)
}

func TestAdminTelemetryForwardsSelectedRange(t *testing.T) {
	service := &fakeAdminMetricsService{result: adminmetrics.Dashboard{Range: adminmetrics.Range7d}}
	app := fiber.New()
	app.Get("/api/admin/telemetry-dashboard", NewAdminMetricsHandler(service).GetTelemetryDashboard)

	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/admin/telemetry-dashboard?range=7d", nil))
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, response.StatusCode)
	require.Equal(t, adminmetrics.Range7d, service.rangeSeen)
}

func TestAdminTelemetryRejectsInvalidRange(t *testing.T) {
	service := &fakeAdminMetricsService{}
	app := fiber.New()
	app.Get("/api/admin/telemetry-dashboard", NewAdminMetricsHandler(service).GetTelemetryDashboard)

	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/admin/telemetry-dashboard?range=14d", nil))
	require.NoError(t, err)
	require.Equal(t, http.StatusBadRequest, response.StatusCode)
	var body map[string]string
	require.NoError(t, json.NewDecoder(response.Body).Decode(&body))
	require.Equal(t, "invalid telemetry range", body["error"])
}

func TestAdminTelemetryHidesServiceErrors(t *testing.T) {
	service := &fakeAdminMetricsService{err: errors.New("SELECT secret failed")}
	app := fiber.New()
	app.Get("/api/admin/telemetry-dashboard", NewAdminMetricsHandler(service).GetTelemetryDashboard)

	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/admin/telemetry-dashboard", nil))
	require.NoError(t, err)
	require.Equal(t, http.StatusInternalServerError, response.StatusCode)
	var body map[string]string
	require.NoError(t, json.NewDecoder(response.Body).Decode(&body))
	require.Equal(t, "unable to load telemetry dashboard", body["error"])
}

func TestAdminTelemetryRequiresAdminRole(t *testing.T) {
	for _, testCase := range []struct {
		role   string
		status int
	}{
		{role: "student", status: http.StatusForbidden},
		{role: "admin", status: http.StatusOK},
	} {
		t.Run(testCase.role, func(t *testing.T) {
			service := &fakeAdminMetricsService{result: adminmetrics.Dashboard{Range: adminmetrics.Range30d}}
			app := fiber.New()
			app.Use(func(c fiber.Ctx) error {
				c.Locals("user", &jwt.Token{Claims: jwt.MapClaims{"role": testCase.role}})
				return c.Next()
			})
			app.Get("/api/admin/telemetry-dashboard", middleware.RequireRole("admin"), NewAdminMetricsHandler(service).GetTelemetryDashboard)

			response, err := app.Test(httptest.NewRequest(http.MethodGet, "/api/admin/telemetry-dashboard", nil))
			require.NoError(t, err)
			require.Equal(t, testCase.status, response.StatusCode)
		})
	}
}
