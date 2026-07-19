package handler

import (
	"time"

	"github.com/gofiber/fiber/v3"

	"backend/internal/aicost"
	"backend/internal/middleware"
	"backend/internal/model"
)

// GetMonitoringOverview cung cấp số liệu Tầng 1 (User Metrics) cho /admin/monitoring
// từ dữ liệu thật: bảng users/classrooms + telemetry_events + student_topic_masteries.
func (h *AdminHandler) GetMonitoringOverview(c fiber.Ctx) error {
	now := time.Now().UTC()

	var studentsTotal, teachersTotal, classroomsTotal int64
	h.db.Model(&model.User{}).Where("role = ?", "student").Count(&studentsTotal)
	h.db.Model(&model.User{}).Where("role = ?", "teacher").Count(&teachersTotal)
	h.db.Model(&model.Classroom{}).Count(&classroomsTotal)

	// Học sinh mới trong 7 ngày → tăng trưởng tuần.
	var newStudents int64
	h.db.Model(&model.User{}).Where("role = ? AND created_at >= ?", "student", now.Add(-7*24*time.Hour)).Count(&newStudents)
	weekGrowthPct := 0.0
	if prev := studentsTotal - newStudents; prev > 0 {
		weekGrowthPct = float64(newStudents) / float64(prev) * 100
	}

	// HAU 24h: học sinh hoạt động (distinct actor) theo từng giờ trong ngày, 24h gần nhất.
	type hourBucket struct {
		Hr  int
		Cnt int
	}
	var buckets []hourBucket
	h.db.Raw(`
		SELECT EXTRACT(HOUR FROM occurred_at)::int AS hr, COUNT(DISTINCT actor_id) AS cnt
		FROM telemetry_events
		WHERE occurred_at >= ? AND actor_role = 'student'
		GROUP BY hr`, now.Add(-24*time.Hour)).Scan(&buckets)
	hau24h := make([]int, 24)
	peakConcurrent := 0
	for _, b := range buckets {
		if b.Hr >= 0 && b.Hr < 24 {
			hau24h[b.Hr] = b.Cnt
			if b.Cnt > peakConcurrent {
				peakConcurrent = b.Cnt
			}
		}
	}

	// Online hôm nay + tổng phiên (distinct session_id) trong 24h.
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	var onlineToday, sessionsTotal int64
	h.db.Raw(`SELECT COUNT(DISTINCT actor_id) FROM telemetry_events WHERE occurred_at >= ? AND actor_role = 'student'`, startOfDay).Scan(&onlineToday)
	h.db.Raw(`SELECT COUNT(DISTINCT session_id) FROM telemetry_events WHERE occurred_at >= ? AND session_id IS NOT NULL`, now.Add(-24*time.Hour)).Scan(&sessionsTotal)

	// Nhóm chiến lược thích ứng: cần phụ đạo (có lỗ hổng xác nhận) vs nâng cao (mastery trung bình cao).
	var remediationGroup, advancedGroup int64
	h.db.Raw(`SELECT COUNT(DISTINCT student_id) FROM student_topic_masteries WHERE mastery_status = 'confirmed_gap'`).Scan(&remediationGroup)
	h.db.Raw(`
		SELECT COUNT(*) FROM (
			SELECT student_id FROM student_topic_masteries
			GROUP BY student_id HAVING AVG(mastery_probability) >= 0.8
		) t`).Scan(&advancedGroup)

	return c.JSON(fiber.Map{
		"hau24h": hau24h,
		"students": fiber.Map{
			"total":         studentsTotal,
			"onlineToday":   onlineToday,
			"weekGrowthPct": weekGrowthPct,
		},
		"teachers": fiber.Map{
			"total":      teachersTotal,
			"classrooms": classroomsTotal,
		},
		"sessions": fiber.Map{
			"totalOnline":    sessionsTotal,
			"peakConcurrent": peakConcurrent,
		},
		"adaptive": fiber.Map{
			"remediationGroupCount": remediationGroup,
			"advancedGroupCount":    advancedGroup,
		},
	})
}

// GetMonitoringHTTPStatus trả phân bố 2xx/4xx/5xx từ bộ đếm middleware (Tầng 2).
func (h *AdminHandler) GetMonitoringHTTPStatus(c fiber.Ctx) error {
	s := middleware.HTTPStatusCounters()
	total := s.Total
	pct := func(n uint64) float64 {
		if total == 0 {
			return 0
		}
		return float64(n) / float64(total) * 100
	}
	buckets := []fiber.Map{
		{"bucket": "2xx", "count": s.Count2xx, "pct": pct(s.Count2xx)},
		{"bucket": "4xx", "count": s.Count4xx, "pct": pct(s.Count4xx)},
		{"bucket": "5xx", "count": s.Count5xx, "pct": pct(s.Count5xx)},
	}
	return c.JSON(fiber.Map{"total": total, "buckets": buckets})
}

// GetMonitoringAICost trả token/chi phí Gemini tích luỹ (Tầng 3).
func (h *AdminHandler) GetMonitoringAICost(c fiber.Ctx) error {
	return c.JSON(aicost.Current())
}
