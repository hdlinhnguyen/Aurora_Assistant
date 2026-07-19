package mastery

import (
	"context"
	"sort"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
)

// ReviewItem là một chủ đề được đề xuất ôn tập, kèm lý do và độ ưu tiên.
type ReviewItem struct {
	NodeID        string  `json:"nodeId"`
	Name          string  `json:"name"`
	TopicGroup    string  `json:"topicGroup"`
	MasteryPct    int     `json:"masteryPct"`
	ConfidencePct int     `json:"confidencePct"`
	Status        string  `json:"status"`
	Reason        string  `json:"reason"`
	Priority      float64 `json:"priority"`
	DaysSince     int     `json:"daysSince"` // số ngày kể từ lần luyện gần nhất (-1 nếu chưa rõ)
}

// BuildReviewPath sinh LỘ TRÌNH ÔN TẬP dựa trên hồ sơ BKT: chọn các chủ đề đã có
// bằng chứng nhưng chưa vững (điểm yếu / đang học / chưa chắc) và các chủ đề đã thạo
// nhưng lâu không ôn hoặc độ tự tin thấp (spaced repetition), xếp theo độ ưu tiên ôn.
//
// Ưu tiên ôn cao khi: mastery thấp, độ tự tin thấp, và chủ đề là nền tảng cho nhiều
// chủ đề khác (tác động xuôi dòng lớn) — vá gốc yếu trước để không kéo lùi cả nhánh.
func (s *Service) BuildReviewPath(ctx context.Context, studentID uuid.UUID, subject string, limit int) ([]ReviewItem, error) {
	profile, err := s.GetProfile(ctx, studentID, subject)
	if err != nil {
		return nil, err
	}

	var nodes []model.Node
	if err := s.db.WithContext(ctx).Where("subject = ?", subject).Find(&nodes).Error; err != nil {
		return nil, err
	}
	var edges []model.Edge
	if err := s.db.WithContext(ctx).Where("subject = ?", subject).Find(&edges).Error; err != nil {
		return nil, err
	}

	nameByID := make(map[uuid.UUID]string, len(nodes))
	groupByID := make(map[uuid.UUID]string, len(nodes))
	isRoot := make(map[uuid.UUID]bool, len(nodes))
	for _, n := range nodes {
		nameByID[n.ID] = n.Name
		groupByID[n.ID] = n.TopicGroup
		isRoot[n.ID] = n.IsRoot
	}

	// children[source] = các nút phụ thuộc vào source (cạnh tiên quyết -> phụ thuộc).
	children := make(map[uuid.UUID][]uuid.UUID, len(edges))
	for _, e := range edges {
		children[e.SourceID] = append(children[e.SourceID], e.TargetID)
	}
	// downstreamCount: số hậu duệ (chủ đề bị chặn nếu nút này yếu) qua BFS.
	downstreamCount := func(root uuid.UUID) int {
		seen := map[uuid.UUID]bool{root: true}
		queue := []uuid.UUID{root}
		count := 0
		for len(queue) > 0 {
			cur := queue[0]
			queue = queue[1:]
			for _, ch := range children[cur] {
				if !seen[ch] {
					seen[ch] = true
					count++
					queue = append(queue, ch)
				}
			}
		}
		return count
	}

	statusWeight := map[string]float64{
		StatusConfirmedGap: 1.00,
		StatusLearning:     0.85,
		StatusUncertain:    0.70,
		StatusMastered:     0.30,
	}
	reasonOf := func(status string, stale bool) string {
		switch status {
		case StatusConfirmedGap:
			return "Điểm yếu — cần ôn lại gốc"
		case StatusLearning:
			return "Đang học dở — luyện thêm cho vững"
		case StatusUncertain:
			return "Chưa chắc chắn — ôn để chắc gốc"
		case StatusMastered:
			if stale {
				return "Đã thạo nhưng lâu chưa ôn — ôn lại kẻo quên"
			}
			return "Ôn lại cho vững"
		default:
			return "Nên ôn lại"
		}
	}

	now := time.Now().UTC()
	maxDesc := 1
	for _, n := range nodes {
		if d := downstreamCount(n.ID); d > maxDesc {
			maxDesc = d
		}
	}

	items := make([]ReviewItem, 0, len(profile.Topics))
	for idStr, st := range profile.Topics {
		nodeID, parseErr := uuid.Parse(idStr)
		if parseErr != nil || isRoot[nodeID] {
			continue // bỏ nút gốc cấu trúc
		}
		// unknown = chưa có bằng chứng → thuộc lộ trình HỌC, không phải ôn tập.
		if st.Status == StatusUnknown {
			continue
		}

		daysSince := -1
		if st.LastEvidenceAt != nil {
			daysSince = int(now.Sub(*st.LastEvidenceAt).Hours() / 24)
		}
		// Chủ đề đã thạo: chỉ đưa vào ôn nếu "cũ" (>=14 ngày) hoặc độ tự tin còn thấp.
		stale := daysSince >= 14 || st.ConfidenceScore < 0.6
		if st.Status == StatusMastered && !stale {
			continue
		}

		w := statusWeight[st.Status]
		if w == 0 {
			w = 0.5
		}
		masteryGap := 1 - st.MasteryProbability
		confidenceGap := 1 - st.ConfidenceScore
		downstreamNorm := float64(downstreamCount(nodeID)) / float64(maxDesc)
		// Ưu tiên = trọng số trạng thái × (thiếu hụt mastery + thiếu tự tin) × (1 + nền tảng).
		priority := w*(0.6*masteryGap+0.4*confidenceGap)*(1+0.5*downstreamNorm)
		// Bonus spaced-repetition cho chủ đề đã thạo nhưng để lâu.
		if st.Status == StatusMastered && daysSince > 14 {
			priority += 0.1
		}

		name := nameByID[nodeID]
		if name == "" {
			continue
		}
		items = append(items, ReviewItem{
			NodeID:        idStr,
			Name:          name,
			TopicGroup:    groupByID[nodeID],
			MasteryPct:    int(st.MasteryProbability*100 + 0.5),
			ConfidencePct: int(st.ConfidenceScore*100 + 0.5),
			Status:        st.Status,
			Reason:        reasonOf(st.Status, stale),
			Priority:      priority,
			DaysSince:     daysSince,
		})
	}

	sort.Slice(items, func(i, j int) bool {
		if items[i].Priority != items[j].Priority {
			return items[i].Priority > items[j].Priority
		}
		return items[i].MasteryPct < items[j].MasteryPct
	})
	if limit > 0 && len(items) > limit {
		items = items[:limit]
	}
	return items, nil
}
