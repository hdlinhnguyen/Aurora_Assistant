package handler

import (
	"context"
	"errors"

	"backend/internal/learningpath"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

type LearningPathProgressService interface {
	StartStep(context.Context, uuid.UUID, uuid.UUID) (learningpath.ProgressStepView, error)
	GetTeacherProgress(context.Context, uuid.UUID, uuid.UUID, uuid.UUID) (learningpath.LearningPathProgressView, error)
}

type LearningPathProgressHandler struct {
	service LearningPathProgressService
}

func NewLearningPathProgressHandler(service LearningPathProgressService) *LearningPathProgressHandler {
	return &LearningPathProgressHandler{service: service}
}

func (h *LearningPathProgressHandler) StartStep(c fiber.Ctx) error {
	studentID, err := authenticatedUUID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	topicID, err := uuid.Parse(c.Params("topicId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "topicId không hợp lệ"})
	}
	step, err := h.service.StartStep(context.Background(), studentID, topicID)
	if err != nil {
		return writeLearningPathProgressError(c, err)
	}
	return c.JSON(step)
}

func (h *LearningPathProgressHandler) GetTeacherProgress(c fiber.Ctx) error {
	teacherID, err := authenticatedUUID(c)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	studentID, err := uuid.Parse(c.Params("studentId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "studentId không hợp lệ"})
	}
	classID, err := uuid.Parse(c.Query("classId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "classId không hợp lệ"})
	}
	view, err := h.service.GetTeacherProgress(context.Background(), teacherID, classID, studentID)
	if err != nil {
		return writeLearningPathProgressError(c, err)
	}
	return c.JSON(view)
}

func authenticatedUUID(c fiber.Ctx) (uuid.UUID, error) {
	value, ok := c.Locals("userID").(string)
	if !ok {
		return uuid.Nil, errors.New("missing user ID")
	}
	return uuid.Parse(value)
}

func writeLearningPathProgressError(c fiber.Ctx, err error) error {
	switch {
	case errors.Is(err, learningpath.ErrForbidden):
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, learningpath.ErrPathNotFound), errors.Is(err, learningpath.ErrStepNotFound):
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": err.Error()})
	case errors.Is(err, learningpath.ErrPrerequisiteIncomplete):
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{"error": err.Error()})
	default:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể cập nhật tiến độ lộ trình"})
	}
}
