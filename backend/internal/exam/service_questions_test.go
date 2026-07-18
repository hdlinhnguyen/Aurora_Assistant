package exam_test

import (
	"errors"
	"testing"

	"backend/internal/exam"
	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type questionFixture struct {
	db       *gorm.DB
	service  *exam.Service
	teacher  model.User
	exam     *exam.Detail
	algebra  model.Node
	geometry model.Node
}

func newQuestionFixture(t *testing.T) questionFixture {
	t.Helper()

	db := testutil.OpenPostgres(t).Session(&gorm.Session{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.Node{},
		&model.Question{},
		&model.Exam{},
		&model.ExamQuestion{},
		&model.ExamRubricItem{},
		&model.ExamAuditLog{},
	))

	teacher := model.User{
		ID: uuid.New(), Email: uuid.NewString() + "@example.test",
		Password: "test-only", Name: "Question Author", Role: "teacher",
	}
	algebra := model.Node{ID: uuid.New(), Subject: "Algebra", Name: "Fractions"}
	geometry := model.Node{ID: uuid.New(), Subject: "Geometry", Name: "Triangles"}
	require.NoError(t, db.Create(&teacher).Error)
	require.NoError(t, db.Create(&algebra).Error)
	require.NoError(t, db.Create(&geometry).Error)

	service := exam.NewService(exam.NewRepository(db))
	created, err := service.Create(teacher.ID, exam.CreateInput{
		Title: "Fractions exam", Subject: "Algebra", GradeLevel: "5",
		DurationMinutes: 45, TotalPoints: model.MustScore("10.00"),
	})
	require.NoError(t, err)

	return questionFixture{
		db: db, service: service, teacher: teacher, exam: created,
		algebra: algebra, geometry: geometry,
	}
}

func questionDomainCode(t *testing.T, err error, code string) *exam.DomainError {
	t.Helper()
	require.Error(t, err)
	var domainErr *exam.DomainError
	require.True(t, errors.As(err, &domainErr), "expected DomainError, got %T: %v", err, err)
	require.Equal(t, code, domainErr.Code)
	return domainErr
}

func TestBankQuestionSnapshotSurvivesSourceChanges(t *testing.T) {
	fixture := newQuestionFixture(t)
	source := model.Question{
		ID: uuid.New(), NodeID: fixture.algebra.ID,
		Content:       "Which fraction equals one half?",
		OptionsJSON:   `["1/2","2/3","3/4","4/5"]`,
		CorrectOption: 0, Difficulty: "medium",
	}
	require.NoError(t, fixture.db.Create(&source).Error)

	bank, err := fixture.service.ListBankQuestions(exam.BankFilter{
		Subject: "Algebra", NodeID: &fixture.algebra.ID,
		Difficulty: "medium", Search: "fraction",
	})
	require.NoError(t, err)
	require.Len(t, bank, 1)
	require.Equal(t, "Fractions", bank[0].NodeName)
	require.Len(t, bank[0].Choices, 4)

	selected, err := fixture.service.GetBankQuestion(source.ID)
	require.NoError(t, err)
	require.Equal(t, "choice-0", *selected.CorrectChoiceID)

	detail, err := fixture.service.AddBankQuestion(
		fixture.teacher.ID, fixture.exam.ID,
		exam.AddBankQuestionInput{
			QuestionID: source.ID, Points: model.MustScore("2.00"), ExpectedVersion: 1,
		},
	)
	require.NoError(t, err)
	require.Equal(t, 2, detail.Version)
	require.Len(t, detail.Questions, 1)
	require.Equal(t, []uuid.UUID{fixture.algebra.ID}, detail.Questions[0].TopicNodeIDs)
	require.Equal(t, "choice-0", *detail.Questions[0].CorrectChoiceID)
	require.Equal(t, "2.00", detail.Questions[0].Points.String())

	require.NoError(t, fixture.db.Model(&model.Question{}).
		Where("id = ?", source.ID).
		Updates(map[string]any{
			"content":        "Changed source",
			"options_json":   `["changed","source"]`,
			"correct_option": 1,
		}).Error)
	require.NoError(t, fixture.db.Delete(&source).Error)

	reloaded, err := fixture.service.Get(fixture.teacher.ID, fixture.exam.ID)
	require.NoError(t, err)
	require.Equal(t, "Which fraction equals one half?", reloaded.Questions[0].Content)
	require.Equal(t, []exam.Choice{
		{ID: "choice-0", Content: "1/2"},
		{ID: "choice-1", Content: "2/3"},
		{ID: "choice-2", Content: "3/4"},
		{ID: "choice-3", Content: "4/5"},
	}, reloaded.Questions[0].Choices)
	require.Equal(t, "choice-0", *reloaded.Questions[0].CorrectChoiceID)
	require.Equal(t, []uuid.UUID{fixture.algebra.ID}, reloaded.Questions[0].TopicNodeIDs)
}

func TestListTopicsOnlyIncludesRequestedSubjectAndLiveNodes(t *testing.T) {
	fixture := newQuestionFixture(t)
	second := model.Node{ID: uuid.New(), Subject: "Algebra", Name: "Decimals"}
	deleted := model.Node{ID: uuid.New(), Subject: "Algebra", Name: "Deleted"}
	require.NoError(t, fixture.db.Create(&second).Error)
	require.NoError(t, fixture.db.Create(&deleted).Error)
	require.NoError(t, fixture.db.Delete(&deleted).Error)

	topics, err := fixture.service.ListTopics("Algebra")
	require.NoError(t, err)
	require.Equal(t, []string{"Decimals", "Fractions"}, []string{topics[0].Name, topics[1].Name})
}

func TestManualQuestionAuthoringValidationAndVersions(t *testing.T) {
	fixture := newQuestionFixture(t)
	correct := "b"

	detail, err := fixture.service.AddManualQuestion(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ManualQuestionInput{
			QuestionType: "single_choice", Content: "Choose two.",
			Points:          model.MustScore("2.00"),
			TopicNodeIDs:    []uuid.UUID{fixture.algebra.ID},
			Choices:         []exam.Choice{{ID: "a", Content: "One"}, {ID: "b", Content: "Two"}},
			CorrectChoiceID: &correct, ExpectedVersion: 1,
		},
	)
	require.NoError(t, err)
	require.Equal(t, 2, detail.Version)
	require.Equal(t, "manual", detail.Questions[0].SourceType)
	require.Equal(t, "b", *detail.Questions[0].CorrectChoiceID)

	detail, err = fixture.service.AddManualQuestion(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ManualQuestionInput{
			QuestionType: "essay", Content: "Explain fractions.",
			Points:          model.MustScore("3.00"),
			TopicNodeIDs:    []uuid.UUID{fixture.algebra.ID},
			ExpectedVersion: 2,
		},
	)
	require.NoError(t, err)
	require.Equal(t, 3, detail.Version)
	require.Empty(t, detail.Questions[1].Choices)
	require.Nil(t, detail.Questions[1].CorrectChoiceID)

	_, err = fixture.service.AddManualQuestion(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ManualQuestionInput{
			QuestionType: "essay", Content: "Stale.",
			Points:          model.MustScore("1.00"),
			TopicNodeIDs:    []uuid.UUID{fixture.algebra.ID},
			ExpectedVersion: 2,
		},
	)
	questionDomainCode(t, err, exam.ErrorCodeVersionConflict)

	_, err = fixture.service.AddManualQuestion(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ManualQuestionInput{
			QuestionType: "essay", Content: "Wrong subject.",
			Points:          model.MustScore("1.00"),
			TopicNodeIDs:    []uuid.UUID{fixture.geometry.ID},
			ExpectedVersion: 3,
		},
	)
	questionDomainCode(t, err, exam.ErrorCodeTopicNotAllowed)

	_, err = fixture.service.AddManualQuestion(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ManualQuestionInput{
			QuestionType: "single_choice", Content: "Duplicate IDs.",
			Points:          model.MustScore("1.00"),
			TopicNodeIDs:    []uuid.UUID{fixture.algebra.ID},
			Choices:         []exam.Choice{{ID: "same", Content: "A"}, {ID: "same", Content: "B"}},
			CorrectChoiceID: &correct, ExpectedVersion: 3,
		},
	)
	questionDomainCode(t, err, exam.ErrorCodeInvalidChoiceSet)
}

func TestBankTopicsAreImmutableWhenPatching(t *testing.T) {
	fixture := newQuestionFixture(t)
	source := model.Question{
		ID: uuid.New(), NodeID: fixture.algebra.ID, Content: "Bank question",
		OptionsJSON: `["A","B"]`, CorrectOption: 0, Difficulty: "easy",
	}
	require.NoError(t, fixture.db.Create(&source).Error)
	detail, err := fixture.service.AddBankQuestion(
		fixture.teacher.ID, fixture.exam.ID,
		exam.AddBankQuestionInput{
			QuestionID: source.ID, Points: model.MustScore("1.00"), ExpectedVersion: 1,
		},
	)
	require.NoError(t, err)

	_, err = fixture.service.PatchQuestion(
		fixture.teacher.ID, fixture.exam.ID, detail.Questions[0].ID,
		exam.ManualQuestionInput{
			QuestionType: "single_choice", Content: "Edited",
			Points:          model.MustScore("1.00"),
			TopicNodeIDs:    []uuid.UUID{fixture.algebra.ID},
			Choices:         detail.Questions[0].Choices,
			CorrectChoiceID: detail.Questions[0].CorrectChoiceID,
			ExpectedVersion: 2,
		},
	)
	questionDomainCode(t, err, exam.ErrorCodeBankTopicImmutable)
}

func TestQuestionReorderRequiresExactSetAndDeleteCompacts(t *testing.T) {
	fixture := newQuestionFixture(t)
	addEssay := func(content string, version int) *exam.Detail {
		t.Helper()
		detail, err := fixture.service.AddManualQuestion(
			fixture.teacher.ID, fixture.exam.ID,
			exam.ManualQuestionInput{
				QuestionType: "essay", Content: content, Points: model.MustScore("1.00"),
				TopicNodeIDs: []uuid.UUID{fixture.algebra.ID}, ExpectedVersion: version,
			},
		)
		require.NoError(t, err)
		return detail
	}
	addEssay("First", 1)
	addEssay("Second", 2)
	detail := addEssay("Third", 3)
	first, second, third := detail.Questions[0].ID, detail.Questions[1].ID, detail.Questions[2].ID

	_, err := fixture.service.ReorderQuestions(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ReorderQuestionsInput{
			ExamQuestionIDs: []uuid.UUID{third, first}, ExpectedVersion: 4,
		},
	)
	questionDomainCode(t, err, exam.ErrorCodeInvalidQuestionOrder)

	detail, err = fixture.service.ReorderQuestions(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ReorderQuestionsInput{
			ExamQuestionIDs: []uuid.UUID{third, first, second}, ExpectedVersion: 4,
		},
	)
	require.NoError(t, err)
	require.Equal(t, 5, detail.Version)
	require.Equal(t, []uuid.UUID{third, first, second}, []uuid.UUID{
		detail.Questions[0].ID, detail.Questions[1].ID, detail.Questions[2].ID,
	})

	detail, err = fixture.service.DeleteQuestion(
		fixture.teacher.ID, fixture.exam.ID, first, 5,
	)
	require.NoError(t, err)
	require.Equal(t, 6, detail.Version)
	require.Equal(t, []int{0, 1}, []int{
		detail.Questions[0].Position, detail.Questions[1].Position,
	})

	_, err = fixture.service.DeleteQuestion(
		fixture.teacher.ID, fixture.exam.ID, second, 5,
	)
	questionDomainCode(t, err, exam.ErrorCodeVersionConflict)
}
