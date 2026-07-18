package adminmetrics

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func mustRange(t *testing.T, value string) Range {
	t.Helper()
	result, err := ParseRange(value)
	require.NoError(t, err)
	return result
}

func TestParseRange(t *testing.T) {
	require.Equal(t, Range30d, mustRange(t, "30d"))
	require.Equal(t, Range7d, mustRange(t, "7d"))
	require.Equal(t, Range90d, mustRange(t, "90d"))
	require.Equal(t, 30*day, Range30d.Duration())

	_, err := ParseRange("14d")
	require.ErrorIs(t, err, ErrInvalidRange)
	_, err = ParseRange(" 30d ")
	require.ErrorIs(t, err, ErrInvalidRange)
}

func TestPercentDeltaUsesAbsolutePreviousAndNullsZero(t *testing.T) {
	current, previous := 45.0, 50.0
	require.InDelta(t, -10.0, *percentDelta(&current, &previous), 0.001)

	zero := 0.0
	require.Nil(t, percentDelta(&current, &zero))
	require.Nil(t, percentDelta(nil, &previous))
	require.Nil(t, percentDelta(&current, nil))
}
