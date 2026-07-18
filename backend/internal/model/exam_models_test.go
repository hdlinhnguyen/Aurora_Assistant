package model_test

import (
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"
)

func TestExamModelsMigrateWithExpectedConstraints(t *testing.T) {
	db := testutil.OpenPostgres(t)
	err := db.AutoMigrate(
		&model.User{},
		&model.Node{},
		&model.Question{},
		&model.Exam{},
		&model.ExamQuestion{},
		&model.ExamRubricItem{},
		&model.ExamSnapshot{},
		&model.ExamGradingProgress{},
		&model.ExamInternalEvent{},
		&model.ExamExport{},
		&model.ExamAuditLog{},
	)
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{
		"exams", "exam_questions", "exam_rubric_items", "exam_snapshots",
		"exam_grading_progresses", "exam_internal_events", "exam_exports",
		"exam_audit_logs",
	} {
		if !db.Migrator().HasTable(table) {
			t.Fatalf("missing table %s", table)
		}
	}
}

func TestScoreRejectsMoreThanTwoDecimalPlaces(t *testing.T) {
	if _, err := model.ParseScore("1.234"); err == nil {
		t.Fatal("expected scale validation error")
	}
	score, err := model.ParseScore("10.00")
	if err != nil || score.String() != "10.00" {
		t.Fatalf("unexpected score: %v %v", score, err)
	}
}
