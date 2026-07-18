package model_test

import (
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
)

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
