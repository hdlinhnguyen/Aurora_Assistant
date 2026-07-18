package service

import (
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type DomainError struct {
	Code    string
	Message string
	Details map[string]any
}

func (e *DomainError) Error() string {
	return e.Message
}

type VersionConflict struct {
	*DomainError
	LatestContext *TaggingContext
}

type QuestionSummary struct {
	ID           uuid.UUID `json:"id"`
	NodeID       uuid.UUID `json:"nodeId"`
	Content      string    `json:"content"`
	Subject      string    `json:"subject"`
	GradeLevel   string    `json:"gradeLevel"`
	QuestionType string    `json:"questionType"`
}

type RubricTaggingItem struct {
	ID       uuid.UUID   `json:"id"`
	Content  string      `json:"content"`
	Position int         `json:"position"`
	TopicIDs []uuid.UUID `json:"topicIds"`
}

type TaggingContext struct {
	Question        QuestionSummary     `json:"question"`
	RubricItems     []RubricTaggingItem `json:"rubricItems"`
	AvailableTopics []model.Node        `json:"availableTopics"`
	DirectTopicIDs  []uuid.UUID         `json:"directTopicIds"`
	EffectiveTopics []model.Node        `json:"effectiveTopics"`
	Version         int                 `json:"version"`
	UpdatedBy       *uuid.UUID          `json:"updatedBy"`
	UpdatedAt       time.Time           `json:"updatedAt"`
}

type EffectiveQuestionTopics struct {
	QuestionID uuid.UUID   `json:"questionId"`
	Subject    string      `json:"subject"`
	TopicIDs   []uuid.UUID `json:"topicIds"`
	Version    int         `json:"version"`
	UpdatedAt  time.Time   `json:"updatedAt"`
}

type QuestionRubricSnapshot struct {
	ID       uuid.UUID   `json:"id"`
	Content  string      `json:"content"`
	Points   model.Score `json:"points"`
	Position int         `json:"position"`
	TopicIDs []uuid.UUID `json:"topicIds"`
}

type QuestionTaggingSnapshot struct {
	Question          model.Question           `json:"question"`
	Subject           string                   `json:"subject"`
	RubricItems       []QuestionRubricSnapshot `json:"rubricItems"`
	DirectTopicIDs    []uuid.UUID              `json:"directTopicIds"`
	EffectiveTopicIDs []uuid.UUID              `json:"effectiveTopicIds"`
	TaggingVersion    int                      `json:"taggingVersion"`
	UpdatedBy         *uuid.UUID               `json:"updatedBy"`
	UpdatedAt         time.Time                `json:"updatedAt"`
}

type TaggingService struct {
	db *gorm.DB
}

func NewTaggingService(db *gorm.DB) *TaggingService {
	return &TaggingService{db: db}
}

func (s *TaggingService) GetContext(questionID uuid.UUID) (*TaggingContext, error) {
	var context *TaggingContext
	err := s.db.Transaction(func(tx *gorm.DB) error {
		var err error
		context, err = s.getContext(tx, questionID)
		return err
	}, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  true,
	})
	return context, err
}

func (s *TaggingService) GetEffectiveTopics(questionID uuid.UUID) (*EffectiveQuestionTopics, error) {
	context, err := s.GetContext(questionID)
	if err != nil {
		return nil, err
	}
	topicIDs := make([]uuid.UUID, 0, len(context.EffectiveTopics))
	for _, topic := range context.EffectiveTopics {
		topicIDs = append(topicIDs, topic.ID)
	}
	return &EffectiveQuestionTopics{
		QuestionID: questionID,
		Subject:    context.Question.Subject,
		TopicIDs:   topicIDs,
		Version:    context.Version,
		UpdatedAt:  context.UpdatedAt,
	}, nil
}

func (s *TaggingService) GetQuestionSnapshot(
	questionID uuid.UUID,
) (*QuestionTaggingSnapshot, error) {
	var snapshot *QuestionTaggingSnapshot
	err := s.db.Transaction(func(tx *gorm.DB) error {
		context, err := s.getContext(tx, questionID)
		if err != nil {
			return err
		}

		var question model.Question
		if err := tx.First(&question, "id = ?", questionID).Error; err != nil {
			return err
		}
		var rubricModels []model.QuestionRubricItem
		if err := tx.Where("question_id = ?", questionID).
			Order("position ASC, id ASC").
			Find(&rubricModels).Error; err != nil {
			return err
		}
		rubricTopics := make(map[uuid.UUID][]uuid.UUID, len(context.RubricItems))
		for _, rubric := range context.RubricItems {
			rubricTopics[rubric.ID] = rubric.TopicIDs
		}
		rubrics := make([]QuestionRubricSnapshot, 0, len(rubricModels))
		for _, rubric := range rubricModels {
			rubrics = append(rubrics, QuestionRubricSnapshot{
				ID:       rubric.ID,
				Content:  rubric.Content,
				Points:   rubric.Points,
				Position: rubric.Position,
				TopicIDs: rubricTopics[rubric.ID],
			})
		}
		effectiveTopicIDs := make([]uuid.UUID, 0, len(context.EffectiveTopics))
		for _, topic := range context.EffectiveTopics {
			effectiveTopicIDs = append(effectiveTopicIDs, topic.ID)
		}
		snapshot = &QuestionTaggingSnapshot{
			Question:          question,
			Subject:           context.Question.Subject,
			RubricItems:       rubrics,
			DirectTopicIDs:    context.DirectTopicIDs,
			EffectiveTopicIDs: effectiveTopicIDs,
			TaggingVersion:    context.Version,
			UpdatedBy:         context.UpdatedBy,
			UpdatedAt:         context.UpdatedAt,
		}
		return nil
	}, &sql.TxOptions{
		Isolation: sql.LevelRepeatableRead,
		ReadOnly:  true,
	})
	return snapshot, err
}

func (s *TaggingService) SetQuestionTopics(
	questionID uuid.UUID,
	topicIDs []uuid.UUID,
	expectedVersion int,
	actorID uuid.UUID,
) (*TaggingContext, error) {
	var context *TaggingContext
	err := s.db.Transaction(func(tx *gorm.DB) error {
		question, sourceNode, err := s.loadQuestionAndSourceNodeForUpdate(tx, questionID)
		if err != nil {
			return err
		}
		normalizedTopicIDs, err := s.validateTopicIDs(tx, topicIDs, sourceNode.Subject)
		if err != nil {
			return err
		}
		state, err := s.lockTaggingState(tx, question, expectedVersion)
		if err != nil {
			return err
		}

		if err := tx.Where("question_id = ?", questionID).
			Delete(&model.QuestionTopicMapping{}).Error; err != nil {
			return err
		}
		now := time.Now().UTC()
		for _, topicID := range normalizedTopicIDs {
			mapping := model.QuestionTopicMapping{
				QuestionID: questionID,
				NodeID:     topicID,
				CreatedBy:  actorID,
				CreatedAt:  now,
			}
			if err := tx.Create(&mapping).Error; err != nil {
				return err
			}
		}
		result := tx.Model(&model.QuestionTaggingState{}).
			Where("question_id = ? AND version = ?", questionID, state.Version).
			Updates(map[string]any{
				"version":    state.Version + 1,
				"updated_by": actorID,
				"updated_at": now,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return s.newVersionConflict(tx, questionID, expectedVersion)
		}

		context, err = s.getContext(tx, questionID)
		return err
	})
	return context, err
}

func (s *TaggingService) SetRubricItemTopics(
	questionID uuid.UUID,
	rubricItemID uuid.UUID,
	topicIDs []uuid.UUID,
	expectedVersion int,
	actorID uuid.UUID,
) (*TaggingContext, error) {
	var context *TaggingContext
	err := s.db.Transaction(func(tx *gorm.DB) error {
		question, sourceNode, err := s.loadQuestionAndSourceNodeForUpdate(tx, questionID)
		if err != nil {
			return err
		}
		if question.QuestionType != "essay" {
			return &DomainError{
				Code:    "rubric_item_mismatch",
				Message: "Rubric topics can only be edited for an essay question.",
			}
		}
		var rubric model.QuestionRubricItem
		if err := tx.First(&rubric, "id = ?", rubricItemID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return &DomainError{
					Code:    "rubric_item_not_found",
					Message: fmt.Sprintf("Rubric item %q does not exist.", rubricItemID),
				}
			}
			return err
		}
		if rubric.QuestionID != questionID {
			return &DomainError{
				Code:    "rubric_item_mismatch",
				Message: "Rubric item does not belong to the edited essay question.",
			}
		}
		normalizedTopicIDs, err := s.validateTopicIDs(tx, topicIDs, sourceNode.Subject)
		if err != nil {
			return err
		}
		state, err := s.lockTaggingState(tx, question, expectedVersion)
		if err != nil {
			return err
		}

		if err := tx.Where("rubric_item_id = ?", rubricItemID).
			Delete(&model.QuestionRubricItemTopicMapping{}).Error; err != nil {
			return err
		}
		now := time.Now().UTC()
		for _, topicID := range normalizedTopicIDs {
			mapping := model.QuestionRubricItemTopicMapping{
				RubricItemID: rubricItemID,
				NodeID:       topicID,
				CreatedBy:    actorID,
				CreatedAt:    now,
			}
			if err := tx.Create(&mapping).Error; err != nil {
				return err
			}
		}
		result := tx.Model(&model.QuestionTaggingState{}).
			Where("question_id = ? AND version = ?", questionID, state.Version).
			Updates(map[string]any{
				"version":    state.Version + 1,
				"updated_by": actorID,
				"updated_at": now,
			})
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return s.newVersionConflict(tx, questionID, expectedVersion)
		}
		context, err = s.getContext(tx, questionID)
		return err
	})
	return context, err
}

func (s *TaggingService) loadQuestionAndSourceNode(
	db *gorm.DB,
	questionID uuid.UUID,
) (*model.Question, *model.Node, error) {
	return s.loadQuestionAndSourceNodeWithLock(db, questionID, false)
}

func (s *TaggingService) loadQuestionAndSourceNodeForUpdate(
	db *gorm.DB,
	questionID uuid.UUID,
) (*model.Question, *model.Node, error) {
	return s.loadQuestionAndSourceNodeWithLock(db, questionID, true)
}

func (s *TaggingService) loadQuestionAndSourceNodeWithLock(
	db *gorm.DB,
	questionID uuid.UUID,
	lock bool,
) (*model.Question, *model.Node, error) {
	var question model.Question
	query := db
	if lock {
		query = query.Clauses(clause.Locking{Strength: "UPDATE"})
	}
	if err := query.First(&question, "id = ?", questionID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil, &DomainError{
				Code:    "question_not_found",
				Message: fmt.Sprintf("Question %q does not exist.", questionID),
			}
		}
		return nil, nil, err
	}
	var sourceNode model.Node
	nodeQuery := db
	if lock {
		nodeQuery = nodeQuery.Clauses(clause.Locking{Strength: "SHARE"})
	}
	if err := nodeQuery.First(&sourceNode, "id = ?", question.NodeID).Error; err != nil {
		return nil, nil, err
	}
	return &question, &sourceNode, nil
}

func (s *TaggingService) validateTopicIDs(
	db *gorm.DB,
	topicIDs []uuid.UUID,
	subject string,
) ([]uuid.UUID, error) {
	if len(topicIDs) > 200 {
		return nil, &DomainError{
			Code:    "topic_limit_exceeded",
			Message: "A topic set cannot contain more than 200 topics.",
		}
	}
	unique := make(map[uuid.UUID]struct{}, len(topicIDs))
	normalized := make([]uuid.UUID, 0, len(topicIDs))
	for _, topicID := range topicIDs {
		if topicID == uuid.Nil {
			return nil, &DomainError{
				Code:    "topic_not_found",
				Message: "Topic IDs must be valid UUIDs.",
			}
		}
		if _, exists := unique[topicID]; exists {
			return nil, &DomainError{
				Code:    "request_validation_error",
				Message: "Topic IDs must be unique.",
				Details: map[string]any{"topicId": topicID},
			}
		}
		unique[topicID] = struct{}{}
		normalized = append(normalized, topicID)
	}
	sort.Slice(normalized, func(i, j int) bool {
		return normalized[i].String() < normalized[j].String()
	})
	if len(normalized) == 0 {
		return normalized, nil
	}

	var topics []model.Node
	topicQuery := db
	if len(normalized) > 0 {
		topicQuery = topicQuery.Clauses(clause.Locking{Strength: "SHARE"})
	}
	if err := topicQuery.Where("id IN ?", normalized).Find(&topics).Error; err != nil {
		return nil, err
	}
	found := make(map[uuid.UUID]model.Node, len(topics))
	for _, topic := range topics {
		found[topic.ID] = topic
	}
	missing := make([]uuid.UUID, 0)
	mismatched := make([]uuid.UUID, 0)
	for _, topicID := range normalized {
		topic, exists := found[topicID]
		if !exists {
			missing = append(missing, topicID)
			continue
		}
		if topic.Subject != subject {
			mismatched = append(mismatched, topicID)
		}
	}
	if len(missing) > 0 {
		return nil, &DomainError{
			Code:    "topic_not_found",
			Message: "One or more topics do not exist.",
			Details: map[string]any{"topicIds": missing},
		}
	}
	if len(mismatched) > 0 {
		return nil, &DomainError{
			Code:    "topic_subject_mismatch",
			Message: "Every topic must belong to the same subject as the question.",
			Details: map[string]any{"topicIds": mismatched, "expectedSubject": subject},
		}
	}
	return normalized, nil
}

func (s *TaggingService) lockTaggingState(
	tx *gorm.DB,
	question *model.Question,
	expectedVersion int,
) (*model.QuestionTaggingState, error) {
	var state model.QuestionTaggingState
	stateResult := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("question_id = ?", question.ID).
		Limit(1).
		Find(&state)
	if stateResult.Error != nil {
		return nil, stateResult.Error
	}
	if stateResult.RowsAffected == 1 {
		if state.Version != expectedVersion {
			return nil, s.newVersionConflict(tx, question.ID, expectedVersion)
		}
		return &state, nil
	}
	if expectedVersion != 1 {
		return nil, s.newVersionConflict(tx, question.ID, expectedVersion)
	}

	initial := model.QuestionTaggingState{
		QuestionID: question.ID,
		Version:    1,
		UpdatedAt:  question.UpdatedAt,
	}
	if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&initial).Error; err != nil {
		return nil, err
	}

	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		First(&state, "question_id = ?", question.ID).Error; err != nil {
		return nil, err
	}
	if state.Version != expectedVersion {
		return nil, s.newVersionConflict(tx, question.ID, expectedVersion)
	}
	return &state, nil
}

func (s *TaggingService) newVersionConflict(
	tx *gorm.DB,
	questionID uuid.UUID,
	expectedVersion int,
) error {
	latest, err := s.getContext(tx, questionID)
	if err != nil {
		return err
	}
	return &VersionConflict{
		DomainError: &DomainError{
			Code:    "version_conflict",
			Message: "Tagging data has changed. Reload the latest context before saving.",
			Details: map[string]any{
				"expectedVersion": expectedVersion,
				"currentVersion":  latest.Version,
			},
		},
		LatestContext: latest,
	}
}

func (s *TaggingService) getContext(db *gorm.DB, questionID uuid.UUID) (*TaggingContext, error) {
	question, sourceNode, err := s.loadQuestionAndSourceNode(db, questionID)
	if err != nil {
		return nil, err
	}

	var availableTopics []model.Node
	if err := db.
		Where("subject = ?", sourceNode.Subject).
		Order("name ASC, id ASC").
		Find(&availableTopics).Error; err != nil {
		return nil, err
	}

	var state model.QuestionTaggingState
	stateResult := db.Where("question_id = ?", questionID).Limit(1).Find(&state)
	if stateResult.Error != nil {
		return nil, stateResult.Error
	}
	hasState := stateResult.RowsAffected == 1

	directTopicIDs := []uuid.UUID{question.NodeID}
	version := 1
	updatedBy := (*uuid.UUID)(nil)
	updatedAt := question.UpdatedAt
	if hasState {
		version = state.Version
		updatedBy = state.UpdatedBy
		updatedAt = state.UpdatedAt
		if err := db.
			Model(&model.QuestionTopicMapping{}).
			Where("question_id = ?", questionID).
			Order("node_id ASC").
			Pluck("node_id", &directTopicIDs).Error; err != nil {
			return nil, err
		}
	}

	var rubricModels []model.QuestionRubricItem
	if err := db.
		Where("question_id = ?", questionID).
		Order("position ASC, id ASC").
		Find(&rubricModels).Error; err != nil {
		return nil, err
	}

	rubricItems := make([]RubricTaggingItem, 0, len(rubricModels))
	effectiveSet := make(map[uuid.UUID]struct{}, len(directTopicIDs))
	for _, topicID := range directTopicIDs {
		effectiveSet[topicID] = struct{}{}
	}
	for _, rubric := range rubricModels {
		var topicIDs []uuid.UUID
		if err := db.
			Model(&model.QuestionRubricItemTopicMapping{}).
			Where("rubric_item_id = ?", rubric.ID).
			Order("node_id ASC").
			Pluck("node_id", &topicIDs).Error; err != nil {
			return nil, err
		}
		rubricItems = append(rubricItems, RubricTaggingItem{
			ID:       rubric.ID,
			Content:  rubric.Content,
			Position: rubric.Position,
			TopicIDs: topicIDs,
		})
		if question.QuestionType == "essay" {
			for _, topicID := range topicIDs {
				effectiveSet[topicID] = struct{}{}
			}
		}
	}

	effectiveTopics := make([]model.Node, 0, len(effectiveSet))
	for _, topic := range availableTopics {
		if _, ok := effectiveSet[topic.ID]; ok {
			effectiveTopics = append(effectiveTopics, topic)
		}
	}
	sort.Slice(directTopicIDs, func(i, j int) bool {
		return directTopicIDs[i].String() < directTopicIDs[j].String()
	})

	return &TaggingContext{
		Question: QuestionSummary{
			ID:           question.ID,
			NodeID:       question.NodeID,
			Content:      question.Content,
			Subject:      sourceNode.Subject,
			GradeLevel:   question.GradeLevel,
			QuestionType: question.QuestionType,
		},
		RubricItems:     rubricItems,
		AvailableTopics: availableTopics,
		DirectTopicIDs:  directTopicIDs,
		EffectiveTopics: effectiveTopics,
		Version:         version,
		UpdatedBy:       updatedBy,
		UpdatedAt:       updatedAt,
	}, nil
}
