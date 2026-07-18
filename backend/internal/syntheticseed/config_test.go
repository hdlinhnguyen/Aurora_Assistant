package syntheticseed

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestEnabledDefaultsToTrueAndOnlyFalseDisables(t *testing.T) {
	require.True(t, Enabled(""))
	require.True(t, Enabled("true"))
	require.True(t, Enabled("0"))
	require.False(t, Enabled("false"))
	require.False(t, Enabled(" FALSE "))
}

func TestDefaultConfigDefinesTeacherAndThreeStudents(t *testing.T) {
	config := DefaultConfig()
	require.Equal(t, "synthetic.teacher@aurora.local", config.Teacher.Email)
	require.Equal(t, "teacher", config.Teacher.Role)
	require.Len(t, config.Students, 3)
	require.Equal(t, "student", config.Students[1].Role)
	require.Equal(t, "synthetic.student.b@aurora.local", config.Students[1].Email)
	require.NotEmpty(t, config.Subject)
}
