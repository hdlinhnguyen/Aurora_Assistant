package syntheticseed

import (
	"context"
	"strings"
	"testing"
	"time"

	"backend/internal/model"
	"backend/internal/scoring"
	"backend/internal/testutil"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func setupSeedDatabase(t *testing.T) *Service {
	t.Helper()
	db := testutil.OpenPostgres(t)
	require.NoError(t, db.AutoMigrate(
		&model.User{}, &model.ChatSession{}, &model.Message{}, &model.Topic{},
		&model.Node{}, &model.Edge{}, &model.Question{}, &model.QuestionRubricItem{},
		&model.QuestionTopicMapping{}, &model.QuestionRubricItemTopicMapping{},
		&model.QuestionTaggingState{}, &model.StudentState{}, &model.ActivityLog{},
		&model.StudentTopicMastery{}, &model.StudentTopicMasteryHistory{},
		&model.GuardrailEvent{}, &model.LearningPath{}, &model.Exam{},
		&model.ExamQuestion{}, &model.ExamRubricItem{}, &model.ExamSnapshot{},
		&model.ExamGradingProgress{}, &model.ExamInternalEvent{}, &model.ExamAuditLog{},
		&model.GradingBatch{}, &model.ScoringSubmission{}, &model.ScoringQuestionResult{},
		&model.ScoringRubricResult{}, &model.ScoringApprovalSnapshot{}, &model.ScoringAuditLog{},
		&model.ScoringInternalEvent{},
	))
	return New(db, DefaultConfig())
}

func TestResetAndSeedCreatesApprovedHistoricalResultsForEveryStudent(t *testing.T) {
	service := setupSeedDatabase(t)
	result, err := service.ResetAndSeed(context.Background())
	require.NoError(t, err)
	require.Equal(t, 2, result.ExamCount)
	require.Equal(t, 6, result.ApprovedSubmissionCount)

	var exams []model.Exam
	require.NoError(t, service.db.Where("created_by = ?", result.Teacher.ID).Order("created_at").Find(&exams).Error)
	require.Len(t, exams, 2)
	require.Equal(t, model.ExamStatusPreparingExam, exams[0].Status)
	require.NotNil(t, exams[0].LockedSnapshotID)
	require.True(t, exams[0].CreatedAt.Before(time.Now().UTC().Add(-24*time.Hour)))
	for _, exam := range exams {
		var snapshot model.ExamSnapshot
		require.NoError(t, service.db.First(&snapshot, "id = ?", *exam.LockedSnapshotID).Error)
		_, err := scoring.ParseGradingSnapshot(snapshot)
		require.NoError(t, err)
	}

	studentTotals := make([]model.Score, len(result.Students))
	for studentIndex, student := range result.Students {
		studentTotals[studentIndex] = model.MustScore("0.00")
		var submissions []model.ScoringSubmission
		require.NoError(t, service.db.
			Joins("JOIN grading_batches ON grading_batches.id = scoring_submissions.grading_batch_id").
			Where("scoring_submissions.student_id = ? AND grading_batches.created_by = ?", student.ID, result.Teacher.ID).
			Find(&submissions).Error)
		require.Len(t, submissions, 2)
		for _, submission := range submissions {
			require.Equal(t, model.ScoringSubmissionStatusApproved, submission.Status)
			require.Equal(t, 1, submission.EffectiveApprovalVersion)
			studentTotals[studentIndex].Decimal = studentTotals[studentIndex].Decimal.Add(submission.AwardedPoints.Decimal)
			var questionRows []model.ScoringQuestionResult
			require.NoError(t, service.db.Where("submission_id = ?", submission.ID).Find(&questionRows).Error)
			require.NotEmpty(t, questionRows)
			questionTotal := model.MustScore("0.00")
			for _, questionRow := range questionRows {
				questionTotal.Decimal = questionTotal.Decimal.Add(questionRow.AwardedPoints.Decimal)
				var question model.ExamQuestion
				require.NoError(t, service.db.First(&question, "id = ?", questionRow.ExamQuestionID).Error)
				if question.QuestionType != "essay" {
					continue
				}
				var rubricIDs []uuid.UUID
				require.NoError(t, service.db.Model(&model.ExamRubricItem{}).
					Where("exam_question_id = ?", question.ID).Pluck("id", &rubricIDs).Error)
				require.NotEmpty(t, rubricIDs)
				var rubricRows []model.ScoringRubricResult
				require.NoError(t, service.db.Where("submission_id = ? AND exam_rubric_item_id IN ?", submission.ID, rubricIDs).
					Find(&rubricRows).Error)
				rubricTotal := model.MustScore("0.00")
				for _, rubricRow := range rubricRows {
					rubricTotal.Decimal = rubricTotal.Decimal.Add(rubricRow.AwardedPoints.Decimal)
				}
				require.True(t, rubricTotal.Decimal.Equal(questionRow.AwardedPoints.Decimal))
			}
			require.True(t, questionTotal.Decimal.Equal(submission.AwardedPoints.Decimal))
			var approvals int64
			require.NoError(t, service.db.Model(&model.ScoringApprovalSnapshot{}).
				Where("submission_id = ?", submission.ID).Count(&approvals).Error)
			require.EqualValues(t, 1, approvals)
		}
	}
	require.True(t, studentTotals[0].Decimal.GreaterThan(studentTotals[1].Decimal))
	require.True(t, studentTotals[1].Decimal.GreaterThan(studentTotals[2].Decimal))
}

func TestResetAndSeedPersistsGrade7CurriculumClosure(t *testing.T) {
	service := setupSeedDatabase(t)
	result, err := service.ResetAndSeed(context.Background())
	require.NoError(t, err)

	var nodes []model.Node
	require.NoError(t, service.db.Where("subject = ?", result.Subject).Find(&nodes).Error)
	require.GreaterOrEqual(t, len(nodes), 25)
	nodeIDs := make(map[uuid.UUID]struct{}, len(nodes))
	for _, node := range nodes {
		nodeIDs[node.ID] = struct{}{}
		require.NotContains(t, strings.ToLower(node.Name), "hình")
	}
	var targetNodes []model.Node
	require.NoError(t, service.db.Where("subject = ? AND stable_key IN ?", result.Subject, grade7TargetKeys()).Find(&targetNodes).Error)
	require.Len(t, targetNodes, 8)

	var edges []model.Edge
	require.NoError(t, service.db.Where("subject = ?", result.Subject).Find(&edges).Error)
	require.NotEmpty(t, edges)
	for _, edge := range edges {
		require.Contains(t, nodeIDs, edge.SourceID)
		require.Contains(t, nodeIDs, edge.TargetID)
		require.NotEqual(t, edge.SourceID, edge.TargetID)
	}
}

func TestResetAndSeedPreservesRealData(t *testing.T) {
	service := setupSeedDatabase(t)
	realUser := model.User{ID: uuid.New(), Email: "real@example.com", Password: "hash", Name: "Real User", Role: "teacher"}
	realNode := model.Node{ID: uuid.New(), Subject: "Real subject", Name: "Real topic", IsRoot: true}
	require.NoError(t, service.db.Create(&realUser).Error)
	require.NoError(t, service.db.Create(&realNode).Error)

	result, err := service.ResetAndSeed(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Students, 3)
	require.Equal(t, DefaultConfig().Subject, result.Subject)

	var userCount, nodeCount int64
	require.NoError(t, service.db.Model(&model.User{}).Where("id = ?", realUser.ID).Count(&userCount).Error)
	require.NoError(t, service.db.Model(&model.Node{}).Where("id = ?", realNode.ID).Count(&nodeCount).Error)
	require.EqualValues(t, 1, userCount)
	require.EqualValues(t, 1, nodeCount)
}

func TestResetAndSeedIsIdempotentAndCreatesAnswerEvidence(t *testing.T) {
	service := setupSeedDatabase(t)
	first, err := service.ResetAndSeed(context.Background())
	require.NoError(t, err)
	var firstExamIDs []uuid.UUID
	require.NoError(t, service.db.Model(&model.Exam{}).Where("created_by = ?", first.Teacher.ID).Order("id").Pluck("id", &firstExamIDs).Error)
	second, err := service.ResetAndSeed(context.Background())
	require.NoError(t, err)
	require.NotEqual(t, first.Teacher.ID, second.Teacher.ID)
	var secondExamIDs []uuid.UUID
	require.NoError(t, service.db.Model(&model.Exam{}).Where("created_by = ?", second.Teacher.ID).Order("id").Pluck("id", &secondExamIDs).Error)
	require.Equal(t, firstExamIDs, secondExamIDs)

	var users, nodes, questions, logs int64
	require.NoError(t, service.db.Model(&model.User{}).Where("email LIKE ?", "synthetic.%@aurora.local").Count(&users).Error)
	require.NoError(t, service.db.Model(&model.Node{}).Where("subject = ?", second.Subject).Count(&nodes).Error)
	require.NoError(t, service.db.Model(&model.Question{}).Where("node_id IN ?", second.NodeIDs).Count(&questions).Error)
	require.NoError(t, service.db.Model(&model.ActivityLog{}).Where("student_id IN ?", studentIDs(second.Students)).Count(&logs).Error)
	require.EqualValues(t, 4, users)
	require.EqualValues(t, 25, nodes)
	require.EqualValues(t, 24, questions)
	require.EqualValues(t, 54, logs)

	for _, student := range second.Students {
		var topicCount int64
		require.NoError(t, service.db.Model(&model.ActivityLog{}).
			Distinct("node_id").Where("student_id = ? AND action IN ?", student.ID, []string{"answer_correct", "answer_incorrect"}).
			Count(&topicCount).Error)
		require.EqualValues(t, 3, topicCount)
	}
}
