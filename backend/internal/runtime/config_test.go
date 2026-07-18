package runtime

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLearningPathURL(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want string
	}{
		{name: "default", want: "http://127.0.0.1:8000"},
		{name: "trim trailing slash", raw: "https://python.railway.internal/", want: "https://python.railway.internal"},
		{name: "trim whitespace", raw: "  https://python.railway.internal///  ", want: "https://python.railway.internal"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("LEARNING_PATH_URL", test.raw)
			require.Equal(t, test.want, LearningPathURL())
		})
	}
}

func TestCORSOrigins(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", " https://app.example , ,http://localhost:3000 ")

	require.Equal(t, []string{"https://app.example", "http://localhost:3000"}, CORSOrigins())
}

func TestCORSOriginsDefault(t *testing.T) {
	t.Setenv("CORS_ALLOWED_ORIGINS", "")

	require.Equal(t, []string{"http://localhost:3000", "http://localhost:3001"}, CORSOrigins())
}
