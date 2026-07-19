package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"backend/internal/model"
)

type StudentExamHandler struct {
	db            *gorm.DB
	masteryRecalc masteryRecalculator // reuses same interface from tutor.go
}

func NewStudentExamHandler(db *gorm.DB, mr masteryRecalculator) *StudentExamHandler {
	return &StudentExamHandler{db: db, masteryRecalc: mr}
}

type StudentExamQuestionResponse struct {
	ID               uuid.UUID `json:"id"`
	ExamID           uuid.UUID `json:"examId"`
	QuestionType     string    `json:"questionType"`
	Content          string    `json:"content"`
	Points           string    `json:"points"`
	Position         int       `json:"position"`
	ChoicesJSON      string    `json:"choicesJson"`
	TopicNodeIDsJSON string    `json:"topicNodeIdsJson"`
}

type SubmitExamRequest struct {
	Answers map[string]string `json:"answers"` // QuestionID -> SelectedChoiceID
}

func (h *StudentExamHandler) GetStudentExams(c fiber.Ctx) error {
	userIDStr, ok := c.Locals("userID").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID học sinh không hợp lệ"})
	}

	subject := c.Query("subject")
	if subject == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Vui lòng cung cấp môn học"})
	}

	// 1. Tải danh sách đề thi lớp học (không phải đề chẩn đoán thích ứng)
	var classExams []model.Exam
	if err := h.db.Where("subject = ? AND status = ? AND title NOT LIKE ?", subject, "preparing_exam", "Đánh giá chẩn đoán thích ứng%").Order("created_at desc").Find(&classExams).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tải danh sách đề thi: " + err.Error()})
	}

	// 2. Tìm hoặc tự động sinh đề chẩn đoán thích ứng riêng của học sinh này
	var studentAdaptiveExam model.Exam
	hasAdaptive := true
	if err := h.db.Where("subject = ? AND status = ? AND title LIKE ? AND created_by = ?", subject, "preparing_exam", "Đánh giá chẩn đoán thích ứng%", userID).First(&studentAdaptiveExam).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			hasAdaptive = false
		} else {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Lỗi truy vấn đề chẩn đoán: " + err.Error()})
		}
	}

	if !hasAdaptive {
		// Tự động sinh đề chẩn đoán mẫu và chọn câu hỏi xuất phát từ Hub Node đầu tiên
		var firstQ model.Question
		var rootNode model.Node
		h.db.Where("subject = ? AND is_root = ?", subject, true).First(&rootNode)
		if rootNode.ID == uuid.Nil {
			h.db.Where("subject = ?", subject).First(&rootNode)
		}

		var err error
		if rootNode.ID != uuid.Nil {
			err = h.db.Where("node_id = ? AND question_type = ? AND options_json <> ''", rootNode.ID, "multiple_choice").Order("RANDOM()").First(&firstQ).Error
		}
		if err != nil || rootNode.ID == uuid.Nil {
			err = h.db.Joins("JOIN nodes ON nodes.id = questions.node_id").
				Where("nodes.subject = ? AND questions.question_type = ? AND questions.options_json <> ''", subject, "multiple_choice").
				Order("RANDOM()").First(&firstQ).Error
		}

		if err == nil {
			newExam := model.Exam{
				ID:              uuid.New(),
				Title:           "Đánh giá chẩn đoán thích ứng - " + subject,
				Subject:         subject,
				GradeLevel:      "Cả lớp",
				DurationMinutes: 45,
				Status:          "preparing_exam",
				CreatedBy:       userID, // Gắn với sinh viên hiện tại
				CreatedAt:       time.Now(),
				UpdatedAt:       time.Now(),
			}

			errTx := h.db.Transaction(func(tx *gorm.DB) error {
				if err := tx.Create(&newExam).Error; err != nil {
					return err
				}
				correctChoice := fmt.Sprintf("%d", firstQ.CorrectOption)
				examQ := model.ExamQuestion{
					ID:               uuid.New(),
					ExamID:           newExam.ID,
					SourceType:       "system",
					SourceQuestionID: &firstQ.ID,
					QuestionType:     firstQ.QuestionType,
					Content:          firstQ.Content,
					Points:           model.MustScore("1.00"),
					Position:         1,
					ChoicesJSON:      firstQ.OptionsJSON,
					CorrectChoiceID:  &correctChoice,
					TopicNodeIDsJSON: fmt.Sprintf("[%q]", firstQ.NodeID.String()),
					CreatedAt:        time.Now(),
					UpdatedAt:        time.Now(),
				}
				return tx.Create(&examQ).Error
			})

			if errTx == nil {
				studentAdaptiveExam = newExam
				hasAdaptive = true
			}
		}
	}

	// 3. Kết hợp kết quả đề thi
	exams := []model.Exam{}
	if hasAdaptive {
		exams = append(exams, studentAdaptiveExam)
	}
	exams = append(exams, classExams...)

	return c.JSON(exams)
}

func (h *StudentExamHandler) GetStudentExam(c fiber.Ctx) error {
	examIDStr := c.Params("examId")
	examID, err := uuid.Parse(examIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID đề thi không hợp lệ"})
	}

	var exam model.Exam
	if err := h.db.First(&exam, "id = ? AND status = ?", examID, "preparing_exam").Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Không tìm thấy đề thi đang hoạt động"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Lỗi truy vấn đề thi: " + err.Error()})
	}

	var questions []model.ExamQuestion
	if err := h.db.Where("exam_id = ?", examID).Order("position asc").Find(&questions).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tải danh sách câu hỏi: " + err.Error()})
	}

	response := make([]StudentExamQuestionResponse, len(questions))
	for i, q := range questions {
		response[i] = StudentExamQuestionResponse{
			ID:               q.ID,
			ExamID:           q.ExamID,
			QuestionType:     q.QuestionType,
			Content:          q.Content,
			Points:           q.Points.String(),
			Position:         q.Position,
			ChoicesJSON:      q.ChoicesJSON,
			TopicNodeIDsJSON: q.TopicNodeIDsJSON,
		}
	}

	return c.JSON(fiber.Map{
		"exam":      exam,
		"questions": response,
	})
}

func (h *StudentExamHandler) SubmitStudentExam(c fiber.Ctx) error {
	userIDStr, ok := c.Locals("userID").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	userID := uuid.MustParse(userIDStr)

	examIDStr := c.Params("examId")
	examID, err := uuid.Parse(examIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID đề thi không hợp lệ"})
	}

	var req SubmitExamRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu nộp bài không hợp lệ"})
	}

	var exam model.Exam
	if err := h.db.First(&exam, "id = ? AND status = ?", examID, "preparing_exam").Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Không tìm thấy đề thi đang hoạt động"})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Lỗi truy vấn đề thi: " + err.Error()})
	}

	// Kiểm tra xem học sinh đã có bài nộp cho đề thi này chưa
	var existingSubmission int64
	h.db.Model(&model.ScoringSubmission{}).
		Joins("JOIN grading_batches ON grading_batches.id = scoring_submissions.grading_batch_id").
		Where("grading_batches.exam_id = ? AND scoring_submissions.student_id = ?", examID, userID).
		Count(&existingSubmission)
	if existingSubmission > 0 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Bạn đã nộp bài thi này rồi"})
	}

	var questions []model.ExamQuestion
	if err := h.db.Where("exam_id = ?", examID).Find(&questions).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tải danh sách câu hỏi: " + err.Error()})
	}

	// Đánh giá điểm và tạo log hoạt động
	var totalScore float64
	var maxScore float64

	type resultEntry struct {
		questionID uuid.UUID
		correct    bool
		points     model.Score
		nodeIDs    []string
	}
	results := make([]resultEntry, 0, len(questions))

	for _, q := range questions {
		pointsVal, _ := q.Points.Float64()
		maxScore += pointsVal

		studentAnswer := req.Answers[q.ID.String()]
		isCorrect := false
		if q.CorrectChoiceID != nil && studentAnswer != "" && *q.CorrectChoiceID == studentAnswer {
			isCorrect = true
			totalScore += pointsVal
		}

		var nodeIDs []string
		if q.TopicNodeIDsJSON != "" {
			_ = json.Unmarshal([]byte(q.TopicNodeIDsJSON), &nodeIDs)
		}

		awardedPoints := model.MustScore("0.00")
		if isCorrect {
			awardedPoints = q.Points
		}

		results = append(results, resultEntry{
			questionID: q.ID,
			correct:    isCorrect,
			points:     awardedPoints,
			nodeIDs:    nodeIDs,
		})
	}

	totalScoreScore, _ := model.ParseScore(fmt.Sprintf("%.2f", totalScore))

	// Thực hiện lưu trữ vào DB qua Transaction
	err = h.db.Transaction(func(tx *gorm.DB) error {
		// Tạo GradingBatch
		snapshotID := uuid.New()
		if exam.LockedSnapshotID != nil {
			snapshotID = *exam.LockedSnapshotID
		} else {
			// Tạo snapshot ảo nếu chưa có snapshot cố định
			var count int64
			tx.Model(&model.ExamSnapshot{}).Where("exam_id = ?", examID).Count(&count)
			snapshot := model.ExamSnapshot{
				ID:           snapshotID,
				ExamID:       examID,
				ExamVersion:  exam.Version,
				Purpose:      "diagnostic",
				SnapshotJSON: "{}",
				CreatedAt:    time.Now(),
			}
			if err := tx.Create(&snapshot).Error; err != nil {
				return err
			}
			exam.LockedSnapshotID = &snapshotID
			tx.Save(&exam)
		}

		batch := model.GradingBatch{
			ID:                  uuid.New(),
			ExamID:              examID,
			ExamSnapshotID:      snapshotID,
			CreatedBy:           userID, // Có thể dùng ID học sinh làm người kích hoạt phiên tự động
			Status:              model.GradingBatchStatusCompleted,
			TotalSubmissions:    1,
			ApprovedSubmissions: 1,
			CreatedAt:           time.Now(),
			CompletedAt:         func(t time.Time) *time.Time { return &t }(time.Now()),
		}
		if err := tx.Create(&batch).Error; err != nil {
			return err
		}

		// Tạo ScoringSubmission
		submission := model.ScoringSubmission{
			ID:                       uuid.New(),
			GradingBatchID:           batch.ID,
			StudentID:                userID,
			Status:                   model.ScoringSubmissionStatusApproved,
			Version:                  1,
			AwardedPoints:            totalScoreScore,
			EffectiveApprovalVersion: 1,
			ApprovedBy:               &userID,
			ApprovedAt:               func(t time.Time) *time.Time { return &t }(time.Now()),
			CreatedAt:                time.Now(),
			UpdatedAt:                time.Now(),
		}
		if err := tx.Create(&submission).Error; err != nil {
			return err
		}

		// Tạo ScoringQuestionResult & ActivityLogs
		for _, res := range results {
			status := model.ScoringResultIncorrect
			if res.correct {
				status = model.ScoringResultCorrect
			}
			qResult := model.ScoringQuestionResult{
				SubmissionID:   submission.ID,
				ExamQuestionID: res.questionID,
				Status:         status,
				Reviewed:       true,
				AwardedPoints:  res.points,
				UpdatedBy:      userID,
				UpdatedAt:      time.Now(),
			}
			if err := tx.Create(&qResult).Error; err != nil {
				return err
			}

			// Ghi ActivityLog cho các node tương ứng câu hỏi
			logAction := "answer_incorrect"
			if res.correct {
				logAction = "answer_correct"
			}

			for _, nidStr := range res.nodeIDs {
				nid, err := uuid.Parse(nidStr)
				if err == nil {
					logEntry := model.ActivityLog{
						ID:        uuid.New(),
						StudentID: userID,
						Subject:   exam.Subject,
						NodeID:    nid,
						Action:    logAction,
						Detail:    fmt.Sprintf("Học sinh tự động nộp bài thi tổng quan '%s': câu hỏi ở node %s được ghi nhận %s", exam.Title, nidStr, status),
						CreatedAt: time.Now(),
					}
					if err := tx.Create(&logEntry).Error; err != nil {
						return err
					}
				}
			}
		}

		// Cấu hình StudentState để mở khóa Ôn tập
		var studentState model.StudentState
		err := tx.Where("student_id = ? AND subject = ?", userID, exam.Subject).First(&studentState).Error
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				// Tìm node gốc hoặc node bất kỳ
				var rootNode model.Node
				var rootNodeID uuid.UUID
				if err := tx.Where("subject = ? AND is_root = ?", exam.Subject, true).First(&rootNode).Error; err == nil {
					rootNodeID = rootNode.ID
				} else {
					var anyNode model.Node
					if err := tx.Where("subject = ?", exam.Subject).First(&anyNode).Error; err == nil {
						rootNodeID = anyNode.ID
					} else {
						rootNodeID = uuid.Nil
					}
				}

				studentState = model.StudentState{
					ID:                 uuid.New(),
					StudentID:          userID,
					Subject:            exam.Subject,
					InitialLevelNodeID: rootNodeID,
					CurrentLevelNodeID: rootNodeID,
					NeedsDiagnostic:    false, // Đã làm bài tổng quan -> Không cần diagnostic nữa
					CreatedAt:          time.Now(),
					UpdatedAt:          time.Now(),
				}
				if err := tx.Create(&studentState).Error; err != nil {
					return err
				}
			} else {
				return err
			}
		} else {
			studentState.NeedsDiagnostic = false
			studentState.UpdatedAt = time.Now()
			if err := tx.Save(&studentState).Error; err != nil {
				return err
			}
		}

		return nil
	})

	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Lỗi khi lưu kết quả bài thi: " + err.Error()})
	}

	return c.JSON(fiber.Map{
		"message":    "Nộp bài thi thành công",
		"totalScore": totalScoreScore.String(),
		"maxScore":   fmt.Sprintf("%.2f", maxScore),
	})
}

type SubmitAdaptiveAnswerRequest struct {
	QuestionID       string `json:"questionId"`
	SelectedChoiceID string `json:"selectedChoiceId"` // "0", "1", "2", "3"
}



func (h *StudentExamHandler) SubmitAdaptiveAnswer(c fiber.Ctx) error {
	userIDStr, ok := c.Locals("userID").(string)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Unauthorized"})
	}
	userID := uuid.MustParse(userIDStr)

	examIDStr := c.Params("examId")
	examID, err := uuid.Parse(examIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID đề thi không hợp lệ"})
	}

	var req SubmitAdaptiveAnswerRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}

	questionID, err := uuid.Parse(req.QuestionID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID câu hỏi không hợp lệ"})
	}

	// 1. Lấy thông tin câu hỏi hiện tại trong đề thi
	var examQ model.ExamQuestion
	if err := h.db.Where("exam_id = ? AND id = ?", examID, questionID).First(&examQ).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Không tìm thấy câu hỏi trong đề thi"})
	}

	// 2. Lấy thông tin đề thi
	var exam model.Exam
	if err := h.db.First(&exam, "id = ?", examID).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "Không tìm thấy đề thi"})
	}

	// 3. Chấm điểm phương án trả lời
	isCorrect := false
	if examQ.CorrectChoiceID != nil && req.SelectedChoiceID != "" && *examQ.CorrectChoiceID == req.SelectedChoiceID {
		isCorrect = true
	}

	// 4. Ghi nhận ActivityLog để BKT cập nhật
	var nodeIDStr string
	var nodeID uuid.UUID
	if examQ.TopicNodeIDsJSON != "" {
		var nodeIDs []string
		_ = json.Unmarshal([]byte(examQ.TopicNodeIDsJSON), &nodeIDs)
		if len(nodeIDs) > 0 {
			nodeIDStr = nodeIDs[0]
			nodeID, _ = uuid.Parse(nodeIDStr)
		}
	}

	action := "answer_incorrect"
	if isCorrect {
		action = "answer_correct"
	}

	if nodeID != uuid.Nil {
		evidenceQuestionID := examQ.ID
		difficulty := "medium"
		if examQ.SourceQuestionID != nil {
			evidenceQuestionID = *examQ.SourceQuestionID
			var sourceQuestion model.Question
			if err := h.db.Select("difficulty").First(&sourceQuestion, "id = ?", *examQ.SourceQuestionID).Error; err == nil &&
				sourceQuestion.Difficulty != "" {
				difficulty = sourceQuestion.Difficulty
			}
		}
		logEntry := model.ActivityLog{
			ID:        uuid.New(),
			StudentID: userID,
			Subject:   exam.Subject,
			NodeID:    nodeID,
			Action:    action,
			Detail: fmt.Sprintf(
				"[question_id=%s] [difficulty=%s] Phương án chọn: %s (Adaptive diagnostic)",
				evidenceQuestionID, difficulty, req.SelectedChoiceID,
			),
			CreatedAt: time.Now(),
		}
		if err := h.db.Create(&logEntry).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể lưu kết quả khảo sát"})
		}

		// Recalculate synchronously so the next profile request observes this answer.
		if h.masteryRecalc != nil {
			if _, err := h.masteryRecalc.RecalculateStudent(c.Context(), userID, exam.Subject); err != nil {
				log.Printf("[StudentExam] mastery recalc error after answer: %v", err)
			}
		}
	}

	// 5. Đếm số câu hỏi đã làm trong đề thi này
	var answeredCount int64
	h.db.Model(&model.ExamQuestion{}).Where("exam_id = ?", examID).Count(&answeredCount)

	// Kiểm tra điều kiện dừng (25 câu)
	if answeredCount >= 25 {
		// Hoàn thành chẩn đoán
		var studentState model.StudentState
		err = h.db.Where("student_id = ? AND subject = ?", userID, exam.Subject).First(&studentState).Error
		if err == nil {
			studentState.NeedsDiagnostic = false
			studentState.UpdatedAt = time.Now()
			h.db.Save(&studentState)
		}

		type NodeSummary struct {
			NodeName string `json:"nodeName"`
			Status   string `json:"status"` // "mastered" or "need_improvement"
		}
		var summaries []NodeSummary

		var logs []model.ActivityLog
		h.db.Where("student_id = ? AND subject = ? AND created_at >= ?", userID, exam.Subject, exam.CreatedAt).
			Find(&logs)

		if len(logs) > 0 {
			nodeIDs := make([]uuid.UUID, 0)
			nodeMap := make(map[uuid.UUID]bool)
			for _, log := range logs {
				if !nodeMap[log.NodeID] {
					nodeMap[log.NodeID] = true
					nodeIDs = append(nodeIDs, log.NodeID)
				}
			}

			var nodes []model.Node
			h.db.Where("id IN ?", nodeIDs).Find(&nodes)

			nodeNames := make(map[uuid.UUID]string)
			for _, n := range nodes {
				nodeNames[n.ID] = n.Name
			}

			nodeCorrectCount := make(map[string]int)
			nodeTotalCount := make(map[string]int)
			for _, log := range logs {
				name, ok := nodeNames[log.NodeID]
				if !ok || name == "" {
					continue
				}
				nodeTotalCount[name]++
				if log.Action == "answer_correct" {
					nodeCorrectCount[name]++
				}
			}

			for name, total := range nodeTotalCount {
				correct := nodeCorrectCount[name]
				status := "need_improvement"
				if float64(correct)/float64(total) >= 0.7 {
					status = "mastered"
				}
				summaries = append(summaries, NodeSummary{
					NodeName: name,
					Status:   status,
				})
			}
		}

		return c.JSON(fiber.Map{
			"isFinished": true,
			"isCorrect":  isCorrect,
			"summaries":  summaries,
		})
	}

	// 6. Lựa chọn câu hỏi tiếp theo dựa trên Thuật toán CAT 3 chặng, loại bỏ câu hỏi trùng lặp
	var nextQ model.Question
	foundNext := false

	var usedQuestionIDs []uuid.UUID
	h.db.Model(&model.ExamQuestion{}).
		Where("exam_id = ? AND source_question_id IS NOT NULL", examID).
		Pluck("source_question_id", &usedQuestionIDs)

	// CHẶNG 1: Routing (Khảo sát sơ bộ) - Từ câu 1 đến câu 7
	if answeredCount < 7 {
		var hubNodes []model.Node
		h.db.Where("subject = ? AND is_root = ?", exam.Subject, true).Find(&hubNodes)
		if len(hubNodes) == 0 {
			h.db.Where("subject = ?", exam.Subject).Limit(5).Find(&hubNodes)
		}
		hubIDs := make([]uuid.UUID, len(hubNodes))
		for idx, n := range hubNodes {
			hubIDs[idx] = n.ID
		}

		targetDiff := "medium"
		if isCorrect {
			targetDiff = "hard"
		} else {
			targetDiff = "easy"
		}

		query := h.db.Where("node_id IN ? AND difficulty = ? AND question_type = ? AND options_json <> ''", hubIDs, targetDiff, "multiple_choice")
		if len(usedQuestionIDs) > 0 {
			query = query.Where("id NOT IN ?", usedQuestionIDs)
		}
		err = query.Order("RANDOM()").First(&nextQ).Error
		if err == nil {
			foundNext = true
		}
	}

	// CHẶNG 2: Drilling & Backtracking (Đào sâu & Truy vết ngược) - Từ câu 8 đến 17
	if !foundNext && answeredCount >= 7 && answeredCount < 18 {
		var wrongLogs []model.ActivityLog
		h.db.Where("student_id = ? AND subject = ? AND action = ? AND created_at >= ?", userID, exam.Subject, "answer_incorrect", exam.CreatedAt).
			Order("created_at desc").Limit(3).Find(&wrongLogs)

		if len(wrongLogs) > 0 {
			wrongNodeIDs := make([]uuid.UUID, len(wrongLogs))
			for idx, wl := range wrongLogs {
				wrongNodeIDs[idx] = wl.NodeID
			}

			var parentNodes []model.Node
			h.db.Table("nodes").
				Select("nodes.*").
				Joins("join edges on nodes.id = edges.source_id").
				Where("edges.target_id IN ?", wrongNodeIDs).
				Find(&parentNodes)

			if len(parentNodes) > 0 {
				parentIDs := make([]uuid.UUID, len(parentNodes))
				for idx, pn := range parentNodes {
					parentIDs[idx] = pn.ID
				}
				query := h.db.Where("node_id IN ? AND question_type = ? AND options_json <> ''", parentIDs, "multiple_choice")
				if len(usedQuestionIDs) > 0 {
					query = query.Where("id NOT IN ?", usedQuestionIDs)
				}
				err = query.Order("RANDOM()").First(&nextQ).Error
				if err == nil {
					foundNext = true
				}
			}
		}
	}

	// CHẶNG 3: Cross-Verification (Xác thực chéo) - Từ câu 18 đến 24
	if !foundNext {
		query := h.db.Joins("JOIN nodes ON nodes.id = questions.node_id").
			Where("nodes.subject = ? AND questions.difficulty IN ? AND questions.question_type = ? AND questions.options_json <> ''", exam.Subject, []string{"easy", "medium"}, "multiple_choice")
		if len(usedQuestionIDs) > 0 {
			query = query.Where("questions.id NOT IN ?", usedQuestionIDs)
		}
		err = query.Order("RANDOM()").First(&nextQ).Error
		if err == nil {
			foundNext = true
		}
	}

	if !foundNext {
		query := h.db.Joins("JOIN nodes ON nodes.id = questions.node_id").
			Where("nodes.subject = ? AND questions.question_type = ? AND questions.options_json <> ''", exam.Subject, "multiple_choice")
		if len(usedQuestionIDs) > 0 {
			query = query.Where("questions.id NOT IN ?", usedQuestionIDs)
		}
		err = query.Order("RANDOM()").First(&nextQ).Error
		if err == nil {
			foundNext = true
		}
	}

	if !foundNext {
		var studentState model.StudentState
		err = h.db.Where("student_id = ? AND subject = ?", userID, exam.Subject).First(&studentState).Error
		if err == nil {
			studentState.NeedsDiagnostic = false
			studentState.UpdatedAt = time.Now()
			h.db.Save(&studentState)
		}
		return c.JSON(fiber.Map{
			"isFinished": true,
			"isCorrect":  isCorrect,
		})
	}

	// 7. Tạo bản ghi ExamQuestion tiếp theo cho đề thi thích ứng
	correctChoice := fmt.Sprintf("%d", nextQ.CorrectOption)
	nextPosition := int(answeredCount) + 1
	nextExamQ := model.ExamQuestion{
		ID:               uuid.New(),
		ExamID:           examID,
		SourceType:       "system",
		SourceQuestionID: &nextQ.ID,
		QuestionType:     nextQ.QuestionType,
		Content:          nextQ.Content,
		Points:           model.MustScore("1.00"),
		Position:         nextPosition,
		ChoicesJSON:      nextQ.OptionsJSON,
		CorrectChoiceID:  &correctChoice,
		TopicNodeIDsJSON: fmt.Sprintf("[%q]", nextQ.NodeID.String()),
		CreatedAt:        time.Now(),
		UpdatedAt:        time.Now(),
	}

	if err := h.db.Create(&nextExamQ).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể khởi tạo câu hỏi tiếp theo"})
	}

	return c.JSON(fiber.Map{
		"isFinished": false,
		"isCorrect":  isCorrect,
		"nextQuestion": fiber.Map{
			"id":               nextExamQ.ID.String(),
			"examId":           nextExamQ.ExamID.String(),
			"questionType":     nextExamQ.QuestionType,
			"content":          nextExamQ.Content,
			"points":           nextExamQ.Points.String(),
			"position":         nextExamQ.Position,
			"choicesJson":      nextExamQ.ChoicesJSON,
			"topicNodeIdsJson": nextExamQ.TopicNodeIDsJSON,
		},
	})
}

// ResetDiagnostic resets the student state back to needing diagnostic and deletes their diagnostic exam records.
func (h *StudentExamHandler) ResetDiagnostic(c fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID học sinh không hợp lệ"})
	}

	subject := c.Query("subject")
	if subject == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Vui lòng chọn môn học"})
	}

	// 1. Reset StudentState.NeedsDiagnostic = true
	var studentState model.StudentState
	err = h.db.Where("student_id = ? AND subject = ?", userID, subject).First(&studentState).Error
	if err == nil {
		studentState.NeedsDiagnostic = true
		studentState.UpdatedAt = time.Now()
		h.db.Save(&studentState)
	} else if errors.Is(err, gorm.ErrRecordNotFound) {
		studentState = model.StudentState{
			ID:              uuid.New(),
			StudentID:       userID,
			Subject:         subject,
			NeedsDiagnostic: true,
			UpdatedAt:       time.Now(),
		}
		h.db.Create(&studentState)
	}

	// 2. Find and delete adaptive exams for this subject
	var exams []model.Exam
	h.db.Where("subject = ? AND title LIKE ? AND created_by = ?", subject, "Đánh giá chẩn đoán thích ứng%", userID).Find(&exams)
	for _, ex := range exams {
		// Delete ExamQuestions
		h.db.Where("exam_id = ?", ex.ID).Delete(&model.ExamQuestion{})
		h.db.Delete(&ex)
	}

	// 3. Clear activity logs for this subject to reset BKT evidence
	h.db.Where("student_id = ? AND subject = ?", userID, subject).Delete(&model.ActivityLog{})

	// 4. Trigger BKT mastery recalculation immediately so BKT returns to initial state (e.g. 30%)
	if h.masteryRecalc != nil {
		_, _ = h.masteryRecalc.RecalculateStudent(context.Background(), userID, subject)
	}

	return c.JSON(fiber.Map{"success": true})
}
