package gamification

import (
	"context"
	"sort"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const xpPerLevel = 1000

type Service struct {
	db   *gorm.DB
	repo *Repository
}

func NewService(db *gorm.DB, repo *Repository) *Service {
	return &Service{db: db, repo: repo}
}

// SeedBadges ghi catalog mặc định (gọi lúc startup).
func (s *Service) SeedBadges(ctx context.Context) error {
	return s.repo.SeedBadges(ctx, DefaultBadges())
}

// metrics gom các chỉ số dẫn xuất từ activity_logs + student_topic_masteries.
type metrics struct {
	correctCount  int
	hintCount     int
	correctChain  int
	resilience    int
	chapters      int
	currentStreak int
	longestStreak int
	stars         int
	xp            int
}

func (s *Service) computeMetrics(ctx context.Context, studentID uuid.UUID) (metrics, error) {
	var rows []struct {
		Action    string
		NodeID    uuid.UUID
		CreatedAt time.Time
	}
	if err := s.db.WithContext(ctx).
		Model(&model.ActivityLog{}).
		Where("student_id = ?", studentID).
		Order("created_at asc").
		Select("action", "node_id", "created_at").
		Scan(&rows).Error; err != nil {
		return metrics{}, err
	}

	var m metrics
	curChain := 0
	hadIncorrect := map[uuid.UUID]bool{}
	recovered := map[uuid.UUID]bool{}
	dateSet := map[string]bool{}

	for _, r := range rows {
		switch r.Action {
		case "answer_correct":
			m.correctCount++
			curChain++
			if curChain > m.correctChain {
				m.correctChain = curChain
			}
			if hadIncorrect[r.NodeID] && !recovered[r.NodeID] {
				recovered[r.NodeID] = true
				m.resilience++
			}
		case "answer_incorrect", "struggle":
			curChain = 0
			hadIncorrect[r.NodeID] = true
		case "request_hint", "click_cant_do":
			m.hintCount++
		}
		dateSet[r.CreatedAt.Format("2006-01-02")] = true
	}

	var chapters int64
	if err := s.db.WithContext(ctx).
		Model(&model.StudentTopicMastery{}).
		Where("student_id = ? AND mastery_status = ?", studentID, "mastered").
		Count(&chapters).Error; err != nil {
		return metrics{}, err
	}
	m.chapters = int(chapters)

	m.currentStreak, m.longestStreak = computeStreaks(dateSet)
	m.stars = 10*m.correctCount + 50*m.chapters
	m.xp = m.stars
	return m, nil
}

func computeStreaks(dateSet map[string]bool) (current, longest int) {
	if len(dateSet) == 0 {
		return 0, 0
	}
	dates := make([]time.Time, 0, len(dateSet))
	for d := range dateSet {
		if t, err := time.Parse("2006-01-02", d); err == nil {
			dates = append(dates, t)
		}
	}
	sort.Slice(dates, func(i, j int) bool { return dates[i].Before(dates[j]) })

	longest = 1
	run := 1
	for i := 1; i < len(dates); i++ {
		if isNextDay(dates[i-1], dates[i]) {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
	}

	current = 1
	for i := len(dates) - 1; i > 0; i-- {
		if isNextDay(dates[i-1], dates[i]) {
			current++
		} else {
			break
		}
	}
	return current, longest
}

func isNextDay(a, b time.Time) bool {
	diff := b.Sub(a).Hours()
	return diff > 23.0 && diff < 25.0
}

func metricValue(b model.Badge, m metrics) int {
	switch b.Metric {
	case MetricChapters:
		return m.chapters
	case MetricStreak:
		return m.longestStreak
	case MetricCorrectChain:
		return m.correctChain
	case MetricResilience:
		return m.resilience
	case MetricCurious:
		return m.hintCount
	case MetricStars:
		return m.stars
	default:
		return 0
	}
}

// GetSummary trả toàn bộ hồ sơ gamification (không ghi DB).
func (s *Service) GetSummary(ctx context.Context, studentID uuid.UUID) (Summary, error) {
	m, err := s.computeMetrics(ctx, studentID)
	if err != nil {
		return Summary{}, err
	}
	badges, err := s.repo.ListBadges(ctx)
	if err != nil {
		return Summary{}, err
	}
	awarded, err := s.repo.ListStudentBadgeMap(ctx, studentID)
	if err != nil {
		return Summary{}, err
	}

	views := make([]BadgeView, 0, len(badges))
	earned := 0
	for _, b := range badges {
		val := metricValue(b, m)
		view := BadgeView{
			Code: b.Code, Name: b.Name, Description: b.Description, Criteria: b.Criteria,
			Glyph: b.Glyph, Shape: b.Shape, ColorFrom: b.ColorFrom, ColorTo: b.ColorTo,
			Category: b.Category, Threshold: b.Threshold, Progress: val,
		}
		if at, ok := awarded[b.ID]; ok {
			awardedAt := at
			view.Status = StatusEarned
			view.Pct = 100
			view.AwardedAt = &awardedAt
			earned++
		} else if b.Metric == MetricManual || b.Threshold <= 0 {
			view.Status = StatusLocked
		} else if val > 0 {
			view.Status = StatusProgress
			pct := val * 100 / b.Threshold
			if pct > 99 {
				pct = 99
			}
			view.Pct = pct
		} else {
			view.Status = StatusLocked
		}
		views = append(views, view)
	}

	level := m.xp/xpPerLevel + 1
	return Summary{
		StudentID:     studentID.String(),
		XP:            m.xp,
		Stars:         m.stars,
		Level:         level,
		XPIntoLevel:   m.xp % xpPerLevel,
		XPForLevel:    xpPerLevel,
		CurrentStreak: m.currentStreak,
		LongestStreak: m.longestStreak,
		EarnedCount:   earned,
		TotalCount:    len(badges),
		Badges:        views,
	}, nil
}

// EvaluateAndAward trao các huy hiệu học sinh vừa đủ điều kiện (idempotent).
func (s *Service) EvaluateAndAward(ctx context.Context, studentID uuid.UUID) error {
	m, err := s.computeMetrics(ctx, studentID)
	if err != nil {
		return err
	}
	badges, err := s.repo.ListBadges(ctx)
	if err != nil {
		return err
	}
	awarded, err := s.repo.ListStudentBadgeMap(ctx, studentID)
	if err != nil {
		return err
	}
	now := time.Now()
	for _, b := range badges {
		if _, ok := awarded[b.ID]; ok {
			continue
		}
		if b.Metric == MetricManual || b.Threshold <= 0 {
			continue
		}
		if metricValue(b, m) >= b.Threshold {
			if err := s.repo.AwardBadge(ctx, studentID, b.ID, now); err != nil {
				return err
			}
		}
	}
	return nil
}
