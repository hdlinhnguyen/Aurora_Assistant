package handler

import (
	"context"
	"errors"
	"strings"
	"time"

	"backend/internal/mastery"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

type MasteryService interface {
	GetProfile(context.Context, uuid.UUID, string) (mastery.Profile, error)
	GetHistory(context.Context, uuid.UUID, uuid.UUID, string) ([]mastery.HistoryPoint, error)
	RecalculateStudent(context.Context, uuid.UUID, string) (mastery.Profile, error)
	CanTeacherView(context.Context, uuid.UUID, uuid.UUID) error
}

type MasteryHandler struct{ service MasteryService }

func NewMasteryHandler(service MasteryService) *MasteryHandler {
	return &MasteryHandler{service: service}
}

func (h *MasteryHandler) GetStudentProfile(c fiber.Ctx) error {
	studentID, err := authenticatedID(c)
	if err != nil {
		return err
	}
	profile, err := h.service.GetProfile(context.Background(), studentID, strings.TrimSpace(c.Query("subject")))
	return masteryResult(c, profile, err)
}

func (h *MasteryHandler) GetTeacherProfile(c fiber.Ctx) error {
	teacherID, err := authenticatedID(c)
	if err != nil {
		return err
	}
	studentID, err := uuid.Parse(c.Params("studentId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}
	if err := h.service.CanTeacherView(context.Background(), teacherID, studentID); err != nil {
		return masteryError(c, err)
	}
	profile, err := h.service.GetProfile(context.Background(), studentID, strings.TrimSpace(c.Query("subject")))
	return masteryResult(c, profile, err)
}

func (h *MasteryHandler) GetStudentHistory(c fiber.Ctx) error {
	studentID, err := authenticatedID(c)
	if err != nil {
		return err
	}
	return h.history(c, studentID)
}

func (h *MasteryHandler) GetTeacherHistory(c fiber.Ctx) error {
	teacherID, err := authenticatedID(c)
	if err != nil {
		return err
	}
	studentID, err := uuid.Parse(c.Params("studentId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}
	if err := h.service.CanTeacherView(context.Background(), teacherID, studentID); err != nil {
		return masteryError(c, err)
	}
	return h.history(c, studentID)
}

func (h *MasteryHandler) RecalculateTeacherProfile(c fiber.Ctx) error {
	teacherID, err := authenticatedID(c)
	if err != nil {
		return err
	}
	studentID, err := uuid.Parse(c.Params("studentId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid student id"})
	}
	if err := h.service.CanTeacherView(context.Background(), teacherID, studentID); err != nil {
		return masteryError(c, err)
	}
	var body struct {
		Subject string `json:"subject"`
	}
	if err := c.Bind().JSON(&body); err != nil || strings.TrimSpace(body.Subject) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "subject is required"})
	}
	profile, err := h.service.RecalculateStudent(context.Background(), studentID, strings.TrimSpace(body.Subject))
	return masteryResult(c, profile, err)
}

func (h *MasteryHandler) history(c fiber.Ctx, studentID uuid.UUID) error {
	topicID, err := uuid.Parse(c.Params("topicId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid topic id"})
	}
	historyRange := c.Query("range", mastery.Range90d)
	if _, err := mastery.HistoryCutoff(time.Now(), historyRange); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}
	history, err := h.service.GetHistory(context.Background(), studentID, topicID, historyRange)
	if err != nil {
		return masteryError(c, err)
	}
	return c.JSON(fiber.Map{"topicId": topicID, "range": historyRange, "history": history})
}

func authenticatedID(c fiber.Ctx) (uuid.UUID, error) {
	raw, ok := c.Locals("userID").(string)
	if !ok {
		return uuid.Nil, fiber.NewError(fiber.StatusUnauthorized, "authentication required")
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return uuid.Nil, fiber.NewError(fiber.StatusBadRequest, "invalid user id")
	}
	return id, nil
}

func masteryResult(c fiber.Ctx, profile mastery.Profile, err error) error {
	if err != nil {
		return masteryError(c, err)
	}
	return c.JSON(profile)
}

func masteryError(c fiber.Ctx, err error) error {
	if errors.Is(err, mastery.ErrForbidden) {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "mastery profile access forbidden"})
	}
	if strings.Contains(err.Error(), "service unavailable") {
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
}
