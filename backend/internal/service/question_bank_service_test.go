package service

import (
	"errors"
	"sort"
	"sync"
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

func TestQuestionBankUpdateRejectsMissingSourceTopic(t *testing.T) {
	db := testutil.OpenPostgres(t)
	if err := db.AutoMigrate(
		&model.Node{},
		&model.Question{},
		&model.QuestionRubricItem{},
	); err != nil {
		t.Fatal(err)
	}
	node := model.Node{ID: uuid.New(), Subject: "Toan", Name: "Phan so"}
	if err := db.Create(&node).Error; err != nil {
		t.Fatal(err)
	}

	service := NewQuestionBankService(db)
	question, err := service.CreateQuestion(QuestionBankQuestionInput{
		NodeID:        node.ID,
		Content:       "1 + 1 = ?",
		Options:       []string{"1", "2"},
		CorrectOption: 1,
		QuestionType:  "multiple_choice",
	})
	if err != nil {
		t.Fatal(err)
	}

	missingNodeID := uuid.New()
	_, err = service.UpdateQuestion(question.ID, QuestionBankQuestionUpdate{
		NodeID: &missingNodeID,
	})
	var domainError *DomainError
	if !errors.As(err, &domainError) {
		t.Fatalf("error = %v, want DomainError", err)
	}
	if domainError.Code != "topic_not_found" {
		t.Fatalf("error code = %q, want topic_not_found", domainError.Code)
	}

	var stored model.Question
	if err := db.First(&stored, "id = ?", question.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.NodeID != node.ID {
		t.Fatalf("stored NodeID = %s, want %s", stored.NodeID, node.ID)
	}
}

func TestQuestionBankUpdateRejectsSourceSubjectMismatchWithExistingTags(t *testing.T) {
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
	algebra := model.Node{ID: uuid.New(), Subject: "Algebra", Name: "Fractions"}
	geometry := model.Node{ID: uuid.New(), Subject: "Geometry", Name: "Triangles"}
	teacher := model.User{
		ID: uuid.New(), Email: uuid.NewString() + "@example.test",
		Password: "test-only", Name: "Teacher", Role: "teacher",
	}
	if err := db.Create(&teacher).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&[]model.Node{algebra, geometry}).Error; err != nil {
		t.Fatal(err)
	}

	questionService := NewQuestionBankService(db)
	question, err := questionService.CreateQuestion(QuestionBankQuestionInput{
		NodeID:        algebra.ID,
		Content:       "1 + 1 = ?",
		Options:       []string{"1", "2"},
		CorrectOption: 1,
		QuestionType:  "multiple_choice",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewTaggingService(db).SetQuestionTopics(
		question.ID,
		[]uuid.UUID{algebra.ID},
		1,
		teacher.ID,
	); err != nil {
		t.Fatal(err)
	}

	_, err = questionService.UpdateQuestion(question.ID, QuestionBankQuestionUpdate{
		NodeID: &geometry.ID,
	})
	var domainError *DomainError
	if !errors.As(err, &domainError) {
		t.Fatalf("error = %v, want DomainError", err)
	}
	if domainError.Code != "topic_subject_mismatch" {
		t.Fatalf("error code = %q, want topic_subject_mismatch", domainError.Code)
	}

	var stored model.Question
	if err := db.First(&stored, "id = ?", question.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.NodeID != algebra.ID {
		t.Fatalf("stored NodeID = %s, want %s", stored.NodeID, algebra.ID)
	}
}

func TestConcurrentRubricCreatesReceiveDistinctPositions(t *testing.T) {
	db := testutil.OpenPostgres(t)
	if err := db.AutoMigrate(
		&model.Node{},
		&model.Question{},
		&model.QuestionRubricItem{},
	); err != nil {
		t.Fatal(err)
	}
	node := model.Node{ID: uuid.New(), Subject: "Algebra", Name: "Fractions"}
	if err := db.Create(&node).Error; err != nil {
		t.Fatal(err)
	}
	service := NewQuestionBankService(db)
	question, err := service.CreateQuestion(QuestionBankQuestionInput{
		NodeID:       node.ID,
		Content:      "Explain fractions.",
		QuestionType: "essay",
	})
	if err != nil {
		t.Fatal(err)
	}

	start := make(chan struct{})
	type result struct {
		item *model.QuestionRubricItem
		err  error
	}
	results := make(chan result, 2)
	var ready sync.WaitGroup
	ready.Add(2)
	for _, content := range []string{"Definition", "Example"} {
		go func(content string) {
			ready.Done()
			<-start
			item, createErr := service.CreateRubricItem(question.ID, RubricItemInput{
				Content: content,
				Points:  model.MustScore("1.00"),
			})
			results <- result{item: item, err: createErr}
		}(content)
	}
	ready.Wait()
	close(start)

	positions := make([]int, 0, 2)
	for range 2 {
		outcome := <-results
		if outcome.err != nil {
			t.Fatalf("concurrent rubric create failed: %v", outcome.err)
		}
		positions = append(positions, outcome.item.Position)
	}
	sort.Ints(positions)
	if positions[0] != 0 || positions[1] != 1 {
		t.Fatalf("positions = %v, want [0 1]", positions)
	}
}
