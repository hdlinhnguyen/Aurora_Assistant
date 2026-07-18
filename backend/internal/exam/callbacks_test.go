package exam_test

import (
	"testing"

	"backend/internal/exam"
	"backend/internal/model"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func preparedExamFixture(t *testing.T) (questionFixture, *exam.Detail) {
	t.Helper()
	fixture := newQuestionFixture(t)
	require.NoError(t, fixture.db.AutoMigrate(
		&model.ExamSnapshot{},
		&model.ExamGradingProgress{},
		&model.ExamInternalEvent{},
	))
	detail, err := fixture.service.AddManualQuestion(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ManualQuestionInput{
			QuestionType: exam.QuestionTypeEssay, Content: "Explain fractions.",
			Points: model.MustScore("10.00"), TopicNodeIDs: []uuid.UUID{fixture.algebra.ID},
			ExpectedVersion: 1,
		},
	)
	require.NoError(t, err)
	detail, err = fixture.service.AddRubricItem(
		fixture.teacher.ID, fixture.exam.ID, detail.Questions[0].ID,
		exam.RubricItemInput{
			Description: "Complete explanation", Points: model.MustScore("10.00"),
			TopicNodeIDs: []uuid.UUID{fixture.algebra.ID}, ExpectedVersion: 2,
		},
	)
	require.NoError(t, err)
	detail, err = fixture.service.Prepare(
		fixture.teacher.ID, fixture.exam.ID, exam.VersionInput{ExpectedVersion: 3},
	)
	require.NoError(t, err)
	return fixture, detail
}

func TestFirstSubmissionCreatesOneImmutableSnapshotAndLocksExam(t *testing.T) {
	fixture, prepared := preparedExamFixture(t)

	result, err := fixture.service.FirstSubmission(
		prepared.ID, "submission-1",
		exam.FirstSubmissionInput{TotalSubmissions: 30},
	)
	require.NoError(t, err)
	require.True(t, result.Locked)
	require.Equal(t, 30, result.TotalSubmissions)
	require.Equal(t, exam.ExamStatusPreparing, result.Status)
	require.NotEqual(t, uuid.Nil, result.SnapshotID)

	var snapshots []model.ExamSnapshot
	require.NoError(t, fixture.db.Where(
		"exam_id = ? AND purpose = ?", prepared.ID, "grading_lock",
	).Find(&snapshots).Error)
	require.Len(t, snapshots, 1)
	require.Contains(t, snapshots[0].SnapshotJSON, "Explain fractions.")
	require.Contains(t, snapshots[0].SnapshotJSON, "Complete explanation")
	require.Contains(t, snapshots[0].SnapshotJSON, fixture.algebra.ID.String())

	_, err = fixture.service.Patch(
		fixture.teacher.ID, prepared.ID,
		exam.PatchInput{Title: ptr("Locked"), ExpectedVersion: prepared.Version},
	)
	questionDomainCode(t, err, exam.ErrorCodeExamLocked)

	retry, err := fixture.service.FirstSubmission(
		prepared.ID, "submission-1",
		exam.FirstSubmissionInput{TotalSubmissions: 30},
	)
	require.NoError(t, err)
	require.Equal(t, result, retry)

	_, err = fixture.service.FirstSubmission(
		prepared.ID, "submission-1",
		exam.FirstSubmissionInput{TotalSubmissions: 31},
	)
	questionDomainCode(t, err, exam.ErrorCodeIdempotencyConflict)

	var snapshotCount int64
	require.NoError(t, fixture.db.Model(&model.ExamSnapshot{}).
		Where("exam_id = ? AND purpose = ?", prepared.ID, "grading_lock").
		Count(&snapshotCount).Error)
	require.EqualValues(t, 1, snapshotCount)
}

func TestFirstSubmissionIdempotencyKeyCannotMoveAcrossExams(t *testing.T) {
	firstFixture, first := preparedExamFixture(t)
	_, err := firstFixture.service.FirstSubmission(
		first.ID, "shared-key", exam.FirstSubmissionInput{TotalSubmissions: 1},
	)
	require.NoError(t, err)

	second, err := firstFixture.service.Create(
		firstFixture.teacher.ID,
		exam.CreateInput{
			Title: "Second exam", Subject: "Algebra", GradeLevel: "5",
			DurationMinutes: 30, TotalPoints: model.MustScore("10.00"),
		},
	)
	require.NoError(t, err)
	_, err = firstFixture.service.FirstSubmission(
		second.ID, "shared-key", exam.FirstSubmissionInput{TotalSubmissions: 1},
	)
	questionDomainCode(t, err, exam.ErrorCodeIdempotencyConflict)
}

func TestGradingProgressIsMonotonicAndOnlyCompletionMovesDone(t *testing.T) {
	fixture, prepared := preparedExamFixture(t)

	_, err := fixture.service.GradingCompleted(
		prepared.ID, "before-lock",
		exam.GradingCompletedInput{
			TotalSubmissions: 10, GradedSubmissions: 1, ScoredSubmissions: 1,
		},
	)
	questionDomainCode(t, err, exam.ErrorCodeExamNotLocked)

	_, err = fixture.service.FirstSubmission(
		prepared.ID, "lock", exam.FirstSubmissionInput{TotalSubmissions: 10},
	)
	require.NoError(t, err)

	_, err = fixture.service.GradingCompleted(
		prepared.ID, "invalid-counts",
		exam.GradingCompletedInput{
			TotalSubmissions: 10, GradedSubmissions: 11, ScoredSubmissions: 1,
		},
	)
	questionDomainCode(t, err, exam.ErrorCodeInvalidGradingCounts)

	partial, err := fixture.service.GradingCompleted(
		prepared.ID, "partial",
		exam.GradingCompletedInput{
			TotalSubmissions: 10, GradedSubmissions: 6, ScoredSubmissions: 5,
		},
	)
	require.NoError(t, err)
	require.Equal(t, exam.ExamStatusPreparing, partial.Status)

	_, err = fixture.service.GradingCompleted(
		prepared.ID, "regression",
		exam.GradingCompletedInput{
			TotalSubmissions: 10, GradedSubmissions: 5, ScoredSubmissions: 5,
		},
	)
	questionDomainCode(t, err, exam.ErrorCodeGradingProgressRegression)

	_, err = fixture.service.GradingCompleted(
		prepared.ID, "wrong-total",
		exam.GradingCompletedInput{
			TotalSubmissions: 11, GradedSubmissions: 6, ScoredSubmissions: 5,
		},
	)
	questionDomainCode(t, err, exam.ErrorCodeSubmissionCountConflict)

	completed, err := fixture.service.GradingCompleted(
		prepared.ID, "completed",
		exam.GradingCompletedInput{
			TotalSubmissions: 10, GradedSubmissions: 10, ScoredSubmissions: 10,
		},
	)
	require.NoError(t, err)
	require.Equal(t, exam.ExamStatusDone, completed.Status)

	retry, err := fixture.service.GradingCompleted(
		prepared.ID, "completed",
		exam.GradingCompletedInput{
			TotalSubmissions: 10, GradedSubmissions: 10, ScoredSubmissions: 10,
		},
	)
	require.NoError(t, err)
	require.Equal(t, completed, retry)

	loaded, err := fixture.service.Get(fixture.teacher.ID, prepared.ID)
	require.NoError(t, err)
	require.Equal(t, exam.ExamStatusDone, loaded.Status)
	require.Equal(t, prepared.Version, loaded.Version, "callbacks must not change edit version")
}
