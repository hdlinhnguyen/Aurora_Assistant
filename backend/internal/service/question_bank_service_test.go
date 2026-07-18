package service

import (
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
)

func TestQuestionBankCreatesEssayWithLegacyCompatibleAnswerFields(t *testing.T) {
	db := testutil.OpenPostgres(t)
	if err := db.AutoMigrate(
		&model.Node{},
		&model.Question{},
		&model.QuestionRubricItem{},
	); err != nil {
		t.Fatal(err)
	}
	node := model.Node{ID: uuid.New(), Subject: "Toán", Name: "Phân số"}
	if err := db.Create(&node).Error; err != nil {
		t.Fatal(err)
	}

	question, err := NewQuestionBankService(db).CreateQuestion(QuestionBankQuestionInput{
		NodeID:       node.ID,
		Content:      "Giải thích cách quy đồng mẫu số.",
		Difficulty:   "medium",
		QuestionType: "essay",
		GradeLevel:   "Lớp 5",
	})
	if err != nil {
		t.Fatal(err)
	}
	if question.OptionsJSON != "[]" {
		t.Fatalf("OptionsJSON = %q, want []", question.OptionsJSON)
	}
	if question.CorrectOption != -1 {
		t.Fatalf("CorrectOption = %d, want -1", question.CorrectOption)
	}
}
