package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"

	"backend/internal/exam"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

type ExamHandler struct {
	service       *exam.Service
	internalToken string
}

func NewExamHandler(service *exam.Service, internalToken string) *ExamHandler {
	return &ExamHandler{service: service, internalToken: internalToken}
}

func (h *ExamHandler) Create(c fiber.Ctx) error {
	actor, err := requireTeacherActor(c)
	if err != nil {
		return writeExamError(c, err)
	}
	var input exam.CreateInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.Create(actor, input)
	return writeExamResult(c, fiber.StatusCreated, result, err)
}

func (h *ExamHandler) List(c fiber.Ctx) error {
	actor, err := requireTeacherActor(c)
	if err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.List(actor, exam.ListFilter{
		Status: c.Query("status"), Search: c.Query("search"),
	})
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) Get(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.Get(actor, examID)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) Patch(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	var input exam.PatchInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.Patch(actor, examID, input)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) Delete(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	version, err := expectedVersionQuery(c)
	if err != nil {
		return writeExamError(c, err)
	}
	if err := h.service.Delete(actor, examID, version); err != nil {
		return writeExamError(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *ExamHandler) Audit(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.Audit(actor, examID)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) ListBankQuestions(c fiber.Ctx) error {
	var nodeID *uuid.UUID
	if value := c.Query("nodeId"); value != "" {
		parsed, err := uuid.Parse(value)
		if err != nil {
			return writeExamError(c, invalidExamRequest("nodeId", "nodeId must be a UUID."))
		}
		nodeID = &parsed
	}
	result, err := h.service.ListBankQuestions(exam.BankFilter{
		Subject: c.Query("subject"), NodeID: nodeID,
		Difficulty: c.Query("difficulty"), Search: c.Query("search"),
	})
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) GetBankQuestion(c fiber.Ctx) error {
	id, err := examUUIDParam(c, "questionId")
	if err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.GetBankQuestion(id)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) ListTopics(c fiber.Ctx) error {
	result, err := h.service.ListTopics(c.Query("subject"))
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) AddBankQuestion(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	var input exam.AddBankQuestionInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.AddBankQuestion(actor, examID, input)
	return writeExamResult(c, fiber.StatusCreated, result, err)
}

func (h *ExamHandler) AddManualQuestion(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	var input exam.ManualQuestionInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.AddManualQuestion(actor, examID, input)
	return writeExamResult(c, fiber.StatusCreated, result, err)
}

func (h *ExamHandler) PatchQuestion(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	questionID, err := examUUIDParam(c, "questionId")
	if err != nil {
		return writeExamError(c, err)
	}
	var input exam.ManualQuestionInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.PatchQuestion(actor, examID, questionID, input)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) DeleteQuestion(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	questionID, err := examUUIDParam(c, "questionId")
	if err != nil {
		return writeExamError(c, err)
	}
	version, err := expectedVersionQuery(c)
	if err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.DeleteQuestion(actor, examID, questionID, version)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) ReorderQuestions(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	var input exam.ReorderQuestionsInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.ReorderQuestions(actor, examID, input)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) AddRubricItem(c fiber.Ctx) error {
	actor, examID, questionID, err := examQuestionIDs(c)
	if err != nil {
		return writeExamError(c, err)
	}
	var input exam.RubricItemInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.AddRubricItem(actor, examID, questionID, input)
	return writeExamResult(c, fiber.StatusCreated, result, err)
}

func (h *ExamHandler) PatchRubricItem(c fiber.Ctx) error {
	actor, examID, questionID, err := examQuestionIDs(c)
	if err != nil {
		return writeExamError(c, err)
	}
	rubricID, err := examUUIDParam(c, "rubricId")
	if err != nil {
		return writeExamError(c, err)
	}
	var input exam.PatchRubricItemInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.PatchRubricItem(actor, examID, questionID, rubricID, input)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) DeleteRubricItem(c fiber.Ctx) error {
	actor, examID, questionID, err := examQuestionIDs(c)
	if err != nil {
		return writeExamError(c, err)
	}
	rubricID, err := examUUIDParam(c, "rubricId")
	if err != nil {
		return writeExamError(c, err)
	}
	version, err := expectedVersionQuery(c)
	if err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.DeleteRubricItem(actor, examID, questionID, rubricID, version)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) ReorderRubricItems(c fiber.Ctx) error {
	actor, examID, questionID, err := examQuestionIDs(c)
	if err != nil {
		return writeExamError(c, err)
	}
	var input exam.ReorderRubricItemsInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.ReorderRubricItems(actor, examID, questionID, input)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) Validate(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.Validate(actor, examID)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) Prepare(c fiber.Ctx) error {
	return h.transition(c, h.service.Prepare)
}

func (h *ExamHandler) ReturnToDraft(c fiber.Ctx) error {
	return h.transition(c, h.service.ReturnToDraft)
}

func (h *ExamHandler) transition(
	c fiber.Ctx,
	transition func(uuid.UUID, uuid.UUID, exam.VersionInput) (*exam.Detail, error),
) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	var input exam.VersionInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := transition(actor, examID, input)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) ExportDOCX(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	var input exam.ExportDOCXInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.ExportDOCX(actor, examID, input)
	return writeExamResult(c, fiber.StatusCreated, result, err)
}

func (h *ExamHandler) ListExports(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.ListExports(actor, examID)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) DownloadExport(c fiber.Ctx) error {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return writeExamError(c, err)
	}
	exportID, err := examUUIDParam(c, "exportId")
	if err != nil {
		return writeExamError(c, err)
	}
	path, name, err := h.service.ExportFile(actor, examID, exportID)
	if err != nil {
		return writeExamError(c, err)
	}
	c.Set(fiber.HeaderContentType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	c.Set(fiber.HeaderContentDisposition, fmt.Sprintf(`attachment; filename="%s"`, name))
	return c.SendFile(path)
}

func (h *ExamHandler) FirstSubmission(c fiber.Ctx) error {
	if err := h.requireInternal(c); err != nil {
		return writeExamError(c, err)
	}
	examID, err := examUUIDParam(c, "examId")
	if err != nil {
		return writeExamError(c, err)
	}
	key := c.Get("Idempotency-Key")
	if key == "" {
		return writeExamError(c, invalidExamRequest("Idempotency-Key", "Idempotency-Key is required."))
	}
	var input exam.FirstSubmissionInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.FirstSubmission(examID, key, input)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) GradingCompleted(c fiber.Ctx) error {
	if err := h.requireInternal(c); err != nil {
		return writeExamError(c, err)
	}
	examID, err := examUUIDParam(c, "examId")
	if err != nil {
		return writeExamError(c, err)
	}
	key := c.Get("Idempotency-Key")
	if key == "" {
		return writeExamError(c, invalidExamRequest("Idempotency-Key", "Idempotency-Key is required."))
	}
	var input exam.GradingCompletedInput
	if err := decodeStrict(c, &input); err != nil {
		return writeExamError(c, err)
	}
	result, err := h.service.GradingCompleted(examID, key, input)
	return writeExamResult(c, fiber.StatusOK, result, err)
}

func (h *ExamHandler) requireInternal(c fiber.Ctx) error {
	if h.internalToken == "" || c.Get("X-Internal-Token") != h.internalToken {
		return &exam.DomainError{
			Code: "unauthorized", Message: "A valid internal token is required.",
			Status: fiber.StatusUnauthorized,
		}
	}
	return nil
}

func decodeStrict(c fiber.Ctx, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(c.Request().Body()))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return invalidExamRequest("", "Request body is invalid.")
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return invalidExamRequest("", "Request body must contain one JSON object.")
	}
	return nil
}

func examActorAndID(c fiber.Ctx) (uuid.UUID, uuid.UUID, error) {
	actor, err := requireTeacherActor(c)
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	id, err := examUUIDParam(c, "examId")
	return actor, id, err
}

func examQuestionIDs(c fiber.Ctx) (uuid.UUID, uuid.UUID, uuid.UUID, error) {
	actor, examID, err := examActorAndID(c)
	if err != nil {
		return uuid.Nil, uuid.Nil, uuid.Nil, err
	}
	questionID, err := examUUIDParam(c, "questionId")
	return actor, examID, questionID, err
}

func examUUIDParam(c fiber.Ctx, name string) (uuid.UUID, error) {
	id, err := uuid.Parse(c.Params(name))
	if err != nil {
		return uuid.Nil, invalidExamRequest(name, name+" must be a UUID.")
	}
	return id, nil
}

func expectedVersionQuery(c fiber.Ctx) (int, error) {
	version, err := strconv.Atoi(c.Query("expectedVersion"))
	if err != nil || version < 1 {
		return 0, invalidExamRequest("expectedVersion", "expectedVersion must be a positive integer.")
	}
	return version, nil
}

func invalidExamRequest(field, message string) *exam.DomainError {
	return &exam.DomainError{
		Code: exam.ErrorCodeInvalidRequest, Message: message, Field: field,
		Status: fiber.StatusBadRequest,
	}
}

func writeExamResult(c fiber.Ctx, status int, value any, err error) error {
	if err != nil {
		return writeExamError(c, err)
	}
	return c.Status(status).JSON(value)
}

func writeExamError(c fiber.Ctx, err error) error {
	var domainError *exam.DomainError
	if errors.As(err, &domainError) {
		status := domainError.Status
		if status == 0 {
			status = fiber.StatusInternalServerError
		}
		return c.Status(status).JSON(fiber.Map{"error": fiber.Map{
			"code": domainError.Code, "message": domainError.Message,
			"field": domainError.Field, "meta": domainError.Meta,
		}})
	}
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fiber.Map{
		"code": "internal_error", "message": "Unable to process exam request.",
	}})
}
