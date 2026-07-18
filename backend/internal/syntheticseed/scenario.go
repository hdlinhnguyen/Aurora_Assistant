package syntheticseed

import (
	"math/rand"
	"time"
)

type Attempt struct {
	QuestionIndex    int
	Correct          bool
	OccurredAtOffset time.Duration
}

func GenerateAttempts(seed int64, studentIndex, topicIndex, questionCount int) []Attempt {
	if questionCount <= 0 {
		return nil
	}
	attemptCount := 6
	correctTarget := 5 - studentIndex*2
	if correctTarget < 1 {
		correctTarget = 1
	}
	if correctTarget > attemptCount {
		correctTarget = attemptCount
	}

	rng := rand.New(rand.NewSource(seed + int64(studentIndex*100+topicIndex)))
	order := rng.Perm(attemptCount)
	correctAt := make(map[int]struct{}, correctTarget)
	for _, index := range order[:correctTarget] {
		correctAt[index] = struct{}{}
	}

	attempts := make([]Attempt, 0, attemptCount)
	for index := 0; index < attemptCount; index++ {
		_, correct := correctAt[index]
		attempts = append(attempts, Attempt{
			QuestionIndex:    index % questionCount,
			Correct:          correct,
			OccurredAtOffset: time.Duration(topicIndex*24+index) * time.Minute,
		})
	}
	return attempts
}

// GenerateFrontierAttempts sinh evidence theo "frontier" năng lực: mỗi học sinh nắm
// vững các nút tới độ sâu tương ứng năng lực (A sâu / B vừa / C nông), phân hóa rõ
// dọc cả chuỗi kiến thức. Nút quá xa frontier → trả nil (không evidence = "unknown").
//   nodePos/totalNodes: vị trí nút theo thứ tự lớp (nông→sâu).
func GenerateFrontierAttempts(seed int64, studentIndex, nodePos, totalNodes, questionCount int) []Attempt {
	if questionCount <= 0 || totalNodes <= 0 {
		return nil
	}
	frontier := []float64{0.90, 0.55, 0.28} // A giỏi, B trung bình, C yếu
	f := 0.5
	if studentIndex >= 0 && studentIndex < len(frontier) {
		f = frontier[studentIndex]
	}
	depth := float64(nodePos) / float64(totalNodes)
	margin := f - depth
	if margin < -0.40 {
		return nil // chưa tới trình độ này → để "unknown"
	}
	attemptCount := 6
	var correctTarget int
	switch {
	case margin > 0.15:
		correctTarget = 5 // đã nắm vững → mastered
	case margin >= -0.15:
		correctTarget = 3 // đang học (vùng frontier)
	default:
		correctTarget = 1 // lỗ hổng
	}

	rng := rand.New(rand.NewSource(seed + int64(studentIndex*1000+nodePos)))
	order := rng.Perm(attemptCount)
	correctAt := make(map[int]struct{}, correctTarget)
	for _, idx := range order[:correctTarget] {
		correctAt[idx] = struct{}{}
	}
	attempts := make([]Attempt, 0, attemptCount)
	for i := 0; i < attemptCount; i++ {
		_, ok := correctAt[i]
		attempts = append(attempts, Attempt{
			QuestionIndex:    i % questionCount,
			Correct:          ok,
			OccurredAtOffset: time.Duration(nodePos*24+i) * time.Minute,
		})
	}
	return attempts
}
