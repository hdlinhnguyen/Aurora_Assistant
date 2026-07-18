package handler

import (
	"context"

	"backend/internal/gamification"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

type GamificationService interface {
	GetSummary(context.Context, uuid.UUID) (gamification.Summary, error)
	EvaluateAndAward(context.Context, uuid.UUID) error
}

type GamificationHandler struct{ service GamificationService }

func NewGamificationHandler(service GamificationService) *GamificationHandler {
	return &GamificationHandler{service: service}
}

// GetStudentBadges đánh giá + trao huy hiệu mới đủ điều kiện rồi trả hồ sơ gamification.
func (h *GamificationHandler) GetStudentBadges(c fiber.Ctx) error {
	studentID, err := authenticatedID(c)
	if err != nil {
		return err
	}
	if err := h.service.EvaluateAndAward(context.Background(), studentID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	summary, err := h.service.GetSummary(context.Background(), studentID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(summary)
}
