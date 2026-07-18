package exam

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
)

type Service struct {
	repository *Repository
}

func NewService(repository *Repository) *Service {
	return &Service{repository: repository}
}

func (s *Service) Create(actor uuid.UUID, input CreateInput) (*Detail, error) {
	if err := validateCreateInput(&input); err != nil {
		return nil, err
	}

	var detail *Detail
	err := s.repository.Transaction(func(tx *Repository) error {
		examModel := model.Exam{
			Title:           input.Title,
			Subject:         input.Subject,
			GradeLevel:      input.GradeLevel,
			DurationMinutes: input.DurationMinutes,
			Instructions:    input.Instructions,
			TotalPoints:     input.TotalPoints,
			Status:          ExamStatusDrafting,
			Version:         1,
			CreatedBy:       actor,
		}
		if err := tx.db.Create(&examModel).Error; err != nil {
			return err
		}

		newJSON, err := auditJSON(&examModel)
		if err != nil {
			return err
		}
		if err := tx.AppendAudit(&model.ExamAuditLog{
			ExamID:       examModel.ID,
			Action:       AuditActionCreated,
			ActorID:      actor,
			NewValueJSON: newJSON,
			OccurredAt:   time.Now().UTC(),
		}); err != nil {
			return err
		}
		detail, err = tx.ExamDetail(examModel.ID, actor)
		return err
	})
	return detail, err
}

func (s *Service) List(actor uuid.UUID, filter ListFilter) ([]model.Exam, error) {
	filter.Status = strings.TrimSpace(filter.Status)
	filter.Search = strings.TrimSpace(filter.Search)
	if err := validateListFilter(filter); err != nil {
		return nil, err
	}
	return s.repository.listOwned(actor, filter)
}

func (s *Service) Get(actor, examID uuid.UUID) (*Detail, error) {
	return s.repository.ExamDetail(examID, actor)
}

func (s *Service) Patch(actor, examID uuid.UUID, input PatchInput) (*Detail, error) {
	if err := validatePatchInput(&input); err != nil {
		return nil, err
	}

	var detail *Detail
	err := s.repository.Transaction(func(tx *Repository) error {
		current, err := tx.LockOwnedExam(examID, actor)
		if err != nil {
			return err
		}
		if current.Version != input.ExpectedVersion {
			return versionConflict(input.ExpectedVersion, current.Version)
		}
		if err := requireMutable(current); err != nil {
			return err
		}

		previousJSON, err := auditJSON(current)
		if err != nil {
			return err
		}
		updates := map[string]any{"version": current.Version + 1}
		if input.Title != nil {
			updates["title"] = *input.Title
		}
		if input.DurationMinutes != nil {
			updates["duration_minutes"] = *input.DurationMinutes
		}
		if input.Instructions != nil {
			updates["instructions"] = *input.Instructions
		}
		if input.TotalPoints != nil {
			updates["total_points"] = *input.TotalPoints
		}

		result := tx.db.Model(&model.Exam{}).
			Where("id = ? AND version = ?", current.ID, current.Version).
			Updates(updates)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return tx.latestVersionConflict(current.ID, actor, input.ExpectedVersion)
		}

		updated, err := tx.OwnedExam(current.ID, actor)
		if err != nil {
			return err
		}
		newJSON, err := auditJSON(updated)
		if err != nil {
			return err
		}
		if err := tx.AppendAudit(&model.ExamAuditLog{
			ExamID:            current.ID,
			Action:            AuditActionUpdated,
			ActorID:           actor,
			PreviousValueJSON: previousJSON,
			NewValueJSON:      newJSON,
			OccurredAt:        time.Now().UTC(),
		}); err != nil {
			return err
		}
		detail, err = tx.ExamDetail(current.ID, actor)
		return err
	})
	return detail, err
}

func (s *Service) Delete(actor, examID uuid.UUID, expectedVersion int) error {
	if expectedVersion < 1 {
		return invalidField("expectedVersion", "Expected version must be at least 1.")
	}

	return s.repository.Transaction(func(tx *Repository) error {
		current, err := tx.LockOwnedExam(examID, actor)
		if err != nil {
			return err
		}
		if current.Version != expectedVersion {
			return versionConflict(expectedVersion, current.Version)
		}
		if isLocked(current) {
			return examLocked()
		}
		if current.Status != ExamStatusDrafting {
			return invalidTransition("Only a drafting exam can be deleted.")
		}

		previousJSON, err := auditJSON(current)
		if err != nil {
			return err
		}
		result := tx.db.Model(&model.Exam{}).
			Where("id = ? AND version = ?", current.ID, current.Version).
			Update("version", current.Version+1)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return tx.latestVersionConflict(current.ID, actor, expectedVersion)
		}
		current.Version++

		newJSON, err := auditJSON(current)
		if err != nil {
			return err
		}
		if err := tx.AppendAudit(&model.ExamAuditLog{
			ExamID:            current.ID,
			Action:            AuditActionDeleted,
			ActorID:           actor,
			PreviousValueJSON: previousJSON,
			NewValueJSON:      newJSON,
			OccurredAt:        time.Now().UTC(),
		}); err != nil {
			return err
		}
		return tx.db.Delete(&model.Exam{}, "id = ?", current.ID).Error
	})
}

func (s *Service) Audit(actor, examID uuid.UUID) ([]model.ExamAuditLog, error) {
	return s.repository.auditOwned(actor, examID)
}

func (r *Repository) latestVersionConflict(
	examID, actor uuid.UUID,
	expectedVersion int,
) error {
	current, err := r.OwnedExam(examID, actor)
	if err != nil {
		return err
	}
	return versionConflict(expectedVersion, current.Version)
}

func requireMutable(examModel *model.Exam) error {
	if isLocked(examModel) || examModel.Status == ExamStatusDone {
		return examLocked()
	}
	switch examModel.Status {
	case ExamStatusDrafting, ExamStatusPreparing:
		return nil
	default:
		return &DomainError{
			Code:    ErrorCodeInvalidTransition,
			Message: "Exam status does not permit editing.",
			Status:  http.StatusConflict,
		}
	}
}

func isLocked(examModel *model.Exam) bool {
	return examModel.FirstSubmissionReceivedAt != nil || examModel.LockedSnapshotID != nil
}

func auditJSON(value any) (string, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}
