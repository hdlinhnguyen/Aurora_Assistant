package handler

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"backend/internal/config"
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

func TestApproveLearningPathSubsetLeavesSiblingDraftPending(t *testing.T) {
	db := testutil.OpenPostgres(t)
	require.NoError(t, db.AutoMigrate(&model.LearningPath{}))
	previousDB := config.DB
	config.DB = db
	t.Cleanup(func() { config.DB = previousDB })
	teacherID, firstStudentID, secondStudentID := uuid.New(), uuid.New(), uuid.New()
	threadID := "thread-subset"
	classID := uuid.NewString()
	pathJSON := `{"ordered_steps":[{"order":1,"topic_id":"` + uuid.NewString() + `"}]}`
	for _, studentID := range []uuid.UUID{firstStudentID, secondStudentID} {
		require.NoError(t, db.Create(&model.LearningPath{
			ID: uuid.New(), TeacherID: teacherID, StudentID: studentID, ClassID: classID,
			ThreadID: threadID, Subject: "Toan", Source: "automatic", Status: "Draft", StepsJSON: pathJSON,
			CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
		}).Error)
	}
	var firstDraft model.LearningPath
	require.NoError(t, db.Where("student_id = ?", firstStudentID).First(&firstDraft).Error)
	initializer := &recordingProgressInitializer{}
	handler := NewTutorHandler(nil, WithLearningPathProgressInitializer(initializer))
	app := fiber.New()
	app.Post("/teacher/learning-path/:threadId/approve", func(c fiber.Ctx) error {
		c.Locals("userID", teacherID.String())
		return handler.ApproveLearningPath(c)
	})
	body, err := json.Marshal(fiber.Map{
		"approve": true, "studentIds": []string{firstStudentID.String()},
		"custom_paths": fiber.Map{firstStudentID.String(): json.RawMessage(firstDraft.StepsJSON)},
	})
	require.NoError(t, err)
	request := httptest.NewRequest("POST", "/teacher/learning-path/"+threadID+"/approve", strings.NewReader(string(body)))
	request.Header.Set("Content-Type", "application/json")

	response, err := app.Test(request)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusOK, response.StatusCode)
	var approvedCount, pendingSiblingCount int64
	require.NoError(t, db.Model(&model.LearningPath{}).Where("student_id = ? AND status = ?", firstStudentID, "Approved").Count(&approvedCount).Error)
	require.NoError(t, db.Model(&model.LearningPath{}).Where("student_id = ? AND status = ?", secondStudentID, "Draft").Count(&pendingSiblingCount).Error)
	require.Equal(t, int64(1), approvedCount)
	require.Equal(t, int64(1), pendingSiblingCount)
	require.NotEqual(t, uuid.Nil, initializer.pathID)
}
