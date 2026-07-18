package handler

import (
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestTutorLearningPathUsesConfiguredURL(t *testing.T) {
	tests := []struct {
		name   string
		suffix string
	}{
		{name: "base URL"},
		{name: "base URL with trailing slash", suffix: "/"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(nil)
			defer server.Close()

			handler := NewTutorHandler(nil, WithLearningPathURL(server.URL+test.suffix))
			require.Equal(t, server.URL, handler.learningPathURL)
		})
	}
}
