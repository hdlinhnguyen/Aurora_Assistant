package handler

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestValidateLearningPathStudentsRejectsOutsideClass(t *testing.T) {
	if err := validateLearningPathStudents([]string{"s1", "s9"}, []string{"s1", "s2"}); err == nil {
		t.Fatal("expected student outside classroom to be rejected")
	}
}

func TestValidateLearningPathStudentsAcceptsSelectedClassStudents(t *testing.T) {
	if err := validateLearningPathStudents([]string{"s2", "s1"}, []string{"s1", "s2"}); err != nil {
		t.Fatalf("expected classroom students to be accepted: %v", err)
	}
}

func TestLearningPathEvidenceFiltersSubject(t *testing.T) {
	db := testutil.OpenPostgres(t)
	require.NoError(t, db.AutoMigrate(&model.ActivityLog{}))
	studentID := uuid.New()
	for _, subject := range []string{"Toan", "Van"} {
		require.NoError(t, db.Create(&model.ActivityLog{
			ID: uuid.New(), StudentID: studentID, Subject: subject, NodeID: uuid.New(),
			Action: "answer_incorrect", CreatedAt: time.Now().UTC(),
		}).Error)
	}

	evidence, err := learningPathEvidenceForDB(db, []string{studentID.String()}, "Toan")
	require.NoError(t, err)
	require.Len(t, evidence, 1)
}

func TestAutomaticDraftRejectsEmptySubject(t *testing.T) {
	teacherID := uuid.NewString()
	handler := NewTutorHandler(nil)
	app := fiber.New()
	app.Post("/teacher/learning-path/auto-drafts", func(c fiber.Ctx) error {
		c.Locals("userID", teacherID)
		return handler.CreateAutomaticLearningPathDrafts(c)
	})
	request := httptest.NewRequest("POST", "/teacher/learning-path/auto-drafts", strings.NewReader(`{}`))
	request.Header.Set("Content-Type", "application/json")

	response, err := app.Test(request)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusBadRequest, response.StatusCode)
}
