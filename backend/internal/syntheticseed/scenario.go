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
