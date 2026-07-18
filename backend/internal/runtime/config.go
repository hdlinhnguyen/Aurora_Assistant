package runtime

import (
	"os"
	"strings"
)

var defaultCORSOrigins = []string{
	"http://localhost:3000",
	"http://localhost:3001",
}

func LearningPathURL() string {
	baseURL := strings.TrimSpace(os.Getenv("LEARNING_PATH_URL"))
	if baseURL == "" {
		return "http://127.0.0.1:8000"
	}
	return strings.TrimRight(baseURL, "/")
}

func CORSOrigins() []string {
	raw := strings.TrimSpace(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if raw == "" {
		return append([]string(nil), defaultCORSOrigins...)
	}

	origins := make([]string, 0)
	for _, origin := range strings.Split(raw, ",") {
		if origin = strings.TrimSpace(origin); origin != "" {
			origins = append(origins, origin)
		}
	}
	return origins
}
