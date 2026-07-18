package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"

	"backend/internal/model"
	"backend/internal/scoring"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

type scoringService interface {
	CreateBatch(uuid.UUID, scoring.CreateBatchInput) (*scoring.BatchDetail, error)
	ListStudents(string) ([]model.User, error)
	ListBatches(uuid.UUID, string, string) ([]model.GradingBatch, error)
	GetBatch(uuid.UUID, uuid.UUID) (*scoring.BatchDetail, error)
	GetSubmission(uuid.UUID, uuid.UUID) (*scoring.SubmissionDetail, error)
	UpdateQuestionResult(uuid.UUID, uuid.UUID, uuid.UUID, scoring.ResultInput) (*scoring.SubmissionDetail, error)
	UpdateRubricResult(uuid.UUID, uuid.UUID, uuid.UUID, scoring.ResultInput) (*scoring.SubmissionDetail, error)
	Approve(uuid.UUID, uuid.UUID, scoring.VersionInput) (*scoring.SubmissionDetail, error)
	StartRevision(uuid.UUID, uuid.UUID, scoring.VersionInput) (*scoring.SubmissionDetail, error)
	History(uuid.UUID, uuid.UUID) ([]model.ScoringApprovalSnapshot, error)
	Audit(uuid.UUID, uuid.UUID) ([]model.ScoringAuditLog, error)
}

type ScoringHandler struct{ service scoringService }

func NewScoringHandler(service scoringService) *ScoringHandler {
	return &ScoringHandler{service: service}
}

func (h *ScoringHandler) ListStudents(c fiber.Ctx) error {
	if _, err := requireTeacherActor(c); err != nil {
		return writeScoringError(c, err)
	}
	rows, err := h.service.ListStudents(c.Query("search"))
	if err != nil {
		return writeScoringError(c, err)
	}
	return c.JSON(rows)
}

func (h *ScoringHandler) CreateBatch(c fiber.Ctx) error {
	actor, err := requireTeacherActor(c)
	if err != nil {
		return writeScoringError(c, err)
	}
	var input scoring.CreateBatchInput
	if err := decodeStrictScoringJSON(c, &input); err != nil {
		return writeScoringError(c, invalidScoringRequest())
	}
	input.IdempotencyKey = strings.TrimSpace(c.Get("Idempotency-Key"))
	if input.IdempotencyKey == "" || len(input.IdempotencyKey) > 200 {
		return writeScoringError(c, invalidIdempotencyKey())
	}
	result, err := h.service.CreateBatch(actor, input)
	if err != nil {
		return writeScoringError(c, err)
	}
	return c.Status(http.StatusCreated).JSON(result)
}

func (h *ScoringHandler) ListBatches(c fiber.Ctx) error {
	actor, err := requireTeacherActor(c)
	if err != nil {
		return writeScoringError(c, err)
	}
	rows, err := h.service.ListBatches(actor, c.Query("status"), c.Query("search"))
	if err != nil {
		return writeScoringError(c, err)
	}
	return c.JSON(rows)
}

func (h *ScoringHandler) GetBatch(c fiber.Ctx) error {
	return h.withBatch(c, h.service.GetBatch)
}

func (h *ScoringHandler) GetSubmission(c fiber.Ctx) error {
	return h.withSubmission(c, func(actor, id uuid.UUID) (any, error) { return h.service.GetSubmission(actor, id) })
}

func (h *ScoringHandler) UpdateQuestion(c fiber.Ctx) error {
	actor, sid, err := scoringActorAndID(c)
	if err != nil {
		return writeScoringError(c, err)
	}
	qid, err := parseUUIDParam(c, "questionId")
	if err != nil {
		return writeScoringError(c, err)
	}
	var input scoring.ResultInput
	if err := decodeStrictScoringJSON(c, &input); err != nil {
		return writeScoringError(c, invalidScoringRequest())
	}
	result, err := h.service.UpdateQuestionResult(actor, sid, qid, input)
	if err != nil {
		return writeScoringError(c, err)
	}
	return c.JSON(result)
}

func (h *ScoringHandler) UpdateRubric(c fiber.Ctx) error {
	actor, sid, err := scoringActorAndID(c)
	if err != nil {
		return writeScoringError(c, err)
	}
	rid, err := parseUUIDParam(c, "rubricId")
	if err != nil {
		return writeScoringError(c, err)
	}
	var input scoring.ResultInput
	if err := decodeStrictScoringJSON(c, &input); err != nil {
		return writeScoringError(c, invalidScoringRequest())
	}
	result, err := h.service.UpdateRubricResult(actor, sid, rid, input)
	if err != nil {
		return writeScoringError(c, err)
	}
	return c.JSON(result)
}

func (h *ScoringHandler) Approve(c fiber.Ctx) error {
	return h.versionMutation(c, h.service.Approve)
}

func (h *ScoringHandler) StartRevision(c fiber.Ctx) error {
	return h.versionMutation(c, h.service.StartRevision)
}

func (h *ScoringHandler) History(c fiber.Ctx) error {
	return h.withSubmission(c, func(actor, id uuid.UUID) (any, error) { return h.service.History(actor, id) })
}

func (h *ScoringHandler) Audit(c fiber.Ctx) error {
	return h.withSubmission(c, func(actor, id uuid.UUID) (any, error) { return h.service.Audit(actor, id) })
}

func (h *ScoringHandler) withBatch(c fiber.Ctx, fn func(uuid.UUID, uuid.UUID) (*scoring.BatchDetail, error)) error {
	actor, err := requireTeacherActor(c)
	if err != nil {
		return writeScoringError(c, err)
	}
	id, err := parseUUIDParam(c, "batchId")
	if err != nil {
		return writeScoringError(c, err)
	}
	result, err := fn(actor, id)
	if err != nil {
		return writeScoringError(c, err)
	}
	return c.JSON(result)
}

func (h *ScoringHandler) withSubmission(c fiber.Ctx, fn func(uuid.UUID, uuid.UUID) (any, error)) error {
	actor, id, err := scoringActorAndID(c)
	if err != nil {
		return writeScoringError(c, err)
	}
	result, err := fn(actor, id)
	if err != nil {
		return writeScoringError(c, err)
	}
	return c.JSON(result)
}

func (h *ScoringHandler) versionMutation(c fiber.Ctx, fn func(uuid.UUID, uuid.UUID, scoring.VersionInput) (*scoring.SubmissionDetail, error)) error {
	actor, id, err := scoringActorAndID(c)
	if err != nil {
		return writeScoringError(c, err)
	}
	var input scoring.VersionInput
	if err := decodeStrictScoringJSON(c, &input); err != nil {
		return writeScoringError(c, invalidScoringRequest())
	}
	input.IdempotencyKey = strings.TrimSpace(c.Get("Idempotency-Key"))
	if input.IdempotencyKey == "" || len(input.IdempotencyKey) > 200 {
		return writeScoringError(c, invalidIdempotencyKey())
	}
	result, err := fn(actor, id, input)
	if err != nil {
		return writeScoringError(c, err)
	}
	return c.JSON(result)
}

func scoringActorAndID(c fiber.Ctx) (uuid.UUID, uuid.UUID, error) {
	actor, err := requireTeacherActor(c)
	if err != nil {
		return uuid.Nil, uuid.Nil, err
	}
	id, err := parseUUIDParam(c, "submissionId")
	return actor, id, err
}

func invalidScoringRequest() *scoring.DomainError {
	return &scoring.DomainError{Code: scoring.ErrorCodeInvalidRequest, Message: "Request body is invalid.", Status: http.StatusBadRequest}
}

func decodeStrictScoringJSON(c fiber.Ctx, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(c.Request().Body()))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	return requireJSONEOF(decoder)
}

func requireJSONEOF(decoder *json.Decoder) error {
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("request body must contain exactly one JSON object")
	}
	return nil
}

func invalidIdempotencyKey() *scoring.DomainError {
	return &scoring.DomainError{
		Code:    scoring.ErrorCodeInvalidRequest,
		Message: "Idempotency-Key is required and must contain at most 200 characters.",
		Field:   "Idempotency-Key",
		Status:  http.StatusBadRequest,
	}
}

func writeScoringError(c fiber.Ctx, err error) error {
	var domainErr *scoring.DomainError
	if errors.As(err, &domainErr) {
		status := domainErr.Status
		if status == 0 {
			status = http.StatusInternalServerError
		}
		return c.Status(status).JSON(fiber.Map{"error": domainErr})
	}
	return writeTaggingError(c, err)
}
