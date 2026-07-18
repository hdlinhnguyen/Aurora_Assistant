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
	GradeLevel      string
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

func historicalExamFixtures(_ Config, nodes map[string]uuid.UUID) []historicalExamFixture {
	choice := func(id, content string) historicalChoiceFixture {
		return historicalChoiceFixture{ID: id, Content: content}
	}
	objectiveQuestion := func(key, topicKey, content, correct string, options ...string) historicalQuestionFixture {
		choices := make([]historicalChoiceFixture, 0, len(options))
		for index, option := range options {
			choices = append(choices, choice(string(rune('a'+index)), option))
		}
		return historicalQuestionFixture{
			Key: key, QuestionType: "single_choice", Content: content, Points: model.MustScore("2.50"),
			TopicNodeID: nodes[topicKey], Choices: choices, CorrectChoiceID: correct,
		}
	}
	rubrics := func(prefix string) []historicalRubricFixture {
		return []historicalRubricFixture{
			{Key: prefix + "-method", Description: "Trình bày đúng phương pháp và lập luận", Points: model.MustScore("2.00")},
			{Key: prefix + "-result", Description: "Tính toán chính xác và kết luận đầy đủ", Points: model.MustScore("3.00")},
		}
	}
	essayQuestion := func(key, topicKey, content string) historicalQuestionFixture {
		return historicalQuestionFixture{
			Key: key, QuestionType: "essay", Content: content, Points: model.MustScore("5.00"),
			TopicNodeID: nodes[topicKey], Rubrics: rubrics(key),
		}
	}
	objectiveExam := func(key, title string, ageDays int, questions ...historicalQuestionFixture) historicalExamFixture {
		return historicalExamFixture{
			Key: key, Title: title, GradeLevel: "7", Instructions: "Chọn một đáp án đúng cho mỗi câu.",
			Age: time.Duration(ageDays) * 24 * time.Hour, DurationMinutes: 25, Questions: questions,
		}
	}
	essayExam := func(key, title string, ageDays int, questions ...historicalQuestionFixture) historicalExamFixture {
		return historicalExamFixture{
			Key: key, Title: title, GradeLevel: "7", Instructions: "Trình bày đầy đủ các bước giải và kết luận.",
			Age: time.Duration(ageDays) * 24 * time.Hour, DurationMinutes: 45, Questions: questions,
		}
	}

	return []historicalExamFixture{
		objectiveExam("grade7-rational-basics", "Toán 7 - Số hữu tỉ và thứ tự", 10,
			objectiveQuestion("rational-identify", "l7-so-huu-ti-khai-niem", "Số nào sau đây là số hữu tỉ?", "a", "-3/5", "√2", "π", "√7"),
			objectiveQuestion("rational-op-add", "l7-phep-tinh-so-huu-ti", "Tính -1/3 + 5/6.", "b", "-1/2", "1/2", "2/3", "7/6"),
			objectiveQuestion("rational-order", "l7-so-huu-ti-khai-niem", "Số lớn nhất trong các số -0,5; -1/3; -0,75; -1 là số nào?", "b", "-0,5", "-1/3", "-0,75", "-1"),
			objectiveQuestion("rational-power", "l7-phep-tinh-so-huu-ti", "Giá trị của (-2/3)² là bao nhiêu?", "c", "-4/9", "-2/9", "4/9", "4/6")),
		objectiveExam("grade7-rational-operations", "Toán 7 - Phép tính số hữu tỉ", 18,
			objectiveQuestion("rational-multiply", "l7-phep-tinh-so-huu-ti", "Tính (-3/4) × (8/9).", "a", "-2/3", "2/3", "-3/2", "3/2"),
			objectiveQuestion("rational-divide", "l7-phep-tinh-so-huu-ti", "Tính 5/6 : (-10/3).", "d", "-25/18", "25/18", "1/4", "-1/4"),
			objectiveQuestion("rational-brackets", "l7-phep-tinh-so-huu-ti", "Tính 2 - (3/4 + 1/2).", "b", "1/4", "3/4", "5/4", "7/4"),
			objectiveQuestion("rational-absolute", "l7-so-huu-ti-khai-niem", "Khoảng cách từ -7/5 đến 0 trên trục số là bao nhiêu?", "c", "-7/5", "5/7", "7/5", "0")),
		objectiveExam("grade7-square-roots", "Toán 7 - Căn bậc hai và số thực", 26,
			objectiveQuestion("sqrt-81", "l7-can-bac-hai", "Căn bậc hai số học của 81 là bao nhiêu?", "b", "-9", "9", "±9", "8"),
			objectiveQuestion("irrational-identify", "l7-so-thuc", "Số nào là số vô tỉ?", "c", "0,25", "7/11", "√3", "-2"),
			objectiveQuestion("real-rounding", "l7-so-thuc", "Làm tròn 3,14159 đến hàng phần trăm.", "a", "3,14", "3,15", "3,1", "3,142"),
			objectiveQuestion("sqrt-estimate", "l7-can-bac-hai", "√50 nằm giữa hai số nguyên liên tiếp nào?", "d", "5 và 6", "6 và 7", "8 và 9", "7 và 8")),
		objectiveExam("grade7-proportions", "Toán 7 - Tỉ lệ thức", 34,
			objectiveQuestion("proportion-missing", "l7-ti-le-thuc", "Tìm x biết x/6 = 4/3.", "b", "6", "8", "9", "12"),
			objectiveQuestion("ratio-sequence", "l7-ti-le-thuc", "Nếu a/2 = b/3 và a + b = 20 thì a bằng bao nhiêu?", "a", "8", "10", "12", "15"),
			objectiveQuestion("proportion-property", "l7-ti-le-thuc", "Từ a/b = c/d suy ra đẳng thức nào?", "c", "a+b=c+d", "a-c=b-d", "ad=bc", "ac=bd"),
			objectiveQuestion("ratio-share", "l7-ti-le-thuc", "Chia 35 theo tỉ lệ 2:5, phần nhỏ bằng bao nhiêu?", "d", "7", "14", "20", "10")),
		objectiveExam("grade7-proportional-quantities", "Toán 7 - Đại lượng tỉ lệ", 42,
			objectiveQuestion("direct-proportion", "l7-dai-luong-ti-le", "3 kg gạo giá 54 nghìn đồng. 5 kg cùng loại giá bao nhiêu?", "a", "90 nghìn", "72 nghìn", "108 nghìn", "81 nghìn"),
			objectiveQuestion("inverse-proportion", "l7-dai-luong-ti-le", "6 người làm xong việc trong 8 ngày. 12 người cùng năng suất cần bao nhiêu ngày?", "b", "2", "4", "6", "16"),
			objectiveQuestion("proportion-factor", "l7-dai-luong-ti-le", "y tỉ lệ thuận với x theo hệ số 3. Khi x=4 thì y bằng bao nhiêu?", "c", "7", "9", "12", "16"),
			objectiveQuestion("inverse-constant", "l7-dai-luong-ti-le", "x và y tỉ lệ nghịch, x=2 thì y=15. Khi x=5 thì y bằng bao nhiêu?", "d", "3", "5", "7,5", "6")),
		objectiveExam("grade7-algebraic-expressions", "Toán 7 - Biểu thức đại số", 50,
			objectiveQuestion("expression-value", "l7-bieu-thuc-dai-so", "Giá trị của 2x+3 tại x=4 là bao nhiêu?", "a", "11", "10", "8", "14"),
			objectiveQuestion("expression-term", "l7-bieu-thuc-dai-so", "Biểu thức nào là biểu thức đại số?", "b", "3+5", "2x-7", "12:4", "√16"),
			objectiveQuestion("expression-substitute", "l7-bieu-thuc-dai-so", "Giá trị của a²-b khi a=-3, b=4 là bao nhiêu?", "c", "-13", "-5", "5", "13"),
			objectiveQuestion("expression-simplify", "l7-bieu-thuc-dai-so", "Thu gọn 3x+2x-x.", "d", "6x", "5x", "3x", "4x")),
		objectiveExam("grade7-polynomials", "Toán 7 - Đa thức một biến", 58,
			objectiveQuestion("polynomial-degree", "l7-da-thuc-mot-bien", "Bậc của đa thức 3x⁴-2x+1 là bao nhiêu?", "a", "4", "3", "2", "1"),
			objectiveQuestion("polynomial-value", "l7-da-thuc-mot-bien", "Giá trị của P(x)=x²-1 tại x=3 là bao nhiêu?", "b", "6", "8", "9", "10"),
			objectiveQuestion("polynomial-root", "l7-da-thuc-mot-bien", "Nghiệm của đa thức P(x)=x-5 là số nào?", "c", "-5", "0", "5", "1"),
			objectiveQuestion("polynomial-add", "l7-da-thuc-mot-bien", "Tổng của (2x+1) và (3x-4) là gì?", "d", "5x+5", "x-3", "6x-4", "5x-3")),
		essayExam("grade7-rational-real-essay", "Toán 7 - Tự luận số hữu tỉ và số thực", 22,
			essayQuestion("essay-rational", "l7-phep-tinh-so-huu-ti", "Tính hợp lí biểu thức -3/4 + 5/6 - 1/12 và trình bày các bước."),
			essayQuestion("essay-real", "l7-so-thuc", "Ước lượng √20, làm tròn đến hàng phần trăm và giải thích kết quả.")),
		essayExam("grade7-proportion-essay", "Toán 7 - Tự luận tỉ lệ", 46,
			essayQuestion("essay-ratio", "l7-ti-le-thuc", "Chia 180 thành ba phần tỉ lệ với 2, 3 và 4."),
			essayQuestion("essay-proportional", "l7-dai-luong-ti-le", "Một đội 8 người hoàn thành công việc trong 15 ngày. Tính số ngày nếu đội có 12 người cùng năng suất.")),
		essayExam("grade7-algebra-essay", "Toán 7 - Tự luận đại số", 70,
			essayQuestion("essay-expression", "l7-bieu-thuc-dai-so", "Lập biểu thức tính chu vi hình chữ nhật có chiều dài x+3 và chiều rộng x-1, rồi tính tại x=5."),
			essayQuestion("essay-polynomial", "l7-da-thuc-mot-bien", "Cho P(x)=2x²-3x+1 và Q(x)=x²+x-4. Tính P(x)+Q(x) và giá trị tại x=2.")),
	}
}

func deriveHistoricalOutcome(exam historicalExamFixture, studentIndex int) historicalOutcome {
	studentIndex = normalizedStudentIndex(studentIndex)
	outcome := historicalOutcome{Questions: make([]historicalResult, 0, len(exam.Questions)), Total: model.MustScore("0.00")}
	objectiveCorrect := profileCorrectCount(len(exam.Questions), studentIndex)
	objectiveOffset := stableResultOffset(exam.Key, len(exam.Questions))
	rubricCount := 0
	for _, question := range exam.Questions {
		rubricCount += len(question.Rubrics)
	}
	rubricCorrect := profileCorrectCount(rubricCount, studentIndex)
	rubricOffset := stableResultOffset(exam.Key+"-rubric", rubricCount)
	rubricPosition := 0
	for questionIndex, question := range exam.Questions {
		result := historicalResult{Reviewed: true, AwardedPoints: model.MustScore("0.00")}
		if question.QuestionType == "single_choice" {
			rank := (questionIndex + objectiveOffset) % len(exam.Questions)
			result.Status = model.ScoringResultIncorrect
			if rank < objectiveCorrect {
				result.Status = model.ScoringResultCorrect
			} else if studentIndex == 2 && rank == objectiveCorrect {
				result.Status = model.ScoringResultUnanswered
			}
			if result.Status == model.ScoringResultCorrect {
				result.AwardedPoints = question.Points
			}
		} else {
			result.Rubrics = make([]historicalResult, 0, len(question.Rubrics))
			allCorrect := true
			allUnanswered := true
			for _, rubric := range question.Rubrics {
				rank := (rubricPosition + rubricOffset) % rubricCount
				status := model.ScoringResultIncorrect
				if rank < rubricCorrect {
					status = model.ScoringResultCorrect
				} else if studentIndex == 2 && rank == rubricCorrect {
					status = model.ScoringResultUnanswered
				}
				rubricResult := historicalResult{Status: status, Reviewed: true, AwardedPoints: model.MustScore("0.00")}
				if status == model.ScoringResultCorrect {
					rubricResult.AwardedPoints = rubric.Points
				}
				allCorrect = allCorrect && status == model.ScoringResultCorrect
				allUnanswered = allUnanswered && status == model.ScoringResultUnanswered
				result.AwardedPoints.Decimal = result.AwardedPoints.Decimal.Add(rubricResult.AwardedPoints.Decimal)
				result.Rubrics = append(result.Rubrics, rubricResult)
				rubricPosition++
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
	return index % 3
}

func profileCorrectCount(total, studentIndex int) int {
	if total <= 0 {
		return 0
	}
	switch normalizedStudentIndex(studentIndex) {
	case 0:
		return total
	case 1:
		return max(1, total/2)
	default:
		return max(1, total/4)
	}
}

func stableResultOffset(key string, size int) int {
	if size <= 0 {
		return 0
	}
	total := 0
	for _, value := range []byte(key) {
		total += int(value)
	}
	return total % size
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
	targetNodes map[string]uuid.UUID,
	now time.Time,
) ([]model.Exam, int, error) {
	fixtures := historicalExamFixtures(config, targetNodes)
	exams := make([]model.Exam, 0, len(fixtures))
	approvedCount := 0

	for _, fixture := range fixtures {
		createdAt := now.Add(-fixture.Age)
		exam := model.Exam{
			ID: stableSyntheticUUID("exam", fixture.Key), Title: fixture.Title, Subject: config.Subject, GradeLevel: fixture.GradeLevel,
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
			if questionFixture.TopicNodeID == uuid.Nil {
				return nil, 0, fmt.Errorf("historical question %s has no Grade 7 topic node", questionFixture.Key)
			}
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
