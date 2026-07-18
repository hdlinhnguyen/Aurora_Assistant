package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"

	"backend/internal/service"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type taggingService interface {
	GetContext(questionID uuid.UUID) (*service.TaggingContext, error)
	GetEffectiveTopics(questionID uuid.UUID) (*service.EffectiveQuestionTopics, error)
	SetQuestionTopics(
		questionID uuid.UUID,
		topicIDs []uuid.UUID,
		expectedVersion int,
		actorID uuid.UUID,
	) (*service.TaggingContext, error)
	SetRubricItemTopics(
		questionID uuid.UUID,
		rubricItemID uuid.UUID,
		topicIDs []uuid.UUID,
		expectedVersion int,
		actorID uuid.UUID,
	) (*service.TaggingContext, error)
}

type TaggingHandler struct {
	service taggingService
}

type UpdateTopicsRequest struct {
	TopicIDs        *[]uuid.UUID `json:"topicIds"`
	ExpectedVersion int          `json:"expectedVersion"`
}

type taggingRequestError struct {
	Status  int
	Code    string
	Message string
	Details map[string]any
}

func (e *taggingRequestError) Error() string {
	return e.Message
}

func NewTaggingHandler(taggingService taggingService) *TaggingHandler {
	return &TaggingHandler{service: taggingService}
}

func (h *TaggingHandler) GetContext(c fiber.Ctx) error {
	if _, err := requireTeacherActor(c); err != nil {
		return writeTaggingError(c, err)
	}
	questionID, err := parseUUIDParam(c, "questionId")
	if err != nil {
		return writeTaggingError(c, err)
	}
	context, err := h.service.GetContext(questionID)
	if err != nil {
		return writeTaggingError(c, err)
	}
	return c.JSON(context)
}

func (h *TaggingHandler) GetEffectiveTopics(c fiber.Ctx) error {
	if _, err := requireTeacherActor(c); err != nil {
		return writeTaggingError(c, err)
	}
	questionID, err := parseUUIDParam(c, "questionId")
	if err != nil {
		return writeTaggingError(c, err)
	}
	topics, err := h.service.GetEffectiveTopics(questionID)
	if err != nil {
		return writeTaggingError(c, err)
	}
	return c.JSON(topics)
}

func (h *TaggingHandler) SetQuestionTopics(c fiber.Ctx) error {
	actorID, err := requireTeacherActor(c)
	if err != nil {
		return writeTaggingError(c, err)
	}
	questionID, err := parseUUIDParam(c, "questionId")
	if err != nil {
		return writeTaggingError(c, err)
	}
	request, err := bindUpdateTopics(c)
	if err != nil {
		return writeTaggingError(c, err)
	}
	context, err := h.service.SetQuestionTopics(
		questionID,
		*request.TopicIDs,
		request.ExpectedVersion,
		actorID,
	)
	if err != nil {
		return writeTaggingError(c, err)
	}
	return c.JSON(context)
}

func (h *TaggingHandler) SetRubricItemTopics(c fiber.Ctx) error {
	actorID, err := requireTeacherActor(c)
	if err != nil {
		return writeTaggingError(c, err)
	}
	questionID, err := parseUUIDParam(c, "questionId")
	if err != nil {
		return writeTaggingError(c, err)
	}
	rubricItemID, err := parseUUIDParam(c, "rubricItemId")
	if err != nil {
		return writeTaggingError(c, err)
	}
	request, err := bindUpdateTopics(c)
	if err != nil {
		return writeTaggingError(c, err)
	}
	context, err := h.service.SetRubricItemTopics(
		questionID,
		rubricItemID,
		*request.TopicIDs,
		request.ExpectedVersion,
		actorID,
	)
	if err != nil {
		return writeTaggingError(c, err)
	}
	return c.JSON(context)
}

func requireTeacherActor(c fiber.Ctx) (uuid.UUID, error) {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok || token == nil {
		return uuid.Nil, &taggingRequestError{
			Status:  fiber.StatusUnauthorized,
			Code:    "unauthorized",
			Message: "Authentication is required.",
		}
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || claims["role"] != "teacher" {
		return uuid.Nil, &taggingRequestError{
			Status:  fiber.StatusForbidden,
			Code:    "teacher_role_required",
			Message: "Teacher role is required.",
		}
	}
	subject, ok := claims["sub"].(string)
	if !ok {
		return uuid.Nil, &taggingRequestError{
			Status:  fiber.StatusUnauthorized,
			Code:    "invalid_actor",
			Message: "Authenticated token subject is missing.",
		}
	}
	userID, err := uuid.Parse(subject)
	if err != nil {
		return uuid.Nil, &taggingRequestError{
			Status:  fiber.StatusUnauthorized,
			Code:    "invalid_actor",
			Message: "Authenticated token subject is invalid.",
		}
	}
	return userID, nil
}

func parseUUIDParam(c fiber.Ctx, name string) (uuid.UUID, error) {
	value, err := uuid.Parse(c.Params(name))
	if err != nil {
		return uuid.Nil, &taggingRequestError{
			Status:  fiber.StatusBadRequest,
			Code:    "request_validation_error",
			Message: "Path parameter must be a valid UUID.",
			Details: map[string]any{"field": name},
		}
	}
	return value, nil
}

func bindUpdateTopics(c fiber.Ctx) (UpdateTopicsRequest, error) {
	var request UpdateTopicsRequest
	decoder := json.NewDecoder(bytes.NewReader(c.Request().Body()))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return request, invalidUpdateTopicsPayload()
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return request, invalidUpdateTopicsPayload()
	}
	if request.TopicIDs == nil {
		return request, &taggingRequestError{
			Status:  fiber.StatusUnprocessableEntity,
			Code:    "request_validation_error",
			Message: "topicIds is required and must be an array.",
		}
	}
	if request.ExpectedVersion < 1 || len(*request.TopicIDs) > 200 {
		return request, &taggingRequestError{
			Status:  fiber.StatusUnprocessableEntity,
			Code:    "request_validation_error",
			Message: "expectedVersion must be positive and topicIds cannot exceed 200 items.",
		}
	}
	return request, nil
}

func invalidUpdateTopicsPayload() *taggingRequestError {
	return &taggingRequestError{
		Status:  fiber.StatusUnprocessableEntity,
		Code:    "request_validation_error",
		Message: "Request payload is invalid.",
	}
}

func writeTaggingError(c fiber.Ctx, err error) error {
	var requestError *taggingRequestError
	if errors.As(err, &requestError) {
		return writeTaggingAPIError(
			c,
			requestError.Status,
			requestError.Code,
			requestError.Message,
			requestError.Details,
			nil,
		)
	}
	var conflict *service.VersionConflict
	if errors.As(err, &conflict) {
		return writeTaggingAPIError(
			c,
			fiber.StatusConflict,
			conflict.Code,
			conflict.Message,
			conflict.Details,
			conflict.LatestContext,
		)
	}
	var domainError *service.DomainError
	if errors.As(err, &domainError) {
		status := fiber.StatusUnprocessableEntity
		if domainError.Code == "question_not_found" ||
			domainError.Code == "rubric_item_not_found" {
			status = fiber.StatusNotFound
		}
		return writeTaggingAPIError(
			c,
			status,
			domainError.Code,
			domainError.Message,
			domainError.Details,
			nil,
		)
	}
	return writeTaggingAPIError(
		c,
		fiber.StatusInternalServerError,
		"internal_error",
		"Unable to process question tagging.",
		nil,
		nil,
	)
}

func writeTaggingAPIError(
	c fiber.Ctx,
	status int,
	code string,
	message string,
	details map[string]any,
	latestContext *service.TaggingContext,
) error {
	body := fiber.Map{
		"error": fiber.Map{
			"code":    code,
			"message": message,
			"details": details,
		},
	}
	if latestContext != nil {
		body["latestContext"] = latestContext
	}
	return c.Status(status).JSON(body)
}
