package gamification

import (
	"context"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type Repository struct{ db *gorm.DB }

func NewRepository(db *gorm.DB) *Repository { return &Repository{db: db} }

// ListBadges trả toàn bộ catalog theo thứ tự hiển thị.
func (r *Repository) ListBadges(ctx context.Context) ([]model.Badge, error) {
	var badges []model.Badge
	err := r.db.WithContext(ctx).Order("sort_order asc").Find(&badges).Error
	return badges, err
}

// SeedBadges upsert catalog theo Code (idempotent, đồng bộ phần hiển thị mỗi lần boot).
func (r *Repository) SeedBadges(ctx context.Context, badges []model.Badge) error {
	if len(badges) == 0 {
		return nil
	}
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "code"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"name", "description", "criteria", "glyph", "shape",
			"color_from", "color_to", "category", "metric", "threshold",
			"xp_reward", "sort_order",
		}),
	}).Create(&badges).Error
}

// ListStudentBadgeMap trả map badgeID -> thời điểm trao, cho học sinh.
func (r *Repository) ListStudentBadgeMap(ctx context.Context, studentID uuid.UUID) (map[uuid.UUID]time.Time, error) {
	var rows []model.StudentBadge
	if err := r.db.WithContext(ctx).Where("student_id = ?", studentID).Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make(map[uuid.UUID]time.Time, len(rows))
	for _, sb := range rows {
		out[sb.BadgeID] = sb.AwardedAt
	}
	return out, nil
}

// AwardBadge trao huy hiệu, bỏ qua nếu đã có (idempotent theo idx_student_badge).
func (r *Repository) AwardBadge(ctx context.Context, studentID, badgeID uuid.UUID, at time.Time) error {
	sb := model.StudentBadge{StudentID: studentID, BadgeID: badgeID, AwardedAt: at}
	return r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "student_id"}, {Name: "badge_id"}},
		DoNothing: true,
	}).Create(&sb).Error
}
