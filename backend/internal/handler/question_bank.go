package handler

import (
	"strings"

	"backend/internal/model"
	"backend/internal/service"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

type questionBankService interface {
	ListQuestions(filters service.QuestionBankFilters) ([]service.QuestionBankQuestionView, error)
	GetQuestion(questionID uuid.UUID) (*service.QuestionBankQuestionView, error)
	CreateQuestion(input service.QuestionBankQuestionInput) (*model.Question, error)
	UpdateQuestion(questionID uuid.UUID, update service.QuestionBankQuestionUpdate) (*model.Question, error)
	DeleteQuestion(questionID uuid.UUID) error
	CreateRubricItem(questionID uuid.UUID, input service.RubricItemInput) (*model.QuestionRubricItem, error)
	UpdateRubricItem(questionID, rubricItemID uuid.UUID, input service.RubricItemInput) (*model.QuestionRubricItem, error)
	DeleteRubricItem(questionID, rubricItemID uuid.UUID) error
	ReorderRubricItems(questionID uuid.UUID, orderedIDs []uuid.UUID) error
}

type QuestionBankHandler struct {
	service questionBankService
}

type ReorderRubricItemsRequest struct {
	RubricItemIDs []uuid.UUID `json:"rubricItemIds"`
}

func NewQuestionBankHandler(questionBankService questionBankService) *QuestionBankHandler {
	return &QuestionBankHandler{service: questionBankService}
}

func (h *QuestionBankHandler) ListQuestions(c fiber.Ctx) error {
	if _, err := requireTeacherActor(c); err != nil {
		return writeTaggingError(c, err)
	}
	filters := service.QuestionBankFilters{
		Subject:      strings.TrimSpace(c.Query("subject")),
		QuestionType: strings.TrimSpace(c.Query("type")),
		Difficulty:   strings.TrimSpace(c.Query("difficulty")),
		Search:       strings.TrimSpace(c.Query("search")),
	}
	if rawNodeID := strings.TrimSpace(c.Query("nodeId")); rawNodeID != "" {
		nodeID, err := uuid.Parse(rawNodeID)
		if err != nil {
			return writeTaggingError(c, &taggingRequestError{
				Status:  fiber.StatusBadRequest,
				Code:    "request_validation_error",
				Message: "nodeId must be a valid UUID.",
			})
		}
		filters.NodeID = &nodeID
	}
	questions, err := h.service.ListQuestions(filters)
	if err != nil {
		return writeTaggingError(c, err)
	}
	return c.JSON(questions)
}

func (h *QuestionBankHandler) GetQuestion(c fiber.Ctx) error {
	if _, err := requireTeacherActor(c); err != nil {
		return writeTaggingError(c, err)
	}
	questionID, err := parseUUIDParam(c, "questionId")
	if err != nil {
		return writeTaggingError(c, err)
	}
	question, err := h.service.GetQuestion(questionID)
	if err != nil {
		return writeTaggingError(c, err)
	}
	return c.JSON(question)
}

func (h *QuestionBankHandler) CreateQuestion(c fiber.Ctx) error {
	if _, err := requireTeacherActor(c); err != nil {
		return writeTaggingError(c, err)
	}
	var input service.QuestionBankQuestionInput
	if err := c.Bind().JSON(&input); err != nil {
		return writeQuestionBankValidationError(c)
	}
	question, err := h.service.CreateQuestion(input)
	if err != nil {
		return writeTaggingError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(question)
}

func (h *QuestionBankHandler) UpdateQuestion(c fiber.Ctx) error {
	if _, err := requireTeacherActor(c); err != nil {
		return writeTaggingError(c, err)
	}
	questionID, err := parseUUIDParam(c, "questionId")
	if err != nil {
		return writeTaggingError(c, err)
	}
	var update service.QuestionBankQuestionUpdate
	if err := c.Bind().JSON(&update); err != nil {
		return writeQuestionBankValidationError(c)
	}
	question, err := h.service.UpdateQuestion(questionID, update)
	if err != nil {
		return writeTaggingError(c, err)
	}
	return c.JSON(question)
}

func (h *QuestionBankHandler) DeleteQuestion(c fiber.Ctx) error {
	if _, err := requireTeacherActor(c); err != nil {
		return writeTaggingError(c, err)
	}
	questionID, err := parseUUIDParam(c, "questionId")
	if err != nil {
		return writeTaggingError(c, err)
	}
	if err := h.service.DeleteQuestion(questionID); err != nil {
		return writeTaggingError(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *QuestionBankHandler) CreateRubricItem(c fiber.Ctx) error {
	if _, err := requireTeacherActor(c); err != nil {
		return writeTaggingError(c, err)
	}
	questionID, err := parseUUIDParam(c, "questionId")
	if err != nil {
		return writeTaggingError(c, err)
	}
	input, err := bindRubricInput(c)
	if err != nil {
		return writeTaggingError(c, err)
	}
	item, err := h.service.CreateRubricItem(questionID, input)
	if err != nil {
		return writeTaggingError(c, err)
	}
	return c.Status(fiber.StatusCreated).JSON(item)
}

func (h *QuestionBankHandler) UpdateRubricItem(c fiber.Ctx) error {
	if _, err := requireTeacherActor(c); err != nil {
		return writeTaggingError(c, err)
	}
	questionID, rubricItemID, err := parseQuestionAndRubricIDs(c)
	if err != nil {
		return writeTaggingError(c, err)
	}
	input, err := bindRubricInput(c)
	if err != nil {
		return writeTaggingError(c, err)
	}
	item, err := h.service.UpdateRubricItem(questionID, rubricItemID, input)
	if err != nil {
		return writeTaggingError(c, err)
	}
	return c.JSON(item)
}

func (h *QuestionBankHandler) DeleteRubricItem(c fiber.Ctx) error {
	if _, err := requireTeacherActor(c); err != nil {
		return writeTaggingError(c, err)
	}
	questionID, rubricItemID, err := parseQuestionAndRubricIDs(c)
	if err != nil {
		return writeTaggingError(c, err)
	}
	if err := h.service.DeleteRubricItem(questionID, rubricItemID); err != nil {
		return writeTaggingError(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *QuestionBankHandler) ReorderRubricItems(c fiber.Ctx) error {
	if _, err := requireTeacherActor(c); err != nil {
		return writeTaggingError(c, err)
	}
	questionID, err := parseUUIDParam(c, "questionId")
	if err != nil {
		return writeTaggingError(c, err)
	}
	var request ReorderRubricItemsRequest
	if err := c.Bind().JSON(&request); err != nil {
		return writeQuestionBankValidationError(c)
	}
	if err := h.service.ReorderRubricItems(questionID, request.RubricItemIDs); err != nil {
		return writeTaggingError(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func bindRubricInput(c fiber.Ctx) (service.RubricItemInput, error) {
	var input service.RubricItemInput
	if err := c.Bind().JSON(&input); err != nil {
		return input, &taggingRequestError{
			Status:  fiber.StatusUnprocessableEntity,
			Code:    "request_validation_error",
			Message: "Rubric payload is invalid.",
		}
	}
	return input, nil
}

func parseQuestionAndRubricIDs(c fiber.Ctx) (uuid.UUID, uuid.UUID, error) {
	questionID, err := parseUUIDParam(c, "questionId")
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	rubricItemID, err := parseUUIDParam(c, "rubricItemId")
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	return questionID, rubricItemID, nil
}

func writeQuestionBankValidationError(c fiber.Ctx) error {
	return writeTaggingAPIError(
		c,
		fiber.StatusUnprocessableEntity,
		"request_validation_error",
		"Request payload is invalid.",
		nil,
		nil,
	)
}
