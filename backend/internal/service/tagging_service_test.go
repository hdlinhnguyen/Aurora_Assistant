package service

import (
	"errors"
	"sync"
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

func TestTutorNodeMutationRejectsSubjectChangeWhenReferenced(t *testing.T) {
	fixture := newTaggingFixture(t, "essay")
	if err := fixture.db.AutoMigrate(&model.Edge{}); err != nil {
		t.Fatal(err)
	}
	rubric := model.QuestionRubricItem{
		ID: uuid.New(), QuestionID: fixture.question.ID, Content: "Giải thích", Points: model.MustScore("2.00"), Position: 1,
	}
	if err := fixture.db.Create(&rubric).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.service.SetQuestionTopics(
		fixture.question.ID, []uuid.UUID{fixture.secondNode.ID}, 1, fixture.teacher.ID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.service.SetRubricItemTopics(
		fixture.question.ID, rubric.ID, []uuid.UUID{fixture.secondNode.ID}, 2, fixture.teacher.ID,
	); err != nil {
		t.Fatal(err)
	}

	svc := &tutorService{db: fixture.db}
	err := svc.UpdateNode(fixture.secondNode.ID, map[string]interface{}{"subject": "Ly"})
	var domainErr *DomainError
	if !errors.As(err, &domainErr) || domainErr.Code != "node_in_use" {
		t.Fatalf("error = %v, want node_in_use", err)
	}
	var node model.Node
	if err := fixture.db.First(&node, "id = ?", fixture.secondNode.ID).Error; err != nil {
		t.Fatal(err)
	}
	if node.Subject != fixture.secondNode.Subject {
		t.Fatalf("subject changed to %q after rejected update", node.Subject)
	}
}

func TestTutorNodeMutationRejectsDeleteWhenReferenced(t *testing.T) {
	fixture := newTaggingFixture(t, "multiple_choice")
	if err := fixture.db.AutoMigrate(&model.Edge{}); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.service.SetQuestionTopics(
		fixture.question.ID, []uuid.UUID{fixture.secondNode.ID}, 1, fixture.teacher.ID,
	); err != nil {
		t.Fatal(err)
	}

	svc := &tutorService{db: fixture.db}
	err := svc.DeleteNode(fixture.secondNode.ID)
	var domainErr *DomainError
	if !errors.As(err, &domainErr) || domainErr.Code != "node_in_use" {
		t.Fatalf("error = %v, want node_in_use", err)
	}
	var node model.Node
	if err := fixture.db.First(&node, "id = ?", fixture.secondNode.ID).Error; err != nil {
		t.Fatalf("referenced node was deleted: %v", err)
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
		[]uuid.UUID{fixture.sourceNode.ID, fixture.secondNode.ID},
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

func TestTaggingRejectsDuplicateTopicIDs(t *testing.T) {
	fixture := newTaggingFixture(t, "multiple_choice")

	_, err := fixture.service.SetQuestionTopics(
		fixture.question.ID,
		[]uuid.UUID{fixture.sourceNode.ID, fixture.sourceNode.ID},
		1,
		fixture.teacher.ID,
	)
	var domainError *DomainError
	if !errors.As(err, &domainError) {
		t.Fatalf("error = %v, want DomainError", err)
	}
	if domainError.Code != "request_validation_error" {
		t.Fatalf("error code = %q, want request_validation_error", domainError.Code)
	}

	context, err := fixture.service.GetContext(fixture.question.ID)
	if err != nil {
		t.Fatal(err)
	}
	if context.Version != 1 {
		t.Fatalf("Version = %d, want 1", context.Version)
	}
}

func TestFirstWriteConflictReturnsVirtualLatestContext(t *testing.T) {
	fixture := newTaggingFixture(t, "multiple_choice")

	_, err := fixture.service.SetQuestionTopics(
		fixture.question.ID,
		[]uuid.UUID{fixture.secondNode.ID},
		2,
		fixture.teacher.ID,
	)
	var conflict *VersionConflict
	if !errors.As(err, &conflict) {
		t.Fatalf("error = %v, want VersionConflict", err)
	}
	if conflict.LatestContext == nil {
		t.Fatal("LatestContext is nil")
	}
	if conflict.LatestContext.Version != 1 {
		t.Fatalf("latest version = %d, want 1", conflict.LatestContext.Version)
	}
	if len(conflict.LatestContext.DirectTopicIDs) != 1 ||
		conflict.LatestContext.DirectTopicIDs[0] != fixture.sourceNode.ID {
		t.Fatalf(
			"latest direct topics = %v, want [%s]",
			conflict.LatestContext.DirectTopicIDs,
			fixture.sourceNode.ID,
		)
	}

	var stateCount int64
	if err := fixture.db.Model(&model.QuestionTaggingState{}).
		Where("question_id = ?", fixture.question.ID).
		Count(&stateCount).Error; err != nil {
		t.Fatal(err)
	}
	if stateCount != 0 {
		t.Fatalf("state rows = %d, want 0 after conflict rollback", stateCount)
	}
}

func TestQuestionSnapshotIncludesQuestionRubricsAndIndependentTopicSets(t *testing.T) {
	fixture := newTaggingFixture(t, "essay")
	rubric := model.QuestionRubricItem{
		ID:         uuid.New(),
		QuestionID: fixture.question.ID,
		Content:    "Explain the reasoning.",
		Points:     model.MustScore("2.50"),
		Position:   0,
	}
	if err := fixture.db.Create(&rubric).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.service.SetQuestionTopics(
		fixture.question.ID,
		[]uuid.UUID{fixture.sourceNode.ID},
		1,
		fixture.teacher.ID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.service.SetRubricItemTopics(
		fixture.question.ID,
		rubric.ID,
		[]uuid.UUID{fixture.secondNode.ID},
		2,
		fixture.teacher.ID,
	); err != nil {
		t.Fatal(err)
	}

	snapshot, err := fixture.service.GetQuestionSnapshot(fixture.question.ID)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Question.ID != fixture.question.ID ||
		snapshot.Question.Content != fixture.question.Content ||
		snapshot.Question.QuestionType != "essay" {
		t.Fatalf("question snapshot = %#v", snapshot.Question)
	}
	if snapshot.Subject != fixture.sourceNode.Subject {
		t.Fatalf("Subject = %q, want %q", snapshot.Subject, fixture.sourceNode.Subject)
	}
	if snapshot.TaggingVersion != 3 {
		t.Fatalf("TaggingVersion = %d, want 3", snapshot.TaggingVersion)
	}
	if len(snapshot.DirectTopicIDs) != 1 ||
		snapshot.DirectTopicIDs[0] != fixture.sourceNode.ID {
		t.Fatalf("DirectTopicIDs = %v", snapshot.DirectTopicIDs)
	}
	effective := make(map[uuid.UUID]struct{}, len(snapshot.EffectiveTopicIDs))
	for _, topicID := range snapshot.EffectiveTopicIDs {
		effective[topicID] = struct{}{}
	}
	if _, ok := effective[fixture.sourceNode.ID]; !ok {
		t.Fatalf("EffectiveTopicIDs = %v, missing source topic", snapshot.EffectiveTopicIDs)
	}
	if _, ok := effective[fixture.secondNode.ID]; !ok {
		t.Fatalf("EffectiveTopicIDs = %v, missing rubric topic", snapshot.EffectiveTopicIDs)
	}
	if len(snapshot.RubricItems) != 1 {
		t.Fatalf("RubricItems = %#v, want one item", snapshot.RubricItems)
	}
	if snapshot.RubricItems[0].ID != rubric.ID ||
		snapshot.RubricItems[0].Points.String() != "2.50" ||
		len(snapshot.RubricItems[0].TopicIDs) != 1 ||
		snapshot.RubricItems[0].TopicIDs[0] != fixture.secondNode.ID {
		t.Fatalf("rubric snapshot = %#v", snapshot.RubricItems[0])
	}
}

func TestTaggingRejectsUnknownTopicWithoutAdvancingVersion(t *testing.T) {
	fixture := newTaggingFixture(t, "multiple_choice")

	_, err := fixture.service.SetQuestionTopics(
		fixture.question.ID,
		[]uuid.UUID{uuid.New()},
		1,
		fixture.teacher.ID,
	)
	var domainError *DomainError
	if !errors.As(err, &domainError) {
		t.Fatalf("error = %v, want DomainError", err)
	}
	if domainError.Code != "topic_not_found" {
		t.Fatalf("error code = %q, want topic_not_found", domainError.Code)
	}
	context, err := fixture.service.GetContext(fixture.question.ID)
	if err != nil {
		t.Fatal(err)
	}
	if context.Version != 1 {
		t.Fatalf("Version = %d, want 1", context.Version)
	}
}

func TestRubricItemMustBelongToEditedQuestion(t *testing.T) {
	fixture := newTaggingFixture(t, "essay")
	otherQuestion := model.Question{
		ID: uuid.New(), NodeID: fixture.sourceNode.ID,
		Content: "Other essay", OptionsJSON: "[]", CorrectOption: -1,
		QuestionType: "essay",
	}
	if err := fixture.db.Create(&otherQuestion).Error; err != nil {
		t.Fatal(err)
	}
	rubric := model.QuestionRubricItem{
		ID: uuid.New(), QuestionID: otherQuestion.ID,
		Content: "Other rubric", Points: model.MustScore("1.00"), Position: 0,
	}
	if err := fixture.db.Create(&rubric).Error; err != nil {
		t.Fatal(err)
	}

	_, err := fixture.service.SetRubricItemTopics(
		fixture.question.ID,
		rubric.ID,
		[]uuid.UUID{fixture.sourceNode.ID},
		1,
		fixture.teacher.ID,
	)
	var domainError *DomainError
	if !errors.As(err, &domainError) {
		t.Fatalf("error = %v, want DomainError", err)
	}
	if domainError.Code != "rubric_item_mismatch" {
		t.Fatalf("error code = %q, want rubric_item_mismatch", domainError.Code)
	}
}

func TestRemovingRubricTopicPreservesSameDirectTopic(t *testing.T) {
	fixture := newTaggingFixture(t, "essay")
	rubric := model.QuestionRubricItem{
		ID: uuid.New(), QuestionID: fixture.question.ID,
		Content: "Reasoning", Points: model.MustScore("1.00"), Position: 0,
	}
	if err := fixture.db.Create(&rubric).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.service.SetQuestionTopics(
		fixture.question.ID,
		[]uuid.UUID{fixture.sourceNode.ID},
		1,
		fixture.teacher.ID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := fixture.service.SetRubricItemTopics(
		fixture.question.ID,
		rubric.ID,
		[]uuid.UUID{fixture.sourceNode.ID},
		2,
		fixture.teacher.ID,
	); err != nil {
		t.Fatal(err)
	}
	context, err := fixture.service.SetRubricItemTopics(
		fixture.question.ID,
		rubric.ID,
		[]uuid.UUID{},
		3,
		fixture.teacher.ID,
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(context.EffectiveTopics) != 1 ||
		context.EffectiveTopics[0].ID != fixture.sourceNode.ID {
		t.Fatalf("EffectiveTopics = %#v, want direct source topic", context.EffectiveTopics)
	}
}

func TestTwoConcurrentTaggingWritersCannotBothCommit(t *testing.T) {
	fixture := newTaggingFixture(t, "multiple_choice")
	start := make(chan struct{})
	type outcome struct {
		context *TaggingContext
		err     error
	}
	results := make(chan outcome, 2)
	var ready sync.WaitGroup
	ready.Add(2)
	for _, topicID := range []uuid.UUID{fixture.sourceNode.ID, fixture.secondNode.ID} {
		go func(topicID uuid.UUID) {
			ready.Done()
			<-start
			context, err := fixture.service.SetQuestionTopics(
				fixture.question.ID,
				[]uuid.UUID{topicID},
				1,
				fixture.teacher.ID,
			)
			results <- outcome{context: context, err: err}
		}(topicID)
	}
	ready.Wait()
	close(start)

	committed := 0
	conflicted := 0
	for range 2 {
		result := <-results
		if result.err == nil {
			committed++
			continue
		}
		var conflict *VersionConflict
		if errors.As(result.err, &conflict) {
			conflicted++
			continue
		}
		t.Fatalf("unexpected writer error: %v", result.err)
	}
	if committed != 1 || conflicted != 1 {
		t.Fatalf("committed = %d, conflicted = %d, want 1 and 1", committed, conflicted)
	}
	context, err := fixture.service.GetContext(fixture.question.ID)
	if err != nil {
		t.Fatal(err)
	}
	if context.Version != 2 || len(context.DirectTopicIDs) != 1 {
		t.Fatalf("final context = %#v, want version 2 with one topic", context)
	}
}
