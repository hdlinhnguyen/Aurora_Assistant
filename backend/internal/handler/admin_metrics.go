package handler

import (
	"context"
	"log"
	"time"

	"backend/internal/adminmetrics"
	"github.com/gofiber/fiber/v3"
)

type AdminMetricsService interface {
	Dashboard(context.Context, time.Time, adminmetrics.Range) (adminmetrics.Dashboard, error)
}

type AdminMetricsHandler struct{ service AdminMetricsService }

func NewAdminMetricsHandler(service AdminMetricsService) *AdminMetricsHandler {
	return &AdminMetricsHandler{service: service}
}

func (h *AdminMetricsHandler) GetTelemetryDashboard(c fiber.Ctx) error {
	dashboardRange, err := adminmetrics.ParseRange(c.Query("range", string(adminmetrics.Range30d)))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid telemetry range"})
	}

	result, err := h.service.Dashboard(context.Background(), time.Now().UTC(), dashboardRange)
	if err != nil {
		log.Printf("load admin telemetry dashboard: %v", err)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "unable to load telemetry dashboard"})
	}
	return c.JSON(result)
}
