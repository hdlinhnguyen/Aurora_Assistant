package syntheticseed

import (
	"context"
	"encoding/json"
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
		&model.User{}, &model.Classroom{}, &model.ChatSession{}, &model.Message{}, &model.Topic{},
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
	require.Equal(t, 10, result.ExamCount)
	require.Equal(t, 30, result.ApprovedSubmissionCount)

	var exams []model.Exam
	require.NoError(t, service.db.Where("created_by = ?", result.Teacher.ID).Order("created_at").Find(&exams).Error)
	require.Len(t, exams, 10)
	require.Equal(t, model.ExamStatusPreparingExam, exams[0].Status)
	require.NotNil(t, exams[0].LockedSnapshotID)
	require.True(t, exams[0].CreatedAt.Before(time.Now().UTC().Add(-24*time.Hour)))
	var targetNodes []model.Node
	require.NoError(t, service.db.Where("subject = ? AND stable_key IN ?", result.Subject, grade7TargetKeys()).Find(&targetNodes).Error)
	targetIDs := make(map[uuid.UUID]struct{}, len(targetNodes))
	for _, node := range targetNodes {
		targetIDs[node.ID] = struct{}{}
	}
	for _, exam := range exams {
		require.Equal(t, "7", exam.GradeLevel)
		var snapshot model.ExamSnapshot
		require.NoError(t, service.db.First(&snapshot, "id = ?", *exam.LockedSnapshotID).Error)
		_, err := scoring.ParseGradingSnapshot(snapshot)
		require.NoError(t, err)
		var questions []model.ExamQuestion
		require.NoError(t, service.db.Where("exam_id = ?", exam.ID).Find(&questions).Error)
		for _, question := range questions {
			var topicIDs []uuid.UUID
			require.NoError(t, json.Unmarshal([]byte(question.TopicNodeIDsJSON), &topicIDs))
			require.Len(t, topicIDs, 1)
			require.Contains(t, targetIDs, topicIDs[0])
		}
	}

	studentTotals := make([]model.Score, len(result.Students))
	for studentIndex, student := range result.Students {
		studentTotals[studentIndex] = model.MustScore("0.00")
		var submissions []model.ScoringSubmission
		require.NoError(t, service.db.
			Joins("JOIN grading_batches ON grading_batches.id = scoring_submissions.grading_batch_id").
			Where("scoring_submissions.student_id = ? AND grading_batches.created_by = ?", student.ID, result.Teacher.ID).
			Find(&submissions).Error)
		require.Len(t, submissions, 10)
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
	realTeacher := model.User{ID: uuid.New(), Email: "real.teacher@example.com", Password: "hash", Name: "Real Teacher", Role: "teacher"}
	realStudent := model.User{ID: uuid.New(), Email: "real.student@example.com", Password: "hash", Name: "Real Student", Role: "student"}
	realRoot := model.Node{ID: uuid.New(), Subject: DefaultConfig().Subject, Name: "Real root", IsRoot: true, StableKey: "real-root"}
	realTopic := model.Node{ID: uuid.New(), Subject: DefaultConfig().Subject, Name: "Real topic", StableKey: "real-topic"}
	realQuestion := model.Question{
		ID: uuid.New(), NodeID: realTopic.ID, Content: "Real question", OptionsJSON: `["A","B"]`, CorrectOption: 0,
		Difficulty: "easy", QuestionType: "multiple_choice", GradeLevel: "7",
	}
	realEdge := model.Edge{
		ID: uuid.New(), Subject: DefaultConfig().Subject, SourceID: realRoot.ID, TargetID: realTopic.ID,
		Status: "active", SourceType: "human",
	}
	realMastery := model.StudentTopicMastery{
		ID: uuid.New(), StudentID: realStudent.ID, TopicID: realTopic.ID, MasteryProbability: 0.8,
		ConfidenceScore: 0.7, Consistency: 0.9, EvidenceCount: 4, EffectiveEvidence: 4,
		MasteryStatus: "mastered", EvidenceSummaryJSON: `{}`, SourceBreakdownJSON: `{}`, Version: 1,
		CalculatedAt: time.Now().UTC(),
	}
	realHistory := model.StudentTopicMasteryHistory{
		ID: uuid.New(), StudentID: realStudent.ID, TopicID: realTopic.ID, Version: 1, MasteryProbability: 0.8,
		ConfidenceScore: 0.7, Consistency: 0.9, EvidenceCount: 4, EffectiveEvidence: 4,
		MasteryStatus: "mastered", EvidenceSummaryJSON: `{}`, SourceBreakdownJSON: `{}`,
		CalculatedAt: time.Now().UTC(), RecordedAt: time.Now().UTC(),
	}
	require.NoError(t, service.db.Create(&[]model.User{realTeacher, realStudent}).Error)
	require.NoError(t, service.db.Create(&[]model.Node{realRoot, realTopic}).Error)
	require.NoError(t, service.db.Create(&realQuestion).Error)
	require.NoError(t, service.db.Create(&realEdge).Error)
	require.NoError(t, service.db.Create(&realMastery).Error)
	require.NoError(t, service.db.Create(&realHistory).Error)

	result, err := service.ResetAndSeed(context.Background())
	require.NoError(t, err)
	_, err = service.ResetAndSeed(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Students, 3)
	require.Equal(t, DefaultConfig().Subject, result.Subject)

	for _, record := range []struct {
		model any
		id    uuid.UUID
	}{
		{&model.User{}, realTeacher.ID},
		{&model.User{}, realStudent.ID},
		{&model.Node{}, realRoot.ID},
		{&model.Node{}, realTopic.ID},
		{&model.Question{}, realQuestion.ID},
		{&model.Edge{}, realEdge.ID},
		{&model.StudentTopicMastery{}, realMastery.ID},
		{&model.StudentTopicMasteryHistory{}, realHistory.ID},
	} {
		var count int64
		require.NoError(t, service.db.Model(record.model).Where("id = ?", record.id).Count(&count).Error)
		require.EqualValues(t, 1, count, "real record %s must survive synthetic reset", record.id)
	}
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
	require.EqualValues(t, second.QuestionCount, questions)
	require.Equal(t, (len(second.NodeIDs)-1)*3, second.QuestionCount)
	require.EqualValues(t, second.ActivityCount, logs)

	for studentIndex, student := range second.Students {
		var topicCount int64
		require.NoError(t, service.db.Model(&model.ActivityLog{}).
			Distinct("node_id").Where("student_id = ? AND action IN ?", student.ID, []string{"answer_correct", "answer_incorrect"}).
			Count(&topicCount).Error)
		expectedTopics := 0
		for nodePos := 0; nodePos < len(second.NodeIDs)-1; nodePos++ {
			if len(GenerateFrontierAttempts(DefaultConfig().Seed, studentIndex, nodePos, len(second.NodeIDs)-1, 3)) > 0 {
				expectedTopics++
			}
		}
		require.EqualValues(t, expectedTopics, topicCount)
	}
}
