package exam

import (
	"errors"
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
	return &Detail{Exam: *examModel, Questions: questions}, nil
}

func (r *Repository) LockOwnedExam(id, actor uuid.UUID) (*model.Exam, error) {
	return r.ownedExam(r.db, id, actor, true)
}

func (r *Repository) AppendAudit(entry *model.ExamAuditLog) error {
	return r.db.Create(entry).Error
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
