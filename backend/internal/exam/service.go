package exam

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"backend/internal/model"
	"backend/internal/telemetry"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type Service struct {
	repository *Repository
	exporter   Exporter
	exportDir  string
	publisher  telemetry.Publisher
}

type ServiceOption func(*Service)

func WithTelemetryPublisher(publisher telemetry.Publisher) ServiceOption {
	return func(service *Service) {
		service.publisher = publisher
	}
}

func NewService(repository *Repository, options ...ServiceOption) *Service {
	service := &Service{repository: repository}
	for _, option := range options {
		option(service)
	}
	return service
}

func NewServiceWithExporter(
	repository *Repository,
	exporter Exporter,
	exportDir string,
	options ...ServiceOption,
) *Service {
	service := &Service{
		repository: repository,
		exporter:   exporter,
		exportDir:  exportDir,
	}
	for _, option := range options {
		option(service)
	}
	return service
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
	filter.Subject = strings.TrimSpace(filter.Subject)
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

func (s *Service) ListBankQuestions(filter BankFilter) ([]BankQuestion, error) {
	filter.Subject = strings.TrimSpace(filter.Subject)
	filter.Difficulty = strings.TrimSpace(filter.Difficulty)
	filter.Search = strings.TrimSpace(filter.Search)
	return s.repository.bankQuestions(filter)
}

func (s *Service) GetBankQuestion(questionID uuid.UUID) (*BankQuestion, error) {
	if questionID == uuid.Nil {
		return nil, questionError(
			ErrorCodeQuestionNotFound, "", "Question does not exist.", http.StatusNotFound,
		)
	}
	return s.repository.bankQuestion(questionID)
}

func (s *Service) ListTopics(subject string) ([]model.Node, error) {
	subject = strings.TrimSpace(subject)
	if subject == "" {
		return nil, invalidField("subject", "Subject is required.")
	}
	return s.repository.topics(subject)
}

func (s *Service) AddBankQuestion(
	actor, examID uuid.UUID,
	input AddBankQuestionInput,
) (*Detail, error) {
	if input.QuestionID == uuid.Nil {
		return nil, invalidField("questionId", "Question ID is required.")
	}
	if err := validateQuestionPoints(input.Points); err != nil {
		return nil, err
	}
	if err := validateExpectedVersion(input.ExpectedVersion); err != nil {
		return nil, err
	}

	var detail *Detail
	err := s.repository.Transaction(func(tx *Repository) error {
		current, err := lockMutableVersion(tx, actor, examID, input.ExpectedVersion)
		if err != nil {
			return err
		}
		source, err := tx.bankQuestion(input.QuestionID)
		if err != nil {
			return err
		}
		if source.Subject != current.Subject {
			return topicNotAllowed()
		}
		choicesJSON, err := json.Marshal(source.Choices)
		if err != nil {
			return err
		}
		topicsJSON, err := json.Marshal([]uuid.UUID{source.NodeID})
		if err != nil {
			return err
		}
		position, err := tx.nextQuestionPosition(current.ID)
		if err != nil {
			return err
		}
		question := model.ExamQuestion{
			ExamID: current.ID, SourceType: QuestionSourceBank,
			SourceQuestionID: &source.ID, QuestionType: QuestionTypeSingleChoice,
			Content: source.Content, Points: input.Points, Position: position,
			ChoicesJSON: string(choicesJSON), CorrectChoiceID: source.CorrectChoiceID,
			TopicNodeIDsJSON: string(topicsJSON),
		}
		if err := tx.db.Create(&question).Error; err != nil {
			return err
		}
		if err := tx.bumpExamVersion(current, input.ExpectedVersion); err != nil {
			return err
		}
		detail, err = tx.ExamDetail(current.ID, actor)
		return err
	})
	return detail, err
}

func (s *Service) AddManualQuestion(
	actor, examID uuid.UUID,
	input ManualQuestionInput,
) (*Detail, error) {
	if err := validateManualQuestionInput(&input); err != nil {
		return nil, err
	}

	var detail *Detail
	err := s.repository.Transaction(func(tx *Repository) error {
		current, err := lockMutableVersion(tx, actor, examID, input.ExpectedVersion)
		if err != nil {
			return err
		}
		if err := tx.requireAllowedTopics(current.Subject, input.TopicNodeIDs); err != nil {
			return err
		}
		position, err := tx.nextQuestionPosition(current.ID)
		if err != nil {
			return err
		}
		question, err := examQuestionFromManual(current.ID, position, input)
		if err != nil {
			return err
		}
		if err := tx.db.Create(&question).Error; err != nil {
			return err
		}
		if err := tx.bumpExamVersion(current, input.ExpectedVersion); err != nil {
			return err
		}
		detail, err = tx.ExamDetail(current.ID, actor)
		return err
	})
	return detail, err
}

func (s *Service) PatchQuestion(
	actor, examID, questionID uuid.UUID,
	input ManualQuestionInput,
) (*Detail, error) {
	if err := validateExpectedVersion(input.ExpectedVersion); err != nil {
		return nil, err
	}

	var detail *Detail
	err := s.repository.Transaction(func(tx *Repository) error {
		current, err := lockMutableVersion(tx, actor, examID, input.ExpectedVersion)
		if err != nil {
			return err
		}
		stored, err := tx.examQuestion(current.ID, questionID)
		if err != nil {
			return err
		}
		if stored.SourceType == QuestionSourceBank {
			if input.TopicNodeIDs != nil {
				return questionError(
					ErrorCodeBankTopicImmutable, "topicNodeIds",
					"Topics on a bank-sourced question cannot be changed.",
					http.StatusConflict,
				)
			}
			decoded, err := decodeQuestionDetail(*stored)
			if err != nil {
				return err
			}
			input.TopicNodeIDs = decoded.TopicNodeIDs
		}
		if err := validateManualQuestionInput(&input); err != nil {
			return err
		}
		if err := tx.requireAllowedTopics(current.Subject, input.TopicNodeIDs); err != nil {
			return err
		}
		replacement, err := examQuestionFromManual(current.ID, stored.Position, input)
		if err != nil {
			return err
		}
		updates := map[string]any{
			"question_type":       replacement.QuestionType,
			"content":             replacement.Content,
			"points":              replacement.Points,
			"choices_json":        replacement.ChoicesJSON,
			"correct_choice_id":   replacement.CorrectChoiceID,
			"topic_node_ids_json": replacement.TopicNodeIDsJSON,
		}
		if err := tx.db.Model(stored).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.bumpExamVersion(current, input.ExpectedVersion); err != nil {
			return err
		}
		detail, err = tx.ExamDetail(current.ID, actor)
		return err
	})
	return detail, err
}

func (s *Service) DeleteQuestion(
	actor, examID, questionID uuid.UUID,
	expectedVersion int,
) (*Detail, error) {
	if err := validateExpectedVersion(expectedVersion); err != nil {
		return nil, err
	}

	var detail *Detail
	err := s.repository.Transaction(func(tx *Repository) error {
		current, err := lockMutableVersion(tx, actor, examID, expectedVersion)
		if err != nil {
			return err
		}
		stored, err := tx.examQuestion(current.ID, questionID)
		if err != nil {
			return err
		}
		if err := tx.db.Delete(stored).Error; err != nil {
			return err
		}
		if err := tx.db.Model(&model.ExamQuestion{}).
			Where("exam_id = ? AND position > ?", current.ID, stored.Position).
			Update("position", gorm.Expr("position - 1")).Error; err != nil {
			return err
		}
		if err := tx.bumpExamVersion(current, expectedVersion); err != nil {
			return err
		}
		detail, err = tx.ExamDetail(current.ID, actor)
		return err
	})
	return detail, err
}

func (s *Service) ReorderQuestions(
	actor, examID uuid.UUID,
	input ReorderQuestionsInput,
) (*Detail, error) {
	if err := validateExpectedVersion(input.ExpectedVersion); err != nil {
		return nil, err
	}

	var detail *Detail
	err := s.repository.Transaction(func(tx *Repository) error {
		current, err := lockMutableVersion(tx, actor, examID, input.ExpectedVersion)
		if err != nil {
			return err
		}
		var stored []model.ExamQuestion
		if err := tx.db.Where("exam_id = ?", current.ID).
			Order("position ASC").Find(&stored).Error; err != nil {
			return err
		}
		if !sameQuestionSet(stored, input.ExamQuestionIDs) {
			return questionError(
				ErrorCodeInvalidQuestionOrder, "examQuestionIds",
				"Question order must contain every exam question exactly once.",
				http.StatusBadRequest,
			)
		}
		if len(stored) > 0 {
			if err := tx.db.Model(&model.ExamQuestion{}).
				Where("exam_id = ?", current.ID).
				Update("position", gorm.Expr("position + 100000")).Error; err != nil {
				return err
			}
			for position, id := range input.ExamQuestionIDs {
				if err := tx.db.Model(&model.ExamQuestion{}).
					Where("exam_id = ? AND id = ?", current.ID, id).
					Update("position", position).Error; err != nil {
					return err
				}
			}
		}
		if err := tx.bumpExamVersion(current, input.ExpectedVersion); err != nil {
			return err
		}
		detail, err = tx.ExamDetail(current.ID, actor)
		return err
	})
	return detail, err
}

func (s *Service) AddRubricItem(
	actor, examID, questionID uuid.UUID,
	input RubricItemInput,
) (*Detail, error) {
	if err := validateRubricItemInput(&input); err != nil {
		return nil, err
	}

	var detail *Detail
	err := s.repository.Transaction(func(tx *Repository) error {
		current, question, err := lockEssayQuestion(
			tx, actor, examID, questionID, input.ExpectedVersion,
		)
		if err != nil {
			return err
		}
		if err := tx.requireAllowedTopics(current.Subject, input.TopicNodeIDs); err != nil {
			return err
		}
		position, err := tx.nextRubricPosition(question.ID)
		if err != nil {
			return err
		}
		topicsJSON, err := json.Marshal(input.TopicNodeIDs)
		if err != nil {
			return err
		}
		rubric := model.ExamRubricItem{
			ExamQuestionID: question.ID, Description: input.Description,
			Points: input.Points, Position: position, TopicNodeIDsJSON: string(topicsJSON),
		}
		if err := tx.db.Create(&rubric).Error; err != nil {
			return err
		}
		if err := tx.bumpExamVersion(current, input.ExpectedVersion); err != nil {
			return err
		}
		detail, err = tx.ExamDetail(current.ID, actor)
		return err
	})
	return detail, err
}

func (s *Service) PatchRubricItem(
	actor, examID, questionID, rubricID uuid.UUID,
	input PatchRubricItemInput,
) (*Detail, error) {
	if err := validatePatchRubricItemInput(&input); err != nil {
		return nil, err
	}

	var detail *Detail
	err := s.repository.Transaction(func(tx *Repository) error {
		current, question, err := lockEssayQuestion(
			tx, actor, examID, questionID, input.ExpectedVersion,
		)
		if err != nil {
			return err
		}
		rubric, err := tx.rubricItem(question.ID, rubricID)
		if err != nil {
			return err
		}
		updates := make(map[string]any)
		if input.Description != nil {
			updates["description"] = *input.Description
		}
		if input.Points != nil {
			updates["points"] = *input.Points
		}
		if input.TopicNodeIDs != nil {
			if err := tx.requireAllowedTopics(current.Subject, input.TopicNodeIDs); err != nil {
				return err
			}
			topicsJSON, err := json.Marshal(input.TopicNodeIDs)
			if err != nil {
				return err
			}
			updates["topic_node_ids_json"] = string(topicsJSON)
		}
		if err := tx.db.Model(rubric).Updates(updates).Error; err != nil {
			return err
		}
		if err := tx.bumpExamVersion(current, input.ExpectedVersion); err != nil {
			return err
		}
		detail, err = tx.ExamDetail(current.ID, actor)
		return err
	})
	return detail, err
}

func (s *Service) DeleteRubricItem(
	actor, examID, questionID, rubricID uuid.UUID,
	expectedVersion int,
) (*Detail, error) {
	if err := validateExpectedVersion(expectedVersion); err != nil {
		return nil, err
	}

	var detail *Detail
	err := s.repository.Transaction(func(tx *Repository) error {
		current, question, err := lockEssayQuestion(
			tx, actor, examID, questionID, expectedVersion,
		)
		if err != nil {
			return err
		}
		rubric, err := tx.rubricItem(question.ID, rubricID)
		if err != nil {
			return err
		}
		if err := tx.db.Delete(rubric).Error; err != nil {
			return err
		}
		if err := tx.db.Model(&model.ExamRubricItem{}).
			Where("exam_question_id = ? AND position > ?", question.ID, rubric.Position).
			Update("position", gorm.Expr("position - 1")).Error; err != nil {
			return err
		}
		if err := tx.bumpExamVersion(current, expectedVersion); err != nil {
			return err
		}
		detail, err = tx.ExamDetail(current.ID, actor)
		return err
	})
	return detail, err
}

func (s *Service) ReorderRubricItems(
	actor, examID, questionID uuid.UUID,
	input ReorderRubricItemsInput,
) (*Detail, error) {
	if err := validateExpectedVersion(input.ExpectedVersion); err != nil {
		return nil, err
	}

	var detail *Detail
	err := s.repository.Transaction(func(tx *Repository) error {
		current, question, err := lockEssayQuestion(
			tx, actor, examID, questionID, input.ExpectedVersion,
		)
		if err != nil {
			return err
		}
		var stored []model.ExamRubricItem
		if err := tx.db.Where("exam_question_id = ?", question.ID).
			Order("position ASC").Find(&stored).Error; err != nil {
			return err
		}
		if !sameRubricSet(stored, input.RubricItemIDs) {
			return questionError(
				ErrorCodeInvalidRubricOrder, "rubricItemIds",
				"Rubric order must contain every rubric item exactly once.",
				http.StatusBadRequest,
			)
		}
		if len(stored) > 0 {
			if err := tx.db.Model(&model.ExamRubricItem{}).
				Where("exam_question_id = ?", question.ID).
				Update("position", gorm.Expr("position + 100000")).Error; err != nil {
				return err
			}
			for position, id := range input.RubricItemIDs {
				if err := tx.db.Model(&model.ExamRubricItem{}).
					Where("exam_question_id = ? AND id = ?", question.ID, id).
					Update("position", position).Error; err != nil {
					return err
				}
			}
		}
		if err := tx.bumpExamVersion(current, input.ExpectedVersion); err != nil {
			return err
		}
		detail, err = tx.ExamDetail(current.ID, actor)
		return err
	})
	return detail, err
}

func (s *Service) Validate(actor, examID uuid.UUID) (ValidationResult, error) {
	detail, err := s.repository.ExamDetail(examID, actor)
	if err != nil {
		return ValidationResult{}, err
	}
	topics, err := s.repository.topicLookup(detailTopicIDs(*detail))
	if err != nil {
		return ValidationResult{}, err
	}
	errors := ValidateDetail(*detail, topics)
	return ValidationResult{Valid: len(errors) == 0, Errors: errors}, nil
}

func (s *Service) Prepare(
	actor, examID uuid.UUID,
	input VersionInput,
) (*Detail, error) {
	return s.transition(actor, examID, input, ExamStatusPreparing)
}

func (s *Service) ReturnToDraft(
	actor, examID uuid.UUID,
	input VersionInput,
) (*Detail, error) {
	return s.transition(actor, examID, input, ExamStatusDrafting)
}

func (s *Service) transition(
	actor, examID uuid.UUID,
	input VersionInput,
	target string,
) (*Detail, error) {
	if err := validateExpectedVersion(input.ExpectedVersion); err != nil {
		return nil, err
	}

	var detail *Detail
	err := s.repository.Transaction(func(tx *Repository) error {
		current, err := lockMutableVersion(tx, actor, examID, input.ExpectedVersion)
		if err != nil {
			return err
		}
		switch target {
		case ExamStatusPreparing:
			if current.Status != ExamStatusDrafting {
				return invalidTransition("Only a drafting exam can be prepared.")
			}
			currentDetail, err := tx.ExamDetail(current.ID, actor)
			if err != nil {
				return err
			}
			topics, err := tx.topicLookup(detailTopicIDs(*currentDetail))
			if err != nil {
				return err
			}
			validationErrors := ValidateDetail(*currentDetail, topics)
			if len(validationErrors) != 0 {
				return &DomainError{
					Code: ErrorCodeExamInvalid, Message: "Exam must be valid before preparing.",
					Status: http.StatusUnprocessableEntity,
					Meta:   map[string]any{"errors": validationErrors},
				}
			}
		case ExamStatusDrafting:
			if current.Status != ExamStatusPreparing {
				return invalidTransition("Only an unlocked preparing exam can return to drafting.")
			}
		default:
			return invalidTransition("Exam transition is not supported.")
		}

		result := tx.db.Model(&model.Exam{}).
			Where("id = ? AND version = ?", current.ID, current.Version).
			Updates(map[string]any{"status": target, "version": current.Version + 1})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return tx.latestVersionConflict(current.ID, actor, input.ExpectedVersion)
		}
		detail, err = tx.ExamDetail(current.ID, actor)
		return err
	})
	return detail, err
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

func lockMutableVersion(
	tx *Repository,
	actor, examID uuid.UUID,
	expectedVersion int,
) (*model.Exam, error) {
	current, err := tx.LockOwnedExam(examID, actor)
	if err != nil {
		return nil, err
	}
	if current.Version != expectedVersion {
		return nil, versionConflict(expectedVersion, current.Version)
	}
	if err := requireMutable(current); err != nil {
		return nil, err
	}
	return current, nil
}

func (r *Repository) nextQuestionPosition(examID uuid.UUID) (int, error) {
	var next int
	err := r.db.Model(&model.ExamQuestion{}).
		Select("COALESCE(MAX(position), -1) + 1").
		Where("exam_id = ?", examID).
		Scan(&next).Error
	return next, err
}

func (r *Repository) nextRubricPosition(questionID uuid.UUID) (int, error) {
	var next int
	err := r.db.Model(&model.ExamRubricItem{}).
		Select("COALESCE(MAX(position), -1) + 1").
		Where("exam_question_id = ?", questionID).
		Scan(&next).Error
	return next, err
}

func (r *Repository) requireAllowedTopics(subject string, ids []uuid.UUID) error {
	allowed, err := r.topicsAllowed(subject, ids)
	if err != nil {
		return err
	}
	if !allowed {
		return topicNotAllowed()
	}
	return nil
}

func (r *Repository) bumpExamVersion(current *model.Exam, expectedVersion int) error {
	result := r.db.Model(&model.Exam{}).
		Where("id = ? AND version = ?", current.ID, current.Version).
		Update("version", current.Version+1)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return r.latestVersionConflict(current.ID, current.CreatedBy, expectedVersion)
	}
	current.Version++
	return nil
}

func examQuestionFromManual(
	examID uuid.UUID,
	position int,
	input ManualQuestionInput,
) (model.ExamQuestion, error) {
	choicesJSON, err := json.Marshal(input.Choices)
	if err != nil {
		return model.ExamQuestion{}, err
	}
	topicsJSON, err := json.Marshal(input.TopicNodeIDs)
	if err != nil {
		return model.ExamQuestion{}, err
	}
	return model.ExamQuestion{
		ExamID: examID, SourceType: QuestionSourceManual,
		QuestionType: input.QuestionType, Content: input.Content,
		Points: input.Points, Position: position,
		ChoicesJSON: string(choicesJSON), CorrectChoiceID: input.CorrectChoiceID,
		TopicNodeIDsJSON: string(topicsJSON),
	}, nil
}

func sameQuestionSet(stored []model.ExamQuestion, requested []uuid.UUID) bool {
	if len(stored) != len(requested) {
		return false
	}
	remaining := make(map[uuid.UUID]struct{}, len(stored))
	for _, question := range stored {
		remaining[question.ID] = struct{}{}
	}
	for _, id := range requested {
		if _, exists := remaining[id]; !exists {
			return false
		}
		delete(remaining, id)
	}
	return len(remaining) == 0
}

func sameRubricSet(stored []model.ExamRubricItem, requested []uuid.UUID) bool {
	if len(stored) != len(requested) {
		return false
	}
	remaining := make(map[uuid.UUID]struct{}, len(stored))
	for _, rubric := range stored {
		remaining[rubric.ID] = struct{}{}
	}
	for _, id := range requested {
		if _, exists := remaining[id]; !exists {
			return false
		}
		delete(remaining, id)
	}
	return len(remaining) == 0
}

func lockEssayQuestion(
	tx *Repository,
	actor, examID, questionID uuid.UUID,
	expectedVersion int,
) (*model.Exam, *model.ExamQuestion, error) {
	current, err := lockMutableVersion(tx, actor, examID, expectedVersion)
	if err != nil {
		return nil, nil, err
	}
	question, err := tx.examQuestion(current.ID, questionID)
	if err != nil {
		return nil, nil, err
	}
	if question.QuestionType != QuestionTypeEssay {
		return nil, nil, questionError(
			ErrorCodeRubricNotAllowed, "questionType",
			"Only essay questions can have rubric items.", http.StatusConflict,
		)
	}
	return current, question, nil
}

func detailTopicIDs(detail Detail) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{})
	for _, question := range detail.Questions {
		for _, id := range question.TopicNodeIDs {
			seen[id] = struct{}{}
		}
		for _, rubric := range question.RubricItems {
			for _, id := range rubric.TopicNodeIDs {
				seen[id] = struct{}{}
			}
		}
	}
	ids := make([]uuid.UUID, 0, len(seen))
	for id := range seen {
		ids = append(ids, id)
	}
	return ids
}

func topicNotAllowed() *DomainError {
	return questionError(
		ErrorCodeTopicNotAllowed, "topicNodeIds",
		"Every topic must belong to the exam subject.", http.StatusBadRequest,
	)
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
