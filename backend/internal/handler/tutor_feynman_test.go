package handler

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"backend/internal/config"
	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

func newFeynmanTestApp(userID string) *fiber.App {
	app := fiber.New()
	handler := &TutorHandler{}
	app.Post("/events/feynman", func(c fiber.Ctx) error {
		if userID != "" {
			c.Locals("userID", userID)
		}
		return c.Next()
	}, handler.SubmitFeynmanEvent)
	return app
}

func postFeynman(t *testing.T, app *fiber.App, body string) *http.Response {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/events/feynman", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	return response
}

func TestFeynmanEventRejectsMissingUser(t *testing.T) {
	app := newFeynmanTestApp("")
	response := postFeynman(t, app, `{"explanation":"vì sao","clarityScore":50}`)
	defer response.Body.Close()
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", response.StatusCode)
	}
}

func TestFeynmanEventValidatesBody(t *testing.T) {
	for name, body := range map[string]string{
		"empty explanation":  `{"explanation":"   ","clarityScore":50}`,
		"score out of range": `{"explanation":"giảng bài","clarityScore":120}`,
		"negative score":     `{"explanation":"giảng bài","clarityScore":-3}`,
	} {
		t.Run(name, func(t *testing.T) {
			app := newFeynmanTestApp(uuid.NewString())
			response := postFeynman(t, app, body)
			defer response.Body.Close()
			if response.StatusCode != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400", response.StatusCode)
			}
		})
	}
}

func TestFeynmanEventPersistsSessionAndMessageForDashboard(t *testing.T) {
	db := testutil.OpenPostgres(t)
	if err := db.AutoMigrate(&model.User{}, &model.Node{}, &model.ChatSession{}, &model.Message{}); err != nil {
		t.Fatal(err)
	}
	restore := config.DB
	config.DB = db
	t.Cleanup(func(old *gorm.DB) func() { return func() { config.DB = old } }(restore))

	student := model.User{
		ID: uuid.New(), Email: uuid.NewString() + "@example.test",
		Password: "test-only", Name: "Học sinh", Role: "student",
	}
	node := model.Node{ID: uuid.New(), Subject: "Toán 5", Name: "Cộng phân số khác mẫu"}
	if err := db.Create(&student).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&node).Error; err != nil {
		t.Fatal(err)
	}

	app := newFeynmanTestApp(student.ID.String())
	body := `{"nodeId":"` + node.ID.String() + `","explanation":"Muốn cộng phải quy đồng mẫu số chung","clarityScore":82,"subScores":{"Rõ ràng":80},"vagueSpots":["Chưa có ví dụ"]}`

	response := postFeynman(t, app, body)
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		raw, _ := io.ReadAll(response.Body)
		t.Fatalf("status = %d, want 201: %s", response.StatusCode, raw)
	}

	var session model.ChatSession
	if err := db.First(&session, "student_id = ? AND mode = ?", student.ID, "feynman").Error; err != nil {
		t.Fatal(err)
	}
	if session.Topic != node.Name {
		t.Fatalf("session topic = %q, want %q", session.Topic, node.Name)
	}

	var message model.Message
	if err := db.First(&message, "session_id = ?", session.ID).Error; err != nil {
		t.Fatal(err)
	}
	if message.FeynmanScore != 82 {
		t.Fatalf("feynman score = %d, want 82", message.FeynmanScore)
	}
	if !message.IsCorrectStep {
		t.Fatal("feynman message must not count as incorrect step (would pollute studentsNeedHelp)")
	}
	if !strings.Contains(message.AxiomsJSON, "vagueSpots") {
		t.Fatalf("axioms json missing metadata: %s", message.AxiomsJSON)
	}

	// Lần giảng thứ hai cùng bài → cùng phiên, thêm message (điểm TB phiên phản ánh tiến bộ).
	second := postFeynman(t, app, body)
	defer second.Body.Close()
	if second.StatusCode != http.StatusCreated {
		t.Fatalf("second status = %d, want 201", second.StatusCode)
	}
	var sessionCount, messageCount int64
	db.Model(&model.ChatSession{}).Where("student_id = ?", student.ID).Count(&sessionCount)
	db.Model(&model.Message{}).Where("session_id = ?", session.ID).Count(&messageCount)
	if sessionCount != 1 {
		t.Fatalf("session count = %d, want 1 (reuse per topic)", sessionCount)
	}
	if messageCount != 2 {
		t.Fatalf("message count = %d, want 2", messageCount)
	}
}
