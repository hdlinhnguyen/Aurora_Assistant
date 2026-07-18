package model_test

import (
	"encoding/json"
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type scoreRecord struct {
	ID    uint `gorm:"primaryKey"`
	Score model.Score
}

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

func TestExamMigrationCreatesCreatedByForeignKey(t *testing.T) {
	db := testutil.OpenPostgres(t)
	if err := db.AutoMigrate(&model.User{}, &model.Exam{}); err != nil {
		t.Fatal(err)
	}
	if !db.Migrator().HasConstraint(&model.Exam{}, "Creator") {
		t.Fatal("missing Exam.CreatedBy foreign key to User")
	}
}

func TestScoreValueRejectsInvalidDirectConstruction(t *testing.T) {
	for _, raw := range []string{"1.239", "100000.00", "-100000.00"} {
		score := model.Score{Decimal: decimal.RequireFromString(raw)}
		if _, err := score.Value(); err == nil {
			t.Errorf("Score.Value() accepted invalid direct value %s", raw)
		}
	}
}

func TestScorePersistenceRejectsInvalidDirectConstruction(t *testing.T) {
	db := testutil.OpenPostgres(t)
	if err := db.AutoMigrate(&scoreRecord{}); err != nil {
		t.Fatal(err)
	}

	record := scoreRecord{
		Score: model.Score{Decimal: decimal.RequireFromString("1.239")},
	}
	quietDB := db.Session(&gorm.Session{Logger: logger.Default.LogMode(logger.Silent)})
	if err := quietDB.Create(&record).Error; err == nil {
		t.Fatal("persistence accepted a directly constructed score with excessive scale")
	}
}

func TestScoreMarshalJSONRejectsInvalidDirectConstruction(t *testing.T) {
	for _, raw := range []string{"1.239", "100000.00", "-100000.00"} {
		score := model.Score{Decimal: decimal.RequireFromString(raw)}
		if _, err := json.Marshal(score); err == nil {
			t.Errorf("json.Marshal accepted invalid direct score %s", raw)
		}
	}
}
