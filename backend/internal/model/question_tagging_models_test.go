package model_test

import (
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
)

type legacyQuestion struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey"`
	NodeID        uuid.UUID `gorm:"type:uuid;not null;index"`
	Content       string    `gorm:"type:text;not null"`
	OptionsJSON   string    `gorm:"type:text;not null"`
	CorrectOption int       `gorm:"type:integer;not null"`
	Difficulty    string    `gorm:"type:varchar(20);default:'medium'"`
}

func (legacyQuestion) TableName() string {
	return "questions"
}

func TestLegacyQuestionDefaultsToMultipleChoice(t *testing.T) {
	db := testutil.OpenPostgres(t)
	if err := db.AutoMigrate(&model.Node{}, &model.Question{}); err != nil {
		t.Fatal(err)
	}

	node := model.Node{
		ID:      uuid.New(),
		Subject: "Toán",
		Name:    "Phân số",
	}
	if err := db.Create(&node).Error; err != nil {
		t.Fatal(err)
	}

	question := model.Question{
		ID:            uuid.New(),
		NodeID:        node.ID,
		Content:       "1 + 1 = ?",
		OptionsJSON:   `["1","2"]`,
		CorrectOption: 1,
	}
	if err := db.Create(&question).Error; err != nil {
		t.Fatal(err)
	}

	var stored model.Question
	if err := db.First(&stored, "id = ?", question.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.QuestionType != "multiple_choice" {
		t.Fatalf("QuestionType = %q, want multiple_choice", stored.QuestionType)
	}
}

func TestTaggingMigrationPreservesPopulatedLegacyQuestionTable(t *testing.T) {
	db := testutil.OpenPostgres(t)
	if err := db.AutoMigrate(&model.Node{}, &legacyQuestion{}); err != nil {
		t.Fatal(err)
	}
	node := model.Node{ID: uuid.New(), Subject: "Algebra", Name: "Fractions"}
	legacy := legacyQuestion{
		ID: uuid.New(), NodeID: node.ID, Content: "Legacy question",
		OptionsJSON: `["A","B"]`, CorrectOption: 0, Difficulty: "easy",
	}
	if err := db.Create(&node).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatal(err)
	}

	if err := db.AutoMigrate(
		&model.User{},
		&model.Question{},
		&model.QuestionRubricItem{},
		&model.QuestionTopicMapping{},
		&model.QuestionRubricItemTopicMapping{},
		&model.QuestionTaggingState{},
	); err != nil {
		t.Fatal(err)
	}

	var stored model.Question
	if err := db.First(&stored, "id = ?", legacy.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.Content != legacy.Content ||
		stored.OptionsJSON != legacy.OptionsJSON ||
		stored.CorrectOption != legacy.CorrectOption {
		t.Fatalf("legacy row changed during migration: %#v", stored)
	}
	if stored.QuestionType != "multiple_choice" {
		t.Fatalf("QuestionType = %q, want multiple_choice", stored.QuestionType)
	}
}

func TestQuestionHardDeleteCascadesTaggingData(t *testing.T) {
	db := testutil.OpenPostgres(t)
	if err := db.AutoMigrate(
		&model.User{},
		&model.Node{},
		&model.Question{},
		&model.QuestionRubricItem{},
		&model.QuestionTopicMapping{},
		&model.QuestionRubricItemTopicMapping{},
		&model.QuestionTaggingState{},
	); err != nil {
		t.Fatal(err)
	}
	teacher := model.User{
		ID: uuid.New(), Email: uuid.NewString() + "@example.test",
		Password: "test-only", Name: "Teacher", Role: "teacher",
	}
	node := model.Node{ID: uuid.New(), Subject: "Algebra", Name: "Fractions"}
	question := model.Question{
		ID: uuid.New(), NodeID: node.ID, Content: "Explain fractions.",
		OptionsJSON: "[]", CorrectOption: -1, QuestionType: "essay",
	}
	rubric := model.QuestionRubricItem{
		ID: uuid.New(), QuestionID: question.ID, Content: "Reasoning",
		Points: model.MustScore("1.00"), Position: 0,
	}
	if err := db.Create(&teacher).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&node).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&question).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&rubric).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.QuestionTopicMapping{
		QuestionID: question.ID, NodeID: node.ID, CreatedBy: teacher.ID,
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.QuestionRubricItemTopicMapping{
		RubricItemID: rubric.ID, NodeID: node.ID, CreatedBy: teacher.ID,
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.QuestionTaggingState{
		QuestionID: question.ID, Version: 2, UpdatedBy: &teacher.ID,
	}).Error; err != nil {
		t.Fatal(err)
	}

	if err := db.Unscoped().Delete(&question).Error; err != nil {
		t.Fatal(err)
	}
	for name, target := range map[string]any{
		"rubric items":           &model.QuestionRubricItem{},
		"question mappings":      &model.QuestionTopicMapping{},
		"rubric mappings":        &model.QuestionRubricItemTopicMapping{},
		"question tagging state": &model.QuestionTaggingState{},
	} {
		var count int64
		if err := db.Model(target).Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Fatalf("%s count = %d, want 0", name, count)
		}
	}
}
