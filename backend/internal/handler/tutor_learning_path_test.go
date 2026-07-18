package handler

import (
	"encoding/json"
	"net/http"
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
			var path string
			var payload map[string]string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				path = r.URL.Path
				require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
				w.WriteHeader(http.StatusCreated)
				_, _ = w.Write([]byte(`{"status":"created"}`))
			}))
			defer server.Close()

			handler := NewTutorHandler(nil, WithLearningPathURL(server.URL+test.suffix))
			body, status, err := handler.postLearningPathPython(
				"/learning-path",
				map[string]string{"subject": "toan"},
			)

			require.NoError(t, err)
			require.Equal(t, http.StatusCreated, status)
			require.JSONEq(t, `{"status":"created"}`, string(body))
			require.Equal(t, "/learning-path", path)
			require.Equal(t, "toan", payload["subject"])
		})
	}
}
