package model

import (
	"time"

	"github.com/google/uuid"
)

// Badge là catalog huy hiệu (seed sẵn lúc startup). Code là stable key idempotent.
// Các trường màu/hình/glyph để frontend dựng component Medal thuần CSS từ dữ liệu.
type Badge struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	Code        string    `gorm:"type:varchar(50);uniqueIndex;not null" json:"code"`
	Name        string    `gorm:"type:varchar(100);not null" json:"name"`
	Description string    `gorm:"type:text" json:"description"`
	Criteria    string    `gorm:"type:text" json:"criteria"`
	Glyph       string    `gorm:"type:varchar(16)" json:"glyph"`                        // emoji
	Shape       string    `gorm:"type:varchar(20)" json:"shape"`                        // circle|hexagon|star|shield|octagon
	ColorFrom   string    `gorm:"type:varchar(20)" json:"colorFrom"`                    // hex gradient start
	ColorTo     string    `gorm:"type:varchar(20)" json:"colorTo"`                      // hex gradient end
	Category    string    `gorm:"type:varchar(40);not null;default:'general'" json:"category"`
	Metric      string    `gorm:"type:varchar(30);not null;default:'manual'" json:"metric"` // xem gamification.Metric*
	Threshold   int       `gorm:"not null;default:0" json:"threshold"`
	XpReward    int       `gorm:"not null;default:0" json:"xpReward"`
	SortOrder   int       `gorm:"not null;default:0" json:"sortOrder"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// StudentBadge = huy hiệu đã trao cho học sinh (unique để không trao trùng).
type StudentBadge struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	StudentID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_student_badge,priority:1" json:"studentId"`
	BadgeID   uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_student_badge,priority:2" json:"badgeId"`
	AwardedAt time.Time `gorm:"not null" json:"awardedAt"`
	CreatedAt time.Time `json:"createdAt"`
}
