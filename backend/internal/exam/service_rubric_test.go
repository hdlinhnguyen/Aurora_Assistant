package exam_test

import (
	"testing"

	"backend/internal/exam"
	"backend/internal/model"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestRubricCRUDReorderAndVersions(t *testing.T) {
	fixture := newQuestionFixture(t)
	detail, err := fixture.service.AddManualQuestion(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ManualQuestionInput{
			QuestionType: exam.QuestionTypeEssay, Content: "Explain fractions.",
			Points: model.MustScore("10.00"), TopicNodeIDs: []uuid.UUID{fixture.algebra.ID},
			ExpectedVersion: 1,
		},
	)
	require.NoError(t, err)
	questionID := detail.Questions[0].ID

	detail, err = fixture.service.AddRubricItem(
		fixture.teacher.ID, fixture.exam.ID, questionID,
		exam.RubricItemInput{
			Description: "Set up the method", Points: model.MustScore("4.00"),
			TopicNodeIDs: []uuid.UUID{fixture.algebra.ID}, ExpectedVersion: 2,
		},
	)
	require.NoError(t, err)
	require.Equal(t, 3, detail.Version)
	require.Len(t, detail.Questions[0].RubricItems, 1)
	firstID := detail.Questions[0].RubricItems[0].ID

	detail, err = fixture.service.AddRubricItem(
		fixture.teacher.ID, fixture.exam.ID, questionID,
		exam.RubricItemInput{
			Description: "Complete the conclusion", Points: model.MustScore("6.00"),
			TopicNodeIDs: []uuid.UUID{fixture.algebra.ID}, ExpectedVersion: 3,
		},
	)
	require.NoError(t, err)
	secondID := detail.Questions[0].RubricItems[1].ID

	description := "State the method clearly"
	detail, err = fixture.service.PatchRubricItem(
		fixture.teacher.ID, fixture.exam.ID, questionID, firstID,
		exam.PatchRubricItemInput{
			Description: &description, ExpectedVersion: 4,
		},
	)
	require.NoError(t, err)
	require.Equal(t, 5, detail.Version)
	require.Equal(t, description, detail.Questions[0].RubricItems[0].Description)

	detail, err = fixture.service.ReorderRubricItems(
		fixture.teacher.ID, fixture.exam.ID, questionID,
		exam.ReorderRubricItemsInput{
			RubricItemIDs: []uuid.UUID{secondID, firstID}, ExpectedVersion: 5,
		},
	)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{secondID, firstID}, []uuid.UUID{
		detail.Questions[0].RubricItems[0].ID,
		detail.Questions[0].RubricItems[1].ID,
	})

	detail, err = fixture.service.DeleteRubricItem(
		fixture.teacher.ID, fixture.exam.ID, questionID, secondID, 6,
	)
	require.NoError(t, err)
	require.Equal(t, 7, detail.Version)
	require.Equal(t, 0, detail.Questions[0].RubricItems[0].Position)
}

func TestRubricRequiresEssayAndAllowedTopics(t *testing.T) {
	fixture := newQuestionFixture(t)
	correct := "b"
	detail, err := fixture.service.AddManualQuestion(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ManualQuestionInput{
			QuestionType: exam.QuestionTypeSingleChoice, Content: "Choose B.",
			Points: model.MustScore("10.00"), TopicNodeIDs: []uuid.UUID{fixture.algebra.ID},
			Choices: []exam.Choice{
				{ID: "a", Content: "A"}, {ID: "b", Content: "B"},
			},
			CorrectChoiceID: &correct, ExpectedVersion: 1,
		},
	)
	require.NoError(t, err)

	_, err = fixture.service.AddRubricItem(
		fixture.teacher.ID, fixture.exam.ID, detail.Questions[0].ID,
		exam.RubricItemInput{
			Description: "Not allowed", Points: model.MustScore("1.00"),
			TopicNodeIDs: []uuid.UUID{fixture.algebra.ID}, ExpectedVersion: 2,
		},
	)
	questionDomainCode(t, err, exam.ErrorCodeRubricNotAllowed)

	essay, err := fixture.service.AddManualQuestion(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ManualQuestionInput{
			QuestionType: exam.QuestionTypeEssay, Content: "Essay.",
			Points: model.MustScore("1.00"), TopicNodeIDs: []uuid.UUID{fixture.algebra.ID},
			ExpectedVersion: 2,
		},
	)
	require.NoError(t, err)
	_, err = fixture.service.AddRubricItem(
		fixture.teacher.ID, fixture.exam.ID, essay.Questions[1].ID,
		exam.RubricItemInput{
			Description: "Foreign topic", Points: model.MustScore("1.00"),
			TopicNodeIDs: []uuid.UUID{fixture.geometry.ID}, ExpectedVersion: 3,
		},
	)
	questionDomainCode(t, err, exam.ErrorCodeTopicNotAllowed)
}

func TestValidationPrepareAndReturnToDraft(t *testing.T) {
	fixture := newQuestionFixture(t)
	detail, err := fixture.service.AddManualQuestion(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ManualQuestionInput{
			QuestionType: exam.QuestionTypeEssay, Content: "Explain.",
			Points: model.MustScore("10.00"), TopicNodeIDs: []uuid.UUID{fixture.algebra.ID},
			ExpectedVersion: 1,
		},
	)
	require.NoError(t, err)

	result, err := fixture.service.Validate(fixture.teacher.ID, fixture.exam.ID)
	require.NoError(t, err)
	require.False(t, result.Valid)
	require.Contains(t, validationCodes(result.Errors), exam.ErrorCodeRubricIncomplete)

	_, err = fixture.service.Prepare(
		fixture.teacher.ID, fixture.exam.ID, exam.VersionInput{ExpectedVersion: 2},
	)
	domainErr := questionDomainCode(t, err, exam.ErrorCodeExamInvalid)
	require.Equal(t, 422, domainErr.Status)

	detail, err = fixture.service.AddRubricItem(
		fixture.teacher.ID, fixture.exam.ID, detail.Questions[0].ID,
		exam.RubricItemInput{
			Description: "Complete answer", Points: model.MustScore("10.00"),
			TopicNodeIDs: []uuid.UUID{fixture.algebra.ID}, ExpectedVersion: 2,
		},
	)
	require.NoError(t, err)

	prepared, err := fixture.service.Prepare(
		fixture.teacher.ID, fixture.exam.ID, exam.VersionInput{ExpectedVersion: 3},
	)
	require.NoError(t, err)
	require.Equal(t, exam.ExamStatusPreparing, prepared.Status)
	require.Equal(t, 4, prepared.Version)

	_, err = fixture.service.Prepare(
		fixture.teacher.ID, fixture.exam.ID, exam.VersionInput{ExpectedVersion: 4},
	)
	questionDomainCode(t, err, exam.ErrorCodeInvalidTransition)

	draft, err := fixture.service.ReturnToDraft(
		fixture.teacher.ID, fixture.exam.ID, exam.VersionInput{ExpectedVersion: 4},
	)
	require.NoError(t, err)
	require.Equal(t, exam.ExamStatusDrafting, draft.Status)
	require.Equal(t, 5, draft.Version)
}
