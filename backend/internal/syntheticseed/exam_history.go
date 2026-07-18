package syntheticseed

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type historicalExamFixture struct {
	Key             string
	Title           string
	Instructions    string
	Age             time.Duration
	DurationMinutes int
	Questions       []historicalQuestionFixture
}

type historicalQuestionFixture struct {
	Key             string
	QuestionType    string
	Content         string
	Points          model.Score
	TopicNodeID     uuid.UUID
	Choices         []historicalChoiceFixture
	CorrectChoiceID string
	Rubrics         []historicalRubricFixture
}

type historicalChoiceFixture struct {
	ID      string `json:"choiceId"`
	Content string `json:"content"`
}

type historicalRubricFixture struct {
	Key         string
	Description string
	Points      model.Score
}

type historicalResult struct {
	Status        string
	Reviewed      bool
	AwardedPoints model.Score
	Rubrics       []historicalResult
}

type historicalOutcome struct {
	Questions []historicalResult
	Total     model.Score
}

var objectiveStatuses = [][]string{
	{model.ScoringResultCorrect, model.ScoringResultCorrect, model.ScoringResultCorrect, model.ScoringResultCorrect},
	{model.ScoringResultCorrect, model.ScoringResultIncorrect, model.ScoringResultCorrect, model.ScoringResultIncorrect},
	{model.ScoringResultIncorrect, model.ScoringResultUnanswered, model.ScoringResultCorrect, model.ScoringResultIncorrect},
}

var essayRubricStatuses = [][][]string{
	{{model.ScoringResultCorrect, model.ScoringResultCorrect}, {model.ScoringResultCorrect, model.ScoringResultCorrect}},
	{{model.ScoringResultCorrect, model.ScoringResultIncorrect}, {model.ScoringResultIncorrect, model.ScoringResultCorrect}},
	{{model.ScoringResultIncorrect, model.ScoringResultIncorrect}, {model.ScoringResultCorrect, model.ScoringResultIncorrect}},
}

func historicalExamFixtures(_ Config, nodeIDs []uuid.UUID) []historicalExamFixture {
	nodeAt := func(index int) uuid.UUID {
		if len(nodeIDs) == 0 {
			return uuid.Nil
		}
		return nodeIDs[index%len(nodeIDs)]
	}
	choice := func(id, content string) historicalChoiceFixture {
		return historicalChoiceFixture{ID: id, Content: content}
	}
	rubrics := func(prefix string) []historicalRubricFixture {
		return []historicalRubricFixture{
			{Key: prefix + "-method", Description: "Uses the correct method", Points: model.MustScore("2.00")},
			{Key: prefix + "-result", Description: "Computes and concludes correctly", Points: model.MustScore("3.00")},
		}
	}

	return []historicalExamFixture{
		{
			Key: "synthetic-objective-history", Title: "Synthetic - Fraction and decimal quiz",
			Instructions: "Choose one answer for each question.", Age: 14 * 24 * time.Hour, DurationMinutes: 20,
			Questions: []historicalQuestionFixture{
				{Key: "fraction-same-denominator", QuestionType: "single_choice", Content: "Calculate 2/7 + 3/7.", Points: model.MustScore("2.50"), TopicNodeID: nodeAt(0), Choices: []historicalChoiceFixture{choice("a", "5/7"), choice("b", "5/14"), choice("c", "6/7"), choice("d", "1")}, CorrectChoiceID: "a"},
				{Key: "fraction-different-denominator", QuestionType: "single_choice", Content: "Calculate 1/2 + 1/3.", Points: model.MustScore("2.50"), TopicNodeID: nodeAt(1), Choices: []historicalChoiceFixture{choice("a", "2/5"), choice("b", "5/6"), choice("c", "1/6"), choice("d", "2/3")}, CorrectChoiceID: "b"},
				{Key: "decimal-product", QuestionType: "single_choice", Content: "Calculate 1.2 x 0.5.", Points: model.MustScore("2.50"), TopicNodeID: nodeAt(2), Choices: []historicalChoiceFixture{choice("a", "0.06"), choice("b", "0.6"), choice("c", "6"), choice("d", "1.7")}, CorrectChoiceID: "b"},
				{Key: "fraction-application", QuestionType: "single_choice", Content: "Which fraction equals 0.75?", Points: model.MustScore("2.50"), TopicNodeID: nodeAt(1), Choices: []historicalChoiceFixture{choice("a", "1/4"), choice("b", "1/2"), choice("c", "3/4"), choice("d", "4/3")}, CorrectChoiceID: "c"},
			},
		},
		{
			Key: "synthetic-essay-history", Title: "Synthetic - Written mathematics assessment",
			Instructions: "Show every calculation and state the final conclusion.", Age: 7 * 24 * time.Hour, DurationMinutes: 45,
			Questions: []historicalQuestionFixture{
				{Key: "essay-fractions", QuestionType: "essay", Content: "Explain and calculate 3/4 + 5/6.", Points: model.MustScore("5.00"), TopicNodeID: nodeAt(1), Rubrics: rubrics("essay-fractions")},
				{Key: "essay-decimals", QuestionType: "essay", Content: "Solve a word problem using decimal multiplication.", Points: model.MustScore("5.00"), TopicNodeID: nodeAt(2), Rubrics: rubrics("essay-decimals")},
			},
		},
	}
}

func deriveHistoricalOutcome(exam historicalExamFixture, studentIndex int) historicalOutcome {
	studentIndex = normalizedStudentIndex(studentIndex)
	outcome := historicalOutcome{Questions: make([]historicalResult, 0, len(exam.Questions)), Total: model.MustScore("0.00")}
	for questionIndex, question := range exam.Questions {
		result := historicalResult{Reviewed: true, AwardedPoints: model.MustScore("0.00")}
		if question.QuestionType == "single_choice" {
			result.Status = objectiveStatuses[studentIndex][questionIndex]
			if result.Status == model.ScoringResultCorrect {
				result.AwardedPoints = question.Points
			}
		} else {
			statuses := essayRubricStatuses[studentIndex][questionIndex]
			result.Rubrics = make([]historicalResult, 0, len(question.Rubrics))
			allCorrect := true
			allUnanswered := true
			for rubricIndex, rubric := range question.Rubrics {
				status := statuses[rubricIndex]
				rubricResult := historicalResult{Status: status, Reviewed: true, AwardedPoints: model.MustScore("0.00")}
				if status == model.ScoringResultCorrect {
					rubricResult.AwardedPoints = rubric.Points
				}
				allCorrect = allCorrect && status == model.ScoringResultCorrect
				allUnanswered = allUnanswered && status == model.ScoringResultUnanswered
				result.AwardedPoints.Decimal = result.AwardedPoints.Decimal.Add(rubricResult.AwardedPoints.Decimal)
				result.Rubrics = append(result.Rubrics, rubricResult)
			}
			switch {
			case allUnanswered:
				result.Status = model.ScoringResultUnanswered
			case allCorrect:
				result.Status = model.ScoringResultCorrect
			default:
				result.Status = model.ScoringResultIncorrect
			}
		}
		outcome.Total.Decimal = outcome.Total.Decimal.Add(result.AwardedPoints.Decimal)
		outcome.Questions = append(outcome.Questions, result)
	}
	return outcome
}

func validateHistoricalOutcome(exam historicalExamFixture, outcome historicalOutcome) error {
	if len(outcome.Questions) != len(exam.Questions) {
		return fmt.Errorf("question result count %d does not match %d", len(outcome.Questions), len(exam.Questions))
	}
	total := model.MustScore("0.00")
	for questionIndex, question := range exam.Questions {
		result := outcome.Questions[questionIndex]
		expected := model.MustScore("0.00")
		if question.QuestionType == "single_choice" {
			if len(result.Rubrics) != 0 {
				return fmt.Errorf("objective question %s contains rubric results", question.Key)
			}
			if result.Status == model.ScoringResultCorrect {
				expected = question.Points
			}
		} else {
			if len(result.Rubrics) != len(question.Rubrics) {
				return fmt.Errorf("essay question %s rubric result count does not match", question.Key)
			}
			for rubricIndex, rubric := range question.Rubrics {
				if result.Rubrics[rubricIndex].Status == model.ScoringResultCorrect {
					expected.Decimal = expected.Decimal.Add(rubric.Points.Decimal)
				}
			}
		}
		if !expected.Decimal.Equal(result.AwardedPoints.Decimal) {
			return fmt.Errorf("question %s awarded points are not derived", question.Key)
		}
		total.Decimal = total.Decimal.Add(expected.Decimal)
	}
	if !total.Decimal.Equal(outcome.Total.Decimal) {
		return fmt.Errorf("submission total is not derived from question results")
	}
	return nil
}

func normalizedStudentIndex(index int) int {
	if index < 0 {
		return 0
	}
	return index % len(objectiveStatuses)
}

type historicalSnapshot struct {
	ID          uuid.UUID                    `json:"id"`
	TotalPoints model.Score                  `json:"totalPoints"`
	Questions   []historicalSnapshotQuestion `json:"questions"`
}

type historicalSnapshotQuestion struct {
	ID           uuid.UUID                  `json:"id"`
	QuestionType string                     `json:"questionType"`
	Points       model.Score                `json:"points"`
	Position     int                        `json:"position"`
	Rubrics      []historicalSnapshotRubric `json:"rubrics"`
}

type historicalSnapshotRubric struct {
	ID       uuid.UUID   `json:"id"`
	Points   model.Score `json:"points"`
	Position int         `json:"position"`
}

func createHistoricalExamData(
	tx *gorm.DB,
	config Config,
	teacher model.User,
	students []model.User,
	nodeIDs []uuid.UUID,
	now time.Time,
) ([]model.Exam, int, error) {
	fixtures := historicalExamFixtures(config, nodeIDs)
	exams := make([]model.Exam, 0, len(fixtures))
	approvedCount := 0

	for _, fixture := range fixtures {
		createdAt := now.Add(-fixture.Age)
		exam := model.Exam{
			ID: stableSyntheticUUID("exam", fixture.Key), Title: fixture.Title, Subject: config.Subject, GradeLevel: "Synthetic",
			DurationMinutes: fixture.DurationMinutes, Instructions: fixture.Instructions,
			TotalPoints: model.MustScore("10.00"), Status: model.ExamStatusPreparingExam,
			Version: 1, CreatedBy: teacher.ID, CreatedAt: createdAt, UpdatedAt: createdAt,
		}
		if err := tx.Create(&exam).Error; err != nil {
			return nil, 0, fmt.Errorf("create historical exam %s: %w", fixture.Key, err)
		}

		questions := make([]model.ExamQuestion, 0, len(fixture.Questions))
		rubricsByQuestion := make([][]model.ExamRubricItem, len(fixture.Questions))
		snapshotQuestions := make([]historicalSnapshotQuestion, 0, len(fixture.Questions))
		for questionIndex, questionFixture := range fixture.Questions {
			choicesJSON, err := json.Marshal(questionFixture.Choices)
			if err != nil {
				return nil, 0, fmt.Errorf("marshal choices for %s: %w", questionFixture.Key, err)
			}
			topicsJSON, err := json.Marshal([]uuid.UUID{questionFixture.TopicNodeID})
			if err != nil {
				return nil, 0, fmt.Errorf("marshal topics for %s: %w", questionFixture.Key, err)
			}
			question := model.ExamQuestion{
				ID: stableSyntheticUUID("exam", fixture.Key, "question", questionFixture.Key), ExamID: exam.ID, SourceType: "manual", QuestionType: questionFixture.QuestionType,
				Content: questionFixture.Content, Points: questionFixture.Points, Position: questionIndex,
				ChoicesJSON: string(choicesJSON), TopicNodeIDsJSON: string(topicsJSON),
				CreatedAt: createdAt, UpdatedAt: createdAt,
			}
			if questionFixture.QuestionType == "single_choice" {
				question.CorrectChoiceID = &questionFixture.CorrectChoiceID
			}
			if err := tx.Create(&question).Error; err != nil {
				return nil, 0, fmt.Errorf("create historical question %s: %w", questionFixture.Key, err)
			}
			questions = append(questions, question)

			snapshotQuestion := historicalSnapshotQuestion{
				ID: question.ID, QuestionType: question.QuestionType, Points: question.Points,
				Position: question.Position, Rubrics: []historicalSnapshotRubric{},
			}
			for rubricIndex, rubricFixture := range questionFixture.Rubrics {
				rubric := model.ExamRubricItem{
					ID: stableSyntheticUUID("exam", fixture.Key, "rubric", rubricFixture.Key), ExamQuestionID: question.ID, Description: rubricFixture.Description,
					Points: rubricFixture.Points, Position: rubricIndex, TopicNodeIDsJSON: string(topicsJSON),
					CreatedAt: createdAt, UpdatedAt: createdAt,
				}
				if err := tx.Create(&rubric).Error; err != nil {
					return nil, 0, fmt.Errorf("create historical rubric %s: %w", rubricFixture.Key, err)
				}
				rubricsByQuestion[questionIndex] = append(rubricsByQuestion[questionIndex], rubric)
				snapshotQuestion.Rubrics = append(snapshotQuestion.Rubrics, historicalSnapshotRubric{
					ID: rubric.ID, Points: rubric.Points, Position: rubric.Position,
				})
			}
			snapshotQuestions = append(snapshotQuestions, snapshotQuestion)
		}

		snapshotJSON, err := json.Marshal(historicalSnapshot{
			ID: exam.ID, TotalPoints: exam.TotalPoints, Questions: snapshotQuestions,
		})
		if err != nil {
			return nil, 0, fmt.Errorf("marshal historical snapshot %s: %w", fixture.Key, err)
		}
		snapshot := model.ExamSnapshot{
			ID: stableSyntheticUUID("exam", fixture.Key, "snapshot"), ExamID: exam.ID, ExamVersion: exam.Version, Purpose: "grading_lock",
			SnapshotJSON: string(snapshotJSON), CreatedAt: createdAt.Add(5 * time.Minute),
		}
		if err := tx.Create(&snapshot).Error; err != nil {
			return nil, 0, fmt.Errorf("create historical snapshot %s: %w", fixture.Key, err)
		}
		firstSubmissionAt := createdAt.Add(time.Duration(fixture.DurationMinutes) * time.Minute)
		exam.LockedSnapshotID = &snapshot.ID
		exam.FirstSubmissionReceivedAt = &firstSubmissionAt
		if err := tx.Model(&model.Exam{}).Where("id = ?", exam.ID).Updates(map[string]any{
			"locked_snapshot_id": exam.LockedSnapshotID, "first_submission_received_at": firstSubmissionAt,
			"updated_at": createdAt,
		}).Error; err != nil {
			return nil, 0, fmt.Errorf("lock historical exam %s: %w", fixture.Key, err)
		}
		progress := model.ExamGradingProgress{
			ExamID: exam.ID, TotalSubmissions: len(students), GradedSubmissions: len(students),
			ScoredSubmissions: len(students), UpdatedAt: firstSubmissionAt.Add(2 * time.Hour),
		}
		if err := tx.Create(&progress).Error; err != nil {
			return nil, 0, fmt.Errorf("create historical progress %s: %w", fixture.Key, err)
		}

		for studentIndex, student := range students {
			outcome := deriveHistoricalOutcome(fixture, studentIndex)
			if err := validateHistoricalOutcome(fixture, outcome); err != nil {
				return nil, 0, fmt.Errorf("validate %s student %d: %w", fixture.Key, studentIndex, err)
			}
			approvedAt := firstSubmissionAt.Add(time.Duration(studentIndex+1) * time.Hour)
			batch := model.GradingBatch{
				ID: stableSyntheticUUID("exam", fixture.Key, "batch", student.Email), ExamID: exam.ID, ExamSnapshotID: snapshot.ID, CreatedBy: teacher.ID,
				Status: model.GradingBatchStatusCompleted, TotalSubmissions: 1, ApprovedSubmissions: 1,
				CreatedAt: firstSubmissionAt, CompletedAt: &approvedAt,
			}
			if err := tx.Create(&batch).Error; err != nil {
				return nil, 0, fmt.Errorf("create historical batch %s student %d: %w", fixture.Key, studentIndex, err)
			}
			submission := model.ScoringSubmission{
				ID: stableSyntheticUUID("exam", fixture.Key, "submission", student.Email), GradingBatchID: batch.ID, StudentID: student.ID,
				Status: model.ScoringSubmissionStatusApproved, Version: 2, AwardedPoints: outcome.Total,
				EffectiveApprovalVersion: 1, ApprovedBy: &teacher.ID, ApprovedAt: &approvedAt,
				CreatedAt: firstSubmissionAt, UpdatedAt: approvedAt,
			}
			if err := tx.Create(&submission).Error; err != nil {
				return nil, 0, fmt.Errorf("create historical submission %s student %d: %w", fixture.Key, studentIndex, err)
			}

			questionRows := make([]model.ScoringQuestionResult, 0, len(questions))
			rubricRows := make([]model.ScoringRubricResult, 0)
			for questionIndex, question := range questions {
				questionOutcome := outcome.Questions[questionIndex]
				questionRow := model.ScoringQuestionResult{
					SubmissionID: submission.ID, ExamQuestionID: question.ID, Status: questionOutcome.Status,
					Reviewed: questionOutcome.Reviewed, AwardedPoints: questionOutcome.AwardedPoints,
					UpdatedBy: teacher.ID, UpdatedAt: approvedAt,
				}
				if err := tx.Create(&questionRow).Error; err != nil {
					return nil, 0, fmt.Errorf("create historical question result %s student %d: %w", fixture.Key, studentIndex, err)
				}
				questionRows = append(questionRows, questionRow)
				for rubricIndex, rubric := range rubricsByQuestion[questionIndex] {
					rubricOutcome := questionOutcome.Rubrics[rubricIndex]
					rubricRow := model.ScoringRubricResult{
						SubmissionID: submission.ID, ExamRubricItemID: rubric.ID, Status: rubricOutcome.Status,
						Reviewed: rubricOutcome.Reviewed, AwardedPoints: rubricOutcome.AwardedPoints,
						UpdatedBy: teacher.ID, UpdatedAt: approvedAt,
					}
					if err := tx.Create(&rubricRow).Error; err != nil {
						return nil, 0, fmt.Errorf("create historical rubric result %s student %d: %w", fixture.Key, studentIndex, err)
					}
					rubricRows = append(rubricRows, rubricRow)
				}
			}

			approvalJSON, err := json.Marshal(struct {
				Questions []model.ScoringQuestionResult `json:"questions"`
				Rubrics   []model.ScoringRubricResult   `json:"rubrics"`
			}{Questions: questionRows, Rubrics: rubricRows})
			if err != nil {
				return nil, 0, fmt.Errorf("marshal historical approval %s student %d: %w", fixture.Key, studentIndex, err)
			}
			approval := model.ScoringApprovalSnapshot{
				ID: stableSyntheticUUID("exam", fixture.Key, "approval", student.Email), SubmissionID: submission.ID, ApprovalVersion: 1,
				ResultJSON: string(approvalJSON), TotalPoints: outcome.Total,
				ApprovedBy: teacher.ID, ApprovedAt: approvedAt,
			}
			if err := tx.Create(&approval).Error; err != nil {
				return nil, 0, fmt.Errorf("create historical approval %s student %d: %w", fixture.Key, studentIndex, err)
			}
			audit := model.ScoringAuditLog{
				ID: stableSyntheticUUID("exam", fixture.Key, "audit", student.Email), BatchID: batch.ID, SubmissionID: &submission.ID,
				Action: "submission_approved", ActorID: teacher.ID,
				NewValueJSON: string(approvalJSON), OccurredAt: approvedAt,
			}
			if err := tx.Create(&audit).Error; err != nil {
				return nil, 0, fmt.Errorf("create historical audit %s student %d: %w", fixture.Key, studentIndex, err)
			}
			approvedCount++
		}

		exams = append(exams, exam)
	}
	return exams, approvedCount, nil
}

func resetHistoricalExamData(tx *gorm.DB, teacherIDs []uuid.UUID) error {
	if len(teacherIDs) == 0 {
		return nil
	}
	var examIDs []uuid.UUID
	if err := tx.Unscoped().Model(&model.Exam{}).Where("created_by IN ?", teacherIDs).Pluck("id", &examIDs).Error; err != nil {
		return err
	}
	if len(examIDs) == 0 {
		return nil
	}
	var batchIDs []uuid.UUID
	if err := tx.Model(&model.GradingBatch{}).Where("exam_id IN ?", examIDs).Pluck("id", &batchIDs).Error; err != nil {
		return err
	}
	var submissionIDs []uuid.UUID
	if len(batchIDs) > 0 {
		if err := tx.Model(&model.ScoringSubmission{}).Where("grading_batch_id IN ?", batchIDs).Pluck("id", &submissionIDs).Error; err != nil {
			return err
		}
	}
	if len(submissionIDs) > 0 {
		for _, deletion := range []any{
			&model.ScoringApprovalSnapshot{}, &model.ScoringQuestionResult{}, &model.ScoringRubricResult{},
		} {
			if err := tx.Where("submission_id IN ?", submissionIDs).Delete(deletion).Error; err != nil {
				return err
			}
		}
	}
	if len(batchIDs) > 0 {
		if err := tx.Where("batch_id IN ?", batchIDs).Delete(&model.ScoringAuditLog{}).Error; err != nil {
			return err
		}
		if err := tx.Where("grading_batch_id IN ?", batchIDs).Delete(&model.ScoringSubmission{}).Error; err != nil {
			return err
		}
		if err := tx.Where("id IN ?", batchIDs).Delete(&model.GradingBatch{}).Error; err != nil {
			return err
		}
	}
	for _, deletion := range []any{&model.ExamInternalEvent{}, &model.ExamGradingProgress{}, &model.ExamAuditLog{}, &model.ExamSnapshot{}} {
		if err := tx.Where("exam_id IN ?", examIDs).Delete(deletion).Error; err != nil {
			return err
		}
	}
	var questionIDs []uuid.UUID
	if err := tx.Model(&model.ExamQuestion{}).Where("exam_id IN ?", examIDs).Pluck("id", &questionIDs).Error; err != nil {
		return err
	}
	if len(questionIDs) > 0 {
		if err := tx.Where("exam_question_id IN ?", questionIDs).Delete(&model.ExamRubricItem{}).Error; err != nil {
			return err
		}
		if err := tx.Where("id IN ?", questionIDs).Delete(&model.ExamQuestion{}).Error; err != nil {
			return err
		}
	}
	return tx.Unscoped().Where("id IN ?", examIDs).Delete(&model.Exam{}).Error
}

func stableSyntheticUUID(parts ...string) uuid.UUID {
	return uuid.NewSHA1(uuid.NameSpaceOID, []byte("aurora-synthetic-seed:"+strings.Join(parts, ":")))
}
