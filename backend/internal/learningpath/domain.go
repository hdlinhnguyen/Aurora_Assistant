package learningpath

const (
	StatusPending    = "pending"
	StatusInProgress = "in_progress"
	StatusCompleted  = "completed"
	StatusBlocked    = "blocked"

	BlockedReasonLowAccuracy       = "low_accuracy"
	BlockedReasonCantDo            = "cant_do"
	BlockedReasonAdaptiveDowngrade = "adaptive_downgrade"

	CompletionMasteryThreshold    = 0.80
	CompletionConfidenceThreshold = 0.60
)

func NextStatus(current string, attempts, correctAnswers int, blockedReason string, mastery, confidence float64) string {
	if mastery >= CompletionMasteryThreshold && confidence >= CompletionConfidenceThreshold {
		return StatusCompleted
	}
	if blockedReason == BlockedReasonCantDo || blockedReason == BlockedReasonAdaptiveDowngrade {
		return StatusBlocked
	}
	if attempts >= 3 && float64(correctAnswers)/float64(attempts) < 0.50 {
		return StatusBlocked
	}
	if current == StatusBlocked {
		return StatusInProgress
	}
	return current
}
