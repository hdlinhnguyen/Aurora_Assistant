package service

import (
	"backend/internal/model"
	"encoding/json"
	"fmt"
	"os"
	"testing"

	"github.com/google/uuid"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func setupTestDB() (*gorm.DB, error) {
	host := os.Getenv("DB_HOST")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")
	port := os.Getenv("DB_PORT")
	sslmode := os.Getenv("DB_SSLMODE")

	if host == "" { host = "localhost" }
	if user == "" { user = "aurora" }
	if password == "" { password = "password123" }
	if dbname == "" { dbname = "aurora_dev" }
	if port == "" { port = "5434" }
	if sslmode == "" { sslmode = "disable" }

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
		host, user, password, dbname, port, sslmode)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, err
	}
	return db, nil
}

func TestTutorService_SubmitAnswer_DistractorMapping(t *testing.T) {
	db, err := setupTestDB()
	if err != nil {
		t.Skip("Bỏ qua test DB: Không thể kết nối tới PostgreSQL local:", err)
		return
	}

	// Clean up potential leftovers
	db.Exec("DELETE FROM activity_logs")
	db.Exec("DELETE FROM student_states")
	db.Exec("DELETE FROM questions")
	db.Exec("DELETE FROM edges")
	db.Exec("DELETE FROM nodes")
	db.Exec("DELETE FROM users WHERE role = 'student'")

	svc := NewTutorService(db, nil) // passing nil for aiService for simple GORM tests

	studentID := uuid.New()
	student := model.User{
		ID:       studentID,
		Email:    "test-student@aurora.edu.vn",
		Password: "password",
		Name:     "Học sinh kiểm thử",
		Role:     "student",
	}
	if err := db.Create(&student).Error; err != nil {
		t.Fatalf("Lỗi tạo học sinh test: %v", err)
	}

	// 1. Setup two nodes
	subject := "Toán đại số"
	n1 := model.Node{
		ID:        uuid.New(),
		Subject:   subject,
		Name:      "Quy đồng mẫu số",
		StableKey: "l5-alg-quydong",
		Status:    "active",
	}
	n2 := model.Node{
		ID:        uuid.New(),
		Subject:   subject,
		Name:      "Cộng phân số khác mẫu",
		StableKey: "l5-alg-congkhacmau",
		Status:    "active",
	}
	db.Create(&n1)
	db.Create(&n2)

	// Prerequisite Edge: n1 -> n2
	edge := model.Edge{
		ID:        uuid.New(),
		Subject:   subject,
		SourceID:  n1.ID,
		TargetID:  n2.ID,
		Status:    "active",
		SourceType: "rule",
	}
	db.Create(&edge)

	// 2. Setup Question on n2 with Distractor mapping pointing to n1 for option index 1 (incorrect option)
	mappings := map[string]string{
		"1": n1.ID.String(), // index 1 incorrect answers point to n1 (Quy đồng mẫu số)
	}
	mappingsJSON, _ := json.Marshal(mappings)

	q := model.Question{
		ID:                 uuid.New(),
		NodeID:             n2.ID,
		Content:            "Tính 1/2 + 1/3",
		OptionsJSON:        `["5/6", "2/5", "2/6", "5/5"]`,
		CorrectOption:      0, // correct is "5/6"
		Difficulty:         "medium",
		DistractorMappings: string(mappingsJSON),
	}
	db.Create(&q)

	// Create initial StudentState at n2
	state := model.StudentState{
		ID:                 uuid.New(),
		StudentID:          studentID,
		Subject:            subject,
		InitialLevelNodeID: n2.ID,
		CurrentLevelNodeID: n2.ID,
	}
	db.Create(&state)

	// 3. Submit INCORRECT answer on index 1 (should trigger diagnostic jump to n1)
	isCorrect, _, err := svc.SubmitAnswer(studentID, n2.ID, q.ID, 1)
	if err != nil {
		t.Fatalf("Lỗi SubmitAnswer: %v", err)
	}
	if isCorrect {
		t.Error("Expected answer to be incorrect, got isCorrect = true")
	}

	// Verify diagnostic path redirection to n1
	var updatedState model.StudentState
	db.Where("student_id = ? AND subject = ?", studentID, subject).First(&updatedState)
	if updatedState.CurrentLevelNodeID != n1.ID {
		t.Errorf("Expected current diagnostic level redirected to %s (n1), but got %s", n1.ID, updatedState.CurrentLevelNodeID)
	}

	// Verify logged struggle on n1
	var logs []model.ActivityLog
	db.Where("student_id = ? AND node_id = ?", studentID, n1.ID).Find(&logs)
	var hasStruggle bool
	for _, l := range logs {
		if l.Action == "struggle" {
			hasStruggle = true
		}
	}
	if !hasStruggle {
		t.Error("Expected to find struggle activity log on the mapped node, but none found")
	}
}

func TestTutorService_GetClassInterventionGroups(t *testing.T) {
	db, err := setupTestDB()
	if err != nil {
		t.Skip("Bỏ qua test DB: Không thể kết nối tới PostgreSQL local:", err)
		return
	}

	db.Exec("DELETE FROM activity_logs")
	db.Exec("DELETE FROM student_states")
	db.Exec("DELETE FROM questions")
	db.Exec("DELETE FROM edges")
	db.Exec("DELETE FROM nodes")
	db.Exec("DELETE FROM users WHERE role = 'student'")

	svc := NewTutorService(db, nil)

	subject := "Toán đại số"
	node := model.Node{
		ID:        uuid.New(),
		Subject:   subject,
		Name:      "Cộng phân số khác mẫu",
		StableKey: "l5-alg-congkhacmau",
		Status:    "active",
	}
	db.Create(&node)

	// Create 2 students
	st1 := model.User{ID: uuid.New(), Email: "st1@aurora.edu.vn", Name: "Student One", Role: "student"}
	st2 := model.User{ID: uuid.New(), Email: "st2@aurora.edu.vn", Name: "Student Two", Role: "student"}
	db.Create(&st1)
	db.Create(&st2)

	// Student 1 struggles, Student 2 masters
	svc.LogActivity(st1.ID, subject, node.ID, "struggle", "Lỗi sai")
	svc.LogActivity(st2.ID, subject, node.ID, "mastered", "Làm tốt")

	res, err := svc.GetClassInterventionGroups(subject)
	if err != nil {
		t.Fatalf("Lỗi GetClassInterventionGroups: %v", err)
	}

	topGaps := res["topGaps"].([]map[string]interface{})
	groups := res["groups"].([]map[string]interface{})

	if len(topGaps) != 1 {
		t.Fatalf("Expected 1 top gap node, got %d", len(topGaps))
	}
	struggleCount := topGaps[0]["struggleCount"].(int)
	if struggleCount != 1 {
		t.Errorf("Expected struggle count to be 1 (only st1), got %d", struggleCount)
	}

	if len(groups) != 1 {
		t.Fatalf("Expected 1 intervention group, got %d", len(groups))
	}
	studentsList := groups[0]["students"].([]map[string]interface{})
	if len(studentsList) != 1 {
		t.Fatalf("Expected 1 student in group, got %d", len(studentsList))
	}

	matchedStudentName := studentsList[0]["studentName"].(string)
	if matchedStudentName != "Student One" {
		t.Errorf("Expected struggling student to be 'Student One', got %s", matchedStudentName)
	}
}
