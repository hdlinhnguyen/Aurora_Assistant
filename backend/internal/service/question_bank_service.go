package service

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type QuestionBankService struct {
	db *gorm.DB
}

type QuestionBankQuestionInput struct {
	NodeID        uuid.UUID `json:"nodeId"`
	Content       string    `json:"content"`
	Options       []string  `json:"options"`
	CorrectOption int       `json:"correctOption"`
	Difficulty    string    `json:"difficulty"`
	QuestionType  string    `json:"questionType"`
	GradeLevel    string    `json:"gradeLevel"`
}

type QuestionBankQuestionUpdate struct {
	NodeID        *uuid.UUID `json:"nodeId"`
	Content       *string    `json:"content"`
	Options       *[]string  `json:"options"`
	CorrectOption *int       `json:"correctOption"`
	Difficulty    *string    `json:"difficulty"`
	QuestionType  *string    `json:"questionType"`
	GradeLevel    *string    `json:"gradeLevel"`
}

type QuestionBankFilters struct {
	Subject      string
	NodeID       *uuid.UUID
	QuestionType string
	Difficulty   string
	Search       string
}

type QuestionBankQuestionView struct {
	model.Question
	Subject     string                     `json:"subject"`
	NodeName    string                     `json:"nodeName"`
	RubricItems []model.QuestionRubricItem `json:"rubricItems"`
}

type RubricItemInput struct {
	Content string      `json:"content"`
	Points  model.Score `json:"points"`
}

func NewQuestionBankService(db *gorm.DB) *QuestionBankService {
	return &QuestionBankService{db: db}
}

func (s *QuestionBankService) ListQuestions(filters QuestionBankFilters) ([]QuestionBankQuestionView, error) {
	type row struct {
		model.Question
		Subject  string
		NodeName string
	}
	query := s.db.Table("questions").
		Select("questions.*, nodes.subject, nodes.name AS node_name").
		Joins("JOIN nodes ON nodes.id = questions.node_id").
		Where("questions.deleted_at IS NULL AND nodes.deleted_at IS NULL")
	if filters.Subject != "" {
		query = query.Where("nodes.subject = ?", filters.Subject)
	}
	if filters.NodeID != nil {
		query = query.Where("questions.node_id = ?", *filters.NodeID)
	}
	if filters.QuestionType != "" {
		query = query.Where("questions.question_type = ?", filters.QuestionType)
	}
	if filters.Difficulty != "" {
		query = query.Where("questions.difficulty = ?", filters.Difficulty)
	}
	if filters.Search != "" {
		query = query.Where("questions.content ILIKE ?", "%"+filters.Search+"%")
	}
	var rows []row
	if err := query.Order("questions.created_at ASC").Scan(&rows).Error; err != nil {
		return nil, err
	}
	views := make([]QuestionBankQuestionView, 0, len(rows))
	for _, item := range rows {
		view := QuestionBankQuestionView{
			Question: item.Question,
			Subject:  item.Subject,
			NodeName: item.NodeName,
		}
		if item.QuestionType == "essay" {
			if err := s.db.Where("question_id = ?", item.ID).
				Order("position ASC, id ASC").
				Find(&view.RubricItems).Error; err != nil {
				return nil, err
			}
		}
		views = append(views, view)
	}
	return views, nil
}

func (s *QuestionBankService) GetQuestion(questionID uuid.UUID) (*QuestionBankQuestionView, error) {
	views, err := s.ListQuestions(QuestionBankFilters{})
	if err != nil {
		return nil, err
	}
	for _, view := range views {
		if view.ID == questionID {
			copy := view
			return &copy, nil
		}
	}
	return nil, &DomainError{Code: "question_not_found", Message: "Question does not exist."}
}

func (s *QuestionBankService) CreateQuestion(input QuestionBankQuestionInput) (*model.Question, error) {
	question, err := buildQuestion(input)
	if err != nil {
		return nil, err
	}
	var nodeCount int64
	if err := s.db.Model(&model.Node{}).Where("id = ?", input.NodeID).Count(&nodeCount).Error; err != nil {
		return nil, err
	}
	if nodeCount != 1 {
		return nil, &DomainError{Code: "topic_not_found", Message: "Source topic does not exist."}
	}
	question.ID = uuid.New()
	question.CreatedAt = time.Now().UTC()
	question.UpdatedAt = question.CreatedAt
	if err := s.db.Create(question).Error; err != nil {
		return nil, err
	}
	return question, nil
}

func (s *QuestionBankService) UpdateQuestion(
	questionID uuid.UUID,
	update QuestionBankQuestionUpdate,
) (*model.Question, error) {
	var updated *model.Question
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var question model.Question
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&question, "id = ?", questionID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &DomainError{Code: "question_not_found", Message: "Question does not exist."}
			}
			return err
		}
		if update.QuestionType != nil && *update.QuestionType == "multiple_choice" &&
			question.QuestionType == "essay" {
			var rubricCount int64
			if err := tx.Model(&model.QuestionRubricItem{}).
				Where("question_id = ?", questionID).
				Count(&rubricCount).Error; err != nil {
				return err
			}
			if rubricCount > 0 {
				return &DomainError{
					Code:    "rubric_items_exist",
					Message: "Remove essay rubric items before changing the question type.",
				}
			}
		}

		input := QuestionBankQuestionInput{
			NodeID:        question.NodeID,
			Content:       question.Content,
			CorrectOption: question.CorrectOption,
			Difficulty:    question.Difficulty,
			QuestionType:  question.QuestionType,
			GradeLevel:    question.GradeLevel,
		}
		_ = json.Unmarshal([]byte(question.OptionsJSON), &input.Options)
		if update.NodeID != nil {
			input.NodeID = *update.NodeID
		}
		if update.Content != nil {
			input.Content = *update.Content
		}
		if update.Options != nil {
			input.Options = *update.Options
		}
		if update.CorrectOption != nil {
			input.CorrectOption = *update.CorrectOption
		}
		if update.Difficulty != nil {
			input.Difficulty = *update.Difficulty
		}
		if update.QuestionType != nil {
			input.QuestionType = *update.QuestionType
		}
		if update.GradeLevel != nil {
			input.GradeLevel = *update.GradeLevel
		}
		if update.NodeID != nil {
			if err := validateQuestionSourceChange(tx, questionID, input.NodeID); err != nil {
				return err
			}
		}
		replacement, err := buildQuestion(input)
		if err != nil {
			return err
		}
		replacement.UpdatedAt = time.Now().UTC()
		if err := tx.Model(&question).Updates(map[string]any{
			"node_id":        replacement.NodeID,
			"content":        replacement.Content,
			"options_json":   replacement.OptionsJSON,
			"correct_option": replacement.CorrectOption,
			"difficulty":     replacement.Difficulty,
			"question_type":  replacement.QuestionType,
			"grade_level":    replacement.GradeLevel,
			"updated_at":     replacement.UpdatedAt,
		}).Error; err != nil {
			return err
		}
		if err := tx.First(&question, "id = ?", questionID).Error; err != nil {
			return err
		}
		updated = &question
		return nil
	})
	return updated, err
}

func validateQuestionSourceChange(
	tx *gorm.DB,
	questionID uuid.UUID,
	nodeID uuid.UUID,
) error {
	var target model.Node
	targetResult := tx.Clauses(clause.Locking{Strength: "SHARE"}).
		Where("id = ?", nodeID).
		Limit(1).
		Find(&target)
	if targetResult.Error != nil {
		return targetResult.Error
	}
	if targetResult.RowsAffected != 1 {
		return &DomainError{
			Code:    "topic_not_found",
			Message: "Source topic does not exist.",
		}
	}

	var mismatchedMappings int64
	if err := tx.Table("question_topic_mappings AS mapping").
		Joins("LEFT JOIN nodes ON nodes.id = mapping.node_id").
		Where("mapping.question_id = ?", questionID).
		Where("nodes.id IS NULL OR nodes.deleted_at IS NOT NULL OR nodes.subject <> ?", target.Subject).
		Count(&mismatchedMappings).Error; err != nil {
		return err
	}
	if mismatchedMappings == 0 {
		if err := tx.Table("question_rubric_item_topic_mappings AS mapping").
			Joins("JOIN question_rubric_items AS rubric ON rubric.id = mapping.rubric_item_id").
			Joins("LEFT JOIN nodes ON nodes.id = mapping.node_id").
			Where("rubric.question_id = ?", questionID).
			Where("nodes.id IS NULL OR nodes.deleted_at IS NOT NULL OR nodes.subject <> ?", target.Subject).
			Count(&mismatchedMappings).Error; err != nil {
			return err
		}
	}
	if mismatchedMappings > 0 {
		return &DomainError{
			Code:    "topic_subject_mismatch",
			Message: "Existing question tags must belong to the source topic subject.",
			Details: map[string]any{"expectedSubject": target.Subject},
		}
	}
	return nil
}

func (s *QuestionBankService) DeleteQuestion(questionID uuid.UUID) error {
	result := s.db.Where("id = ?", questionID).Delete(&model.Question{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return &DomainError{Code: "question_not_found", Message: "Question does not exist."}
	}
	return nil
}

func (s *QuestionBankService) CreateRubricItem(
	questionID uuid.UUID,
	input RubricItemInput,
) (*model.QuestionRubricItem, error) {
	if strings.TrimSpace(input.Content) == "" || !input.Points.GreaterThan(model.MustScore("0").Decimal) {
		return nil, &DomainError{Code: "invalid_rubric_item", Message: "Rubric content and positive points are required."}
	}

	var item model.QuestionRubricItem
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := lockEssayQuestion(tx, questionID); err != nil {
			return err
		}

		var maxPosition *int
		if err := tx.Model(&model.QuestionRubricItem{}).
			Where("question_id = ?", questionID).
			Select("MAX(position)").
			Scan(&maxPosition).Error; err != nil {
			return err
		}
		position := 0
		if maxPosition != nil {
			position = *maxPosition + 1
		}
		item = model.QuestionRubricItem{
			ID:         uuid.New(),
			QuestionID: questionID,
			Content:    strings.TrimSpace(input.Content),
			Points:     input.Points,
			Position:   position,
		}
		return tx.Create(&item).Error
	})
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *QuestionBankService) UpdateRubricItem(
	questionID uuid.UUID,
	rubricItemID uuid.UUID,
	input RubricItemInput,
) (*model.QuestionRubricItem, error) {
	if strings.TrimSpace(input.Content) == "" || !input.Points.GreaterThan(model.MustScore("0").Decimal) {
		return nil, &DomainError{Code: "invalid_rubric_item", Message: "Rubric content and positive points are required."}
	}
	var item model.QuestionRubricItem
	err := s.db.Transaction(func(tx *gorm.DB) error {
		if err := lockEssayQuestion(tx, questionID); err != nil {
			return err
		}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&item, "id = ? AND question_id = ?", rubricItemID, questionID).Error; err != nil {
			return &DomainError{Code: "rubric_item_not_found", Message: "Rubric item does not exist."}
		}
		return tx.Model(&item).Updates(map[string]any{
			"content":    strings.TrimSpace(input.Content),
			"points":     input.Points,
			"updated_at": time.Now().UTC(),
		}).Error
	})
	if err != nil {
		return nil, err
	}
	return &item, nil
}

func (s *QuestionBankService) DeleteRubricItem(questionID, rubricItemID uuid.UUID) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := lockEssayQuestion(tx, questionID); err != nil {
			return err
		}
		result := tx.Where("id = ? AND question_id = ?", rubricItemID, questionID).
			Delete(&model.QuestionRubricItem{})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return &DomainError{Code: "rubric_item_not_found", Message: "Rubric item does not exist."}
		}
		return nil
	})
}

func (s *QuestionBankService) ReorderRubricItems(
	questionID uuid.UUID,
	orderedIDs []uuid.UUID,
) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := lockEssayQuestion(tx, questionID); err != nil {
			return err
		}
		var existing []uuid.UUID
		if err := tx.Model(&model.QuestionRubricItem{}).
			Where("question_id = ?", questionID).
			Order("position ASC").
			Pluck("id", &existing).Error; err != nil {
			return err
		}
		if len(existing) != len(orderedIDs) {
			return &DomainError{Code: "invalid_rubric_order", Message: "Rubric order must contain every item exactly once."}
		}
		expected := make(map[uuid.UUID]struct{}, len(existing))
		for _, id := range existing {
			expected[id] = struct{}{}
		}
		for _, id := range orderedIDs {
			if _, ok := expected[id]; !ok {
				return &DomainError{Code: "invalid_rubric_order", Message: "Rubric order contains an unknown or duplicate item."}
			}
			delete(expected, id)
		}
		for position, id := range orderedIDs {
			if err := tx.Model(&model.QuestionRubricItem{}).
				Where("id = ? AND question_id = ?", id, questionID).
				Update("position", -(position + 1)).Error; err != nil {
				return err
			}
		}
		for position, id := range orderedIDs {
			if err := tx.Model(&model.QuestionRubricItem{}).
				Where("id = ? AND question_id = ?", id, questionID).
				Update("position", position).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func lockEssayQuestion(tx *gorm.DB, questionID uuid.UUID) error {
	var question model.Question
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&question, "id = ?", questionID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &DomainError{Code: "question_not_found", Message: "Question does not exist."}
		}
		return err
	}
	if question.QuestionType != "essay" {
		return &DomainError{Code: "invalid_question_type", Message: "Rubric items require an essay question."}
	}
	return nil
}

func buildQuestion(input QuestionBankQuestionInput) (*model.Question, error) {
	input.Content = strings.TrimSpace(input.Content)
	input.Difficulty = strings.TrimSpace(input.Difficulty)
	input.QuestionType = strings.TrimSpace(input.QuestionType)
	input.GradeLevel = strings.TrimSpace(input.GradeLevel)
	if input.Content == "" || input.NodeID == uuid.Nil {
		return nil, &DomainError{Code: "request_validation_error", Message: "Question content and source topic are required."}
	}
	if input.Difficulty == "" {
		input.Difficulty = "medium"
	}
	if input.QuestionType == "" {
		input.QuestionType = "multiple_choice"
	}
	if input.QuestionType != "multiple_choice" && input.QuestionType != "essay" {
		return nil, &DomainError{Code: "invalid_question_type", Message: "Question type must be multiple_choice or essay."}
	}
	optionsJSON := "[]"
	correctOption := -1
	if input.QuestionType == "multiple_choice" {
		if len(input.Options) < 2 || input.CorrectOption < 0 || input.CorrectOption >= len(input.Options) {
			return nil, &DomainError{Code: "invalid_choice_set", Message: "Multiple-choice questions require at least two options and a valid answer."}
		}
		for index := range input.Options {
			input.Options[index] = strings.TrimSpace(input.Options[index])
			if input.Options[index] == "" {
				return nil, &DomainError{Code: "invalid_choice_set", Message: "Question options cannot be blank."}
			}
		}
		encoded, err := json.Marshal(input.Options)
		if err != nil {
			return nil, err
		}
		optionsJSON = string(encoded)
		correctOption = input.CorrectOption
	}
	return &model.Question{
		NodeID:        input.NodeID,
		Content:       input.Content,
		OptionsJSON:   optionsJSON,
		CorrectOption: correctOption,
		Difficulty:    input.Difficulty,
		QuestionType:  input.QuestionType,
		GradeLevel:    input.GradeLevel,
	}, nil
}
