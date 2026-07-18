package gamification

import (
	"time"

	"backend/internal/model"
)

// Trạng thái hiển thị của 1 huy hiệu với 1 học sinh.
const (
	StatusEarned   = "earned"
	StatusProgress = "progress"
	StatusLocked   = "locked"
)

// Metric* xác định chỉ số dẫn dắt tiến độ + điều kiện phát huy hiệu.
const (
	MetricChapters     = "chapters"      // số node đạt mastery ("mastered")
	MetricStreak       = "streak"        // số ngày học liên tục dài nhất
	MetricCorrectChain = "correct_chain" // chuỗi trả lời đúng liên tiếp dài nhất
	MetricResilience   = "resilience"    // số node từng sai rồi làm lại đúng
	MetricCurious      = "curious"       // số lần chủ động nhờ gợi ý/hỏi
	MetricStars        = "stars"         // tổng sao tích lũy
	MetricManual       = "manual"        // luôn khóa cho tới khi trao thủ công
)

// BadgeView là 1 huy hiệu kèm trạng thái/tiến độ của học sinh hiện tại.
type BadgeView struct {
	Code        string     `json:"code"`
	Name        string     `json:"name"`
	Description string     `json:"description"`
	Criteria    string     `json:"criteria"`
	Glyph       string     `json:"glyph"`
	Shape       string     `json:"shape"`
	ColorFrom   string     `json:"colorFrom"`
	ColorTo     string     `json:"colorTo"`
	Category    string     `json:"category"`
	Threshold   int        `json:"threshold"`
	Progress    int        `json:"progress"`
	Pct         int        `json:"pct"`
	Status      string     `json:"status"`
	AwardedAt   *time.Time `json:"awardedAt"`
}

// Summary là toàn bộ hồ sơ gamification trả cho frontend.
type Summary struct {
	StudentID     string      `json:"studentId"`
	XP            int         `json:"xp"`
	Stars         int         `json:"stars"`
	Level         int         `json:"level"`
	XPIntoLevel   int         `json:"xpIntoLevel"`
	XPForLevel    int         `json:"xpForLevel"`
	CurrentStreak int         `json:"currentStreak"`
	LongestStreak int         `json:"longestStreak"`
	EarnedCount   int         `json:"earnedCount"`
	TotalCount    int         `json:"totalCount"`
	Badges        []BadgeView `json:"badges"`
}

// DefaultBadges là catalog cố định (khớp handoff thiết kế: 5 huy hiệu chính + 3 khóa).
func DefaultBadges() []model.Badge {
	return []model.Badge{
		{
			Code: "chapter_master", Name: "Vua Phân Số",
			Description: "Chinh phục trọn vẹn một chương kiến thức.",
			Criteria:    "Hoàn thành (đạt mastery) 1 chương.",
			Glyph:       "👑", Shape: "circle", ColorFrom: "#FFD76F", ColorTo: "#FF9F43",
			Category: "Chương học", Metric: MetricChapters, Threshold: 1, XpReward: 100, SortOrder: 1,
		},
		{
			Code: "streak_7", Name: "Ngọn Lửa Chăm Chỉ",
			Description: "Giữ lửa học tập đều đặn mỗi ngày.",
			Criteria:    "Học đều 7 ngày liên tục.",
			Glyph:       "🔥", Shape: "hexagon", ColorFrom: "#FFB65C", ColorTo: "#FF5F57",
			Category: "Thói quen", Metric: MetricStreak, Threshold: 7, XpReward: 120, SortOrder: 2,
		},
		{
			Code: "chain_5", Name: "Tia Chớp Thần Tốc",
			Description: "Trả lời đúng liên tục như tia chớp.",
			Criteria:    "Đúng 5 câu liền nhau.",
			Glyph:       "⚡", Shape: "star", ColorFrom: "#A78BFA", ColorTo: "#6D28D9",
			Category: "Kỹ năng", Metric: MetricCorrectChain, Threshold: 5, XpReward: 80, SortOrder: 3,
		},
		{
			Code: "resilience_5", Name: "Trái Tim Kiên Trì",
			Description: "Sai không nản, làm lại tới khi đúng.",
			Criteria:    "Làm lại đúng sau khi từng sai ở 5 bài.",
			Glyph:       "💪", Shape: "shield", ColorFrom: "#19E0C6", ColorTo: "#0FB9A6",
			Category: "Tinh thần", Metric: MetricResilience, Threshold: 5, XpReward: 90, SortOrder: 4,
		},
		{
			Code: "curious_10", Name: "Nhà Thông Thái",
			Description: "Ham học, chủ động hỏi để hiểu sâu.",
			Criteria:    "Chủ động nhờ gợi ý 10 lần.",
			Glyph:       "💡", Shape: "octagon", ColorFrom: "#5AC8FA", ColorTo: "#2A7CC0",
			Category: "Ham học", Metric: MetricCurious, Threshold: 10, XpReward: 70, SortOrder: 5,
		},
		{
			Code: "calc_master", Name: "Thánh Phép Tính",
			Description: "Làm chủ chương Phép tính.",
			Criteria:    "Hoàn thành chương Phép tính.",
			Glyph:       "➗", Shape: "circle", ColorFrom: "#C7CDD6", ColorTo: "#9AA1B0",
			Category: "Chương học", Metric: MetricManual, Threshold: 0, XpReward: 100, SortOrder: 6,
		},
		{
			Code: "geo_master", Name: "Bậc Thầy Hình Học",
			Description: "Làm chủ chương Hình học.",
			Criteria:    "Hoàn thành chương Hình học.",
			Glyph:       "📐", Shape: "hexagon", ColorFrom: "#C7CDD6", ColorTo: "#9AA1B0",
			Category: "Chương học", Metric: MetricManual, Threshold: 0, XpReward: 100, SortOrder: 7,
		},
		{
			Code: "number_lord", Name: "Chúa Tể Số Học",
			Description: "Tích lũy kho sao khổng lồ.",
			Criteria:    "Tích lũy 1000 sao.",
			Glyph:       "🔢", Shape: "star", ColorFrom: "#8B5CF6", ColorTo: "#6D28D9",
			Category: "Cột mốc", Metric: MetricStars, Threshold: 1000, XpReward: 200, SortOrder: 8,
		},
	}
}
