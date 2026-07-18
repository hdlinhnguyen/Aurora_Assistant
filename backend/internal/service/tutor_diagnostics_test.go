package service

import (
	"encoding/json"
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

func setupDiagnosticsDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := testutil.OpenPostgres(t)
	if err := db.AutoMigrate(
		&model.User{},
		&model.Node{},
		&model.Edge{},
		&model.Question{},
		&model.StudentState{},
		&model.ActivityLog{},
	); err != nil {
		t.Fatal(err)
	}
	return db
}

func TestTutorServiceSubmitAnswerDistractorMapping(t *testing.T) {
	db := setupDiagnosticsDB(t)
	svc := NewTutorService(db, nil)
	studentID := uuid.New()
	if err := db.Create(&model.User{
		ID: studentID, Email: "diagnostics-student@example.test",
		Password: "test", Name: "Diagnostics Student", Role: "student",
	}).Error; err != nil {
		t.Fatal(err)
	}

	subject := "Toan dai so"
	source := model.Node{ID: uuid.New(), Subject: subject, Name: "Quy dong mau so", StableKey: "source", Status: "active"}
	target := model.Node{ID: uuid.New(), Subject: subject, Name: "Cong phan so", StableKey: "target", Status: "active"}
	if err := db.Create(&[]model.Node{source, target}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Edge{
		ID: uuid.New(), Subject: subject, SourceID: source.ID, TargetID: target.ID,
		Status: "active", SourceType: "rule",
	}).Error; err != nil {
		t.Fatal(err)
	}
	mappings, _ := json.Marshal(map[string]string{"1": source.ID.String()})
	question := model.Question{
		ID: uuid.New(), NodeID: target.ID, Content: "1/2 + 1/3",
		OptionsJSON: `["5/6","2/5","2/6","5/5"]`, CorrectOption: 0,
		Difficulty: "medium", DistractorMappings: string(mappings),
	}
	if err := db.Create(&question).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.StudentState{
		ID: uuid.New(), StudentID: studentID, Subject: subject,
		InitialLevelNodeID: target.ID, CurrentLevelNodeID: target.ID,
	}).Error; err != nil {
		t.Fatal(err)
	}

	correct, _, err := svc.SubmitAnswer(studentID, target.ID, question.ID, 1)
	if err != nil {
		t.Fatal(err)
	}
	if correct {
		t.Fatal("expected an incorrect answer")
	}
	var state model.StudentState
	if err := db.Where("student_id = ? AND subject = ?", studentID, subject).First(&state).Error; err != nil {
		t.Fatal(err)
	}
	if state.CurrentLevelNodeID != source.ID {
		t.Fatalf("current node = %s, want distractor node %s", state.CurrentLevelNodeID, source.ID)
	}
	var logs []model.ActivityLog
	if err := db.Where("student_id = ? AND node_id = ?", studentID, source.ID).Find(&logs).Error; err != nil {
		t.Fatal(err)
	}
	found := false
	for _, log := range logs {
		if log.Action == "struggle" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected struggle activity on distractor node")
	}
}

func TestTutorServiceGetClassInterventionGroups(t *testing.T) {
	db := setupDiagnosticsDB(t)
	svc := NewTutorService(db, nil)
	subject := "Toan dai so"
	node := model.Node{ID: uuid.New(), Subject: subject, Name: "Cong phan so", StableKey: "gap", Status: "active"}
	if err := db.Create(&node).Error; err != nil {
		t.Fatal(err)
	}
	st1 := model.User{ID: uuid.New(), Email: "student-one@example.test", Name: "Student One", Role: "student"}
	st2 := model.User{ID: uuid.New(), Email: "student-two@example.test", Name: "Student Two", Role: "student"}
	if err := db.Create(&[]model.User{st1, st2}).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.LogActivity(st1.ID, subject, node.ID, "struggle", "wrong"); err != nil {
		t.Fatal(err)
	}
	if err := svc.LogActivity(st2.ID, subject, node.ID, "mastered", "correct"); err != nil {
		t.Fatal(err)
	}

	result, err := svc.GetClassInterventionGroups(subject)
	if err != nil {
		t.Fatal(err)
	}
	topGaps := result["topGaps"].([]map[string]interface{})
	groups := result["groups"].([]map[string]interface{})
	if len(topGaps) != 1 || topGaps[0]["struggleCount"].(int) != 1 {
		t.Fatalf("top gaps = %#v", topGaps)
	}
	if len(groups) != 1 {
		t.Fatalf("groups = %#v", groups)
	}
	students := groups[0]["students"].([]map[string]interface{})
	if len(students) != 1 || students[0]["studentName"] != "Student One" {
		t.Fatalf("group students = %#v", students)
	}
}
