package learningpath

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestNextStatusRequiresMasteryAndConfidence(t *testing.T) {
	tests := []struct {
		name                string
		mastery, confidence float64
		want                string
	}{
		{name: "mastery low", mastery: .79, confidence: .99, want: StatusInProgress},
		{name: "confidence low", mastery: .80, confidence: .59, want: StatusInProgress},
		{name: "exact boundary", mastery: .80, confidence: .60, want: StatusCompleted},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := NextStatus(StatusInProgress, 2, 1, "", tt.mastery, tt.confidence)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestNextStatusBlocksOnlyBelowHalfAfterThreeAttempts(t *testing.T) {
	require.Equal(t, StatusBlocked, NextStatus(StatusInProgress, 3, 1, "", .40, .40))
	require.Equal(t, StatusInProgress, NextStatus(StatusInProgress, 4, 2, "", .40, .40))
	require.Equal(t, StatusBlocked, NextStatus(StatusInProgress, 0, 0, BlockedReasonCantDo, .40, .40))
}
