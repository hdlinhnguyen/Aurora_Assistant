package exam

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{db: db}
}

func (r *Repository) Transaction(fn func(tx *Repository) error) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		return fn(NewRepository(tx))
	})
}

func (r *Repository) OwnedExam(id, actor uuid.UUID) (*model.Exam, error) {
	return r.ownedExam(r.db, id, actor, false)
}

func (r *Repository) ExamDetail(id, actor uuid.UUID) (*Detail, error) {
	examModel, err := r.OwnedExam(id, actor)
	if err != nil {
		return nil, err
	}

	var questions []model.ExamQuestion
	if err := r.db.
		Where("exam_id = ?", examModel.ID).
		Order("position ASC, id ASC").
		Find(&questions).Error; err != nil {
		return nil, err
	}
	if questions == nil {
		questions = make([]model.ExamQuestion, 0)
	}
	questionIDs := make([]uuid.UUID, 0, len(questions))
	for _, question := range questions {
		questionIDs = append(questionIDs, question.ID)
	}
	rubricsByQuestion, err := r.rubricsByQuestion(questionIDs)
	if err != nil {
		return nil, err
	}
	detailQuestions := make([]QuestionDetail, 0, len(questions))
	for _, question := range questions {
		detail, err := decodeQuestionDetail(question)
		if err != nil {
			return nil, err
		}
		detail.RubricItems = rubricsByQuestion[question.ID]
		detailQuestions = append(detailQuestions, detail)
	}
	return &Detail{Exam: *examModel, Questions: detailQuestions}, nil
}

func (r *Repository) LockOwnedExam(id, actor uuid.UUID) (*model.Exam, error) {
	return r.ownedExam(r.db, id, actor, true)
}

func (r *Repository) AppendAudit(entry *model.ExamAuditLog) error {
	return r.db.Create(entry).Error
}

type bankQuestionRow struct {
	model.Question
	Subject  string
	NodeName string
}

func (r *Repository) bankQuestions(filter BankFilter) ([]BankQuestion, error) {
	query := r.db.Model(&model.Question{}).
		Select("questions.*, nodes.subject, nodes.name AS node_name").
		Joins("JOIN nodes ON nodes.id = questions.node_id AND nodes.deleted_at IS NULL").
		Where("questions.deleted_at IS NULL")
	if filter.Subject != "" {
		query = query.Where("nodes.subject = ?", filter.Subject)
	}
	if filter.NodeID != nil {
		query = query.Where("questions.node_id = ?", *filter.NodeID)
	}
	if filter.Difficulty != "" {
		query = query.Where("questions.difficulty = ?", filter.Difficulty)
	}
	if search := escapeLikePattern(filter.Search); search != "" {
		query = query.Where(
			"(questions.content ILIKE ? ESCAPE '\\' OR nodes.name ILIKE ? ESCAPE '\\')",
			"%"+search+"%", "%"+search+"%",
		)
	}

	rows := make([]bankQuestionRow, 0)
	if err := query.Order("questions.created_at DESC, questions.id DESC").Scan(&rows).Error; err != nil {
		return nil, err
	}
	result := make([]BankQuestion, 0, len(rows))
	for _, row := range rows {
		item, err := mapBankQuestion(row)
		if err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, nil
}

func (r *Repository) bankQuestion(id uuid.UUID) (*BankQuestion, error) {
	var row bankQuestionRow
	err := r.db.Model(&model.Question{}).
		Select("questions.*, nodes.subject, nodes.name AS node_name").
		Joins("JOIN nodes ON nodes.id = questions.node_id AND nodes.deleted_at IS NULL").
		Where("questions.deleted_at IS NULL AND questions.id = ?", id).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, questionError(
			ErrorCodeQuestionNotFound, "", "Question does not exist.", 404,
		)
	}
	if err != nil {
		return nil, err
	}
	item, err := mapBankQuestion(row)
	return &item, err
}

func (r *Repository) topics(subject string) ([]model.Node, error) {
	nodes := make([]model.Node, 0)
	err := r.db.Where("subject = ?", subject).Order("name ASC, id ASC").Find(&nodes).Error
	return nodes, err
}

func (r *Repository) topicsAllowed(subject string, ids []uuid.UUID) (bool, error) {
	unique := make(map[uuid.UUID]struct{}, len(ids))
	for _, id := range ids {
		if id == uuid.Nil {
			return false, nil
		}
		unique[id] = struct{}{}
	}
	if len(unique) != len(ids) {
		return false, nil
	}
	var count int64
	err := r.db.Model(&model.Node{}).
		Where("subject = ? AND id IN ?", subject, ids).
		Count(&count).Error
	return count == int64(len(ids)), err
}

func (r *Repository) examQuestion(examID, questionID uuid.UUID) (*model.ExamQuestion, error) {
	var question model.ExamQuestion
	err := r.db.Where("exam_id = ? AND id = ?", examID, questionID).First(&question).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, questionError(
			ErrorCodeQuestionNotFound, "", "Question does not exist.", 404,
		)
	}
	return &question, err
}

func (r *Repository) rubricItem(questionID, rubricID uuid.UUID) (*model.ExamRubricItem, error) {
	var rubric model.ExamRubricItem
	err := r.db.
		Where("exam_question_id = ? AND id = ?", questionID, rubricID).
		First(&rubric).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, questionError(
			ErrorCodeRubricItemNotFound, "", "Rubric item does not exist.", 404,
		)
	}
	return &rubric, err
}

func (r *Repository) rubricsByQuestion(
	questionIDs []uuid.UUID,
) (map[uuid.UUID][]RubricItemDetail, error) {
	result := make(map[uuid.UUID][]RubricItemDetail, len(questionIDs))
	for _, questionID := range questionIDs {
		result[questionID] = make([]RubricItemDetail, 0)
	}
	if len(questionIDs) == 0 {
		return result, nil
	}

	var rubrics []model.ExamRubricItem
	if err := r.db.
		Where("exam_question_id IN ?", questionIDs).
		Order("exam_question_id ASC, position ASC, id ASC").
		Find(&rubrics).Error; err != nil {
		return nil, err
	}
	for _, rubric := range rubrics {
		detail, err := decodeRubricItemDetail(rubric)
		if err != nil {
			return nil, err
		}
		result[rubric.ExamQuestionID] = append(result[rubric.ExamQuestionID], detail)
	}
	return result, nil
}

func (r *Repository) topicLookup(ids []uuid.UUID) (TopicLookup, error) {
	lookup := make(TopicLookup)
	if len(ids) == 0 {
		return lookup, nil
	}
	var nodes []model.Node
	if err := r.db.Where("id IN ?", ids).Find(&nodes).Error; err != nil {
		return nil, err
	}
	for _, node := range nodes {
		lookup[node.ID] = node.Subject
	}
	return lookup, nil
}

func mapBankQuestion(row bankQuestionRow) (BankQuestion, error) {
	var options []string
	if err := json.Unmarshal([]byte(row.OptionsJSON), &options); err != nil {
		return BankQuestion{}, fmt.Errorf("decode bank question %s options: %w", row.ID, err)
	}
	if row.CorrectOption < 0 || row.CorrectOption >= len(options) {
		return BankQuestion{}, fmt.Errorf(
			"bank question %s correct option %d is out of range",
			row.ID, row.CorrectOption,
		)
	}
	choices := make([]Choice, 0, len(options))
	for index, content := range options {
		choices = append(choices, Choice{
			ID: fmt.Sprintf("choice-%d", index), Content: content,
		})
	}
	correctID := choices[row.CorrectOption].ID
	return BankQuestion{
		ID: row.ID, NodeID: row.NodeID, Subject: row.Subject, NodeName: row.NodeName,
		Content: row.Content, Difficulty: row.Difficulty,
		Choices: choices, CorrectChoiceID: &correctID,
	}, nil
}

func decodeQuestionDetail(question model.ExamQuestion) (QuestionDetail, error) {
	choices := make([]Choice, 0)
	if question.ChoicesJSON != "" {
		if err := json.Unmarshal([]byte(question.ChoicesJSON), &choices); err != nil {
			return QuestionDetail{}, fmt.Errorf(
				"decode exam question %s choices: %w", question.ID, err,
			)
		}
	}
	topicNodeIDs := make([]uuid.UUID, 0)
	if question.TopicNodeIDsJSON != "" {
		if err := json.Unmarshal([]byte(question.TopicNodeIDsJSON), &topicNodeIDs); err != nil {
			return QuestionDetail{}, fmt.Errorf(
				"decode exam question %s topics: %w", question.ID, err,
			)
		}
	}
	return QuestionDetail{
		ExamQuestion: question, Choices: choices, TopicNodeIDs: topicNodeIDs,
		RubricItems: make([]RubricItemDetail, 0),
	}, nil
}

func decodeRubricItemDetail(rubric model.ExamRubricItem) (RubricItemDetail, error) {
	topicNodeIDs := make([]uuid.UUID, 0)
	if rubric.TopicNodeIDsJSON != "" {
		if err := json.Unmarshal([]byte(rubric.TopicNodeIDsJSON), &topicNodeIDs); err != nil {
			return RubricItemDetail{}, fmt.Errorf(
				"decode rubric item %s topics: %w", rubric.ID, err,
			)
		}
	}
	return RubricItemDetail{
		ExamRubricItem: rubric,
		TopicNodeIDs:   topicNodeIDs,
	}, nil
}

func (r *Repository) ownedExam(
	db *gorm.DB,
	id, actor uuid.UUID,
	lock bool,
) (*model.Exam, error) {
	query := db.Where("id = ? AND created_by = ?", id, actor)
	if lock {
		query = query.Clauses(clause.Locking{Strength: "UPDATE"})
	}

	var examModel model.Exam
	if err := query.First(&examModel).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, examNotFound()
		}
		return nil, err
	}
	return &examModel, nil
}

func (r *Repository) listOwned(actor uuid.UUID, filter ListFilter) ([]model.Exam, error) {
	query := r.db.Where("created_by = ?", actor)
	if filter.Subject != "" {
		query = query.Where("subject = ?", filter.Subject)
	}
	if filter.Status != "" {
		query = query.Where("status = ?", filter.Status)
	}
	if search := escapeLikePattern(filter.Search); search != "" {
		query = query.Where(
			"(title ILIKE ? ESCAPE '\\' OR subject ILIKE ? ESCAPE '\\')",
			"%"+search+"%",
			"%"+search+"%",
		)
	}

	exams := make([]model.Exam, 0)
	err := query.Order("updated_at DESC, id DESC").Find(&exams).Error
	return exams, err
}

func (r *Repository) auditOwned(actor, examID uuid.UUID) ([]model.ExamAuditLog, error) {
	var count int64
	if err := r.db.Unscoped().
		Model(&model.Exam{}).
		Where("id = ? AND created_by = ?", examID, actor).
		Count(&count).Error; err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, examNotFound()
	}

	entries := make([]model.ExamAuditLog, 0)
	err := r.db.
		Where("exam_id = ?", examID).
		Order("occurred_at ASC, id ASC").
		Find(&entries).Error
	return entries, err
}

func escapeLikePattern(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `%`, `\%`)
	return strings.ReplaceAll(value, `_`, `\_`)
}
