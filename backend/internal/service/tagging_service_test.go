package service

import (
	"errors"
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type taggingFixture struct {
	db         *gorm.DB
	service    *TaggingService
	teacher    model.User
	sourceNode model.Node
	secondNode model.Node
	question   model.Question
}

func newTaggingFixture(t *testing.T, questionType string) taggingFixture {
	t.Helper()

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
		ID:       uuid.New(),
		Email:    uuid.NewString() + "@aurora.test",
		Password: "test",
		Name:     "Teacher",
		Role:     "teacher",
	}
	if err := db.Create(&teacher).Error; err != nil {
		t.Fatal(err)
	}

	sourceNode := model.Node{ID: uuid.New(), Subject: "Toán", Name: "Phân số"}
	secondNode := model.Node{ID: uuid.New(), Subject: "Toán", Name: "Số thập phân"}
	if err := db.Create(&[]model.Node{sourceNode, secondNode}).Error; err != nil {
		t.Fatal(err)
	}

	question := model.Question{
		ID:            uuid.New(),
		NodeID:        sourceNode.ID,
		Content:       "Câu hỏi",
		OptionsJSON:   `["A","B"]`,
		CorrectOption: 0,
		QuestionType:  questionType,
	}
	if err := db.Create(&question).Error; err != nil {
		t.Fatal(err)
	}

	return taggingFixture{
		db:         db,
		service:    NewTaggingService(db),
		teacher:    teacher,
		sourceNode: sourceNode,
		secondNode: secondNode,
		question:   question,
	}
}

func TestTaggingContextUsesLegacyNodeAsVirtualTag(t *testing.T) {
	fixture := newTaggingFixture(t, "multiple_choice")

	context, err := fixture.service.GetContext(fixture.question.ID)
	if err != nil {
		t.Fatal(err)
	}
	if context.Version != 1 {
		t.Fatalf("Version = %d, want 1", context.Version)
	}
	if len(context.DirectTopicIDs) != 1 || context.DirectTopicIDs[0] != fixture.sourceNode.ID {
		t.Fatalf("DirectTopicIDs = %v, want [%s]", context.DirectTopicIDs, fixture.sourceNode.ID)
	}

	var stateCount int64
	if err := fixture.db.Model(&model.QuestionTaggingState{}).Count(&stateCount).Error; err != nil {
		t.Fatal(err)
	}
	if stateCount != 0 {
		t.Fatalf("GET created %d tagging state rows, want 0", stateCount)
	}
}

func TestSetQuestionTopicsCreatesStateWithoutChangingLegacyNode(t *testing.T) {
	fixture := newTaggingFixture(t, "multiple_choice")

	context, err := fixture.service.SetQuestionTopics(
		fixture.question.ID,
		[]uuid.UUID{fixture.secondNode.ID},
		1,
		fixture.teacher.ID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if context.Version != 2 {
		t.Fatalf("Version = %d, want 2", context.Version)
	}
	if len(context.DirectTopicIDs) != 1 || context.DirectTopicIDs[0] != fixture.secondNode.ID {
		t.Fatalf("DirectTopicIDs = %v, want [%s]", context.DirectTopicIDs, fixture.secondNode.ID)
	}

	var stored model.Question
	if err := fixture.db.First(&stored, "id = ?", fixture.question.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.NodeID != fixture.sourceNode.ID {
		t.Fatalf("legacy NodeID changed to %s, want %s", stored.NodeID, fixture.sourceNode.ID)
	}
}

func TestEssayEffectiveTopicsAreUnionOfDirectAndRubricTopics(t *testing.T) {
	fixture := newTaggingFixture(t, "essay")
	rubric := model.QuestionRubricItem{
		ID:         uuid.New(),
		QuestionID: fixture.question.ID,
		Content:    "Lập luận đúng",
		Points:     model.MustScore("1"),
		Position:   0,
	}
	if err := fixture.db.Create(&rubric).Error; err != nil {
		t.Fatal(err)
	}

	context, err := fixture.service.SetRubricItemTopics(
		fixture.question.ID,
		rubric.ID,
		[]uuid.UUID{fixture.sourceNode.ID, fixture.secondNode.ID, fixture.secondNode.ID},
		1,
		fixture.teacher.ID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if context.Version != 2 {
		t.Fatalf("Version = %d, want 2", context.Version)
	}
	if len(context.EffectiveTopics) != 2 {
		t.Fatalf("EffectiveTopics = %v, want two unique topics", context.EffectiveTopics)
	}
}

func TestTaggingRejectsTopicFromAnotherSubjectWithoutAdvancingVersion(t *testing.T) {
	fixture := newTaggingFixture(t, "multiple_choice")
	otherSubject := model.Node{ID: uuid.New(), Subject: "Vật lý", Name: "Chuyển động"}
	if err := fixture.db.Create(&otherSubject).Error; err != nil {
		t.Fatal(err)
	}

	_, err := fixture.service.SetQuestionTopics(
		fixture.question.ID,
		[]uuid.UUID{otherSubject.ID},
		1,
		fixture.teacher.ID,
	)
	var domainError *DomainError
	if !errors.As(err, &domainError) {
		t.Fatalf("error = %v, want DomainError", err)
	}
	if domainError.Code != "topic_subject_mismatch" {
		t.Fatalf("error code = %q, want topic_subject_mismatch", domainError.Code)
	}

	context, err := fixture.service.GetContext(fixture.question.ID)
	if err != nil {
		t.Fatal(err)
	}
	if context.Version != 1 {
		t.Fatalf("Version = %d, want 1", context.Version)
	}
}

func TestStaleTaggingVersionReturnsLatestContext(t *testing.T) {
	fixture := newTaggingFixture(t, "multiple_choice")
	if _, err := fixture.service.SetQuestionTopics(
		fixture.question.ID,
		[]uuid.UUID{fixture.secondNode.ID},
		1,
		fixture.teacher.ID,
	); err != nil {
		t.Fatal(err)
	}

	_, err := fixture.service.SetQuestionTopics(
		fixture.question.ID,
		[]uuid.UUID{fixture.sourceNode.ID},
		1,
		fixture.teacher.ID,
	)
	var conflict *VersionConflict
	if !errors.As(err, &conflict) {
		t.Fatalf("error = %v, want VersionConflict", err)
	}
	if conflict.LatestContext == nil || conflict.LatestContext.Version != 2 {
		t.Fatalf("latest context = %#v, want version 2", conflict.LatestContext)
	}
}

func TestQuestionTopicsCanBeCleared(t *testing.T) {
	fixture := newTaggingFixture(t, "multiple_choice")
	if _, err := fixture.service.SetQuestionTopics(
		fixture.question.ID,
		[]uuid.UUID{fixture.secondNode.ID},
		1,
		fixture.teacher.ID,
	); err != nil {
		t.Fatal(err)
	}

	context, err := fixture.service.SetQuestionTopics(
		fixture.question.ID,
		[]uuid.UUID{},
		2,
		fixture.teacher.ID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(context.DirectTopicIDs) != 0 || len(context.EffectiveTopics) != 0 {
		t.Fatalf("cleared context still has topics: %#v", context)
	}
	if context.Version != 3 {
		t.Fatalf("Version = %d, want 3", context.Version)
	}
}
