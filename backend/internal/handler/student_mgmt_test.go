package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"
	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAdminCanReadStudentsFromAnyClassroom(t *testing.T) {
	db := testutil.OpenPostgres(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Classroom{}))
	teacherID, adminID, classID := uuid.New(), uuid.New(), uuid.New()
	require.NoError(t, db.Create(&model.User{ID: teacherID, Email: "teacher@test.local", Password: "hash", Name: "Teacher", Role: "teacher"}).Error)
	require.NoError(t, db.Create(&model.Classroom{ID: classID, Name: "7A", TeacherID: teacherID}).Error)
	require.NoError(t, db.Create(&model.User{ID: uuid.New(), Email: "student@test.local", Password: "hash", Name: "Student", Role: "student", ClassroomID: &classID}).Error)

	app := fiber.New()
	app.Use(func(c fiber.Ctx) error {
		c.Locals("userID", adminID.String())
		c.Locals("user", &jwt.Token{Claims: jwt.MapClaims{"role": "admin"}})
		return c.Next()
	})
	app.Get("/teacher/classrooms/:classId/students", NewStudentMgmtHandler(db).GetClassroomStudents)

	response, err := app.Test(httptest.NewRequest(http.MethodGet, "/teacher/classrooms/"+classID.String()+"/students", nil))
	require.NoError(t, err)
	require.Equal(t, http.StatusOK, response.StatusCode)
	var students []model.User
	require.NoError(t, json.NewDecoder(response.Body).Decode(&students))
	require.Len(t, students, 1)
}
