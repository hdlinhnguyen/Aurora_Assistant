package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"backend/internal/model"
)

type StudentExamHandler struct {
	db *gorm.DB
}

func NewStudentExamHandler(db *gorm.DB) *StudentExamHandler {
	return &StudentExamHandler{db: db}
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
	subject := c.Query("subject")
	if subject == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Vui lòng cung cấp môn học"})
	}

	var exams []model.Exam
	if err := h.db.Where("subject = ? AND status = ?", subject, "preparing_exam").Order("created_at desc").Find(&exams).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tải danh sách đề thi: " + err.Error()})
	}

	if len(exams) == 0 {
		// Tự động sinh đề chẩn đoán mẫu và chọn câu hỏi xuất phát từ Hub Node đầu tiên
		var firstQ model.Question
		var rootNode model.Node
		h.db.Where("subject = ? AND is_root = ?", subject, true).First(&rootNode)
		if rootNode.ID == uuid.Nil {
			h.db.Where("subject = ?", subject).First(&rootNode)
		}

		var err error
		if rootNode.ID != uuid.Nil {
			err = h.db.Where("node_id = ?", rootNode.ID).Order("RANDOM()").First(&firstQ).Error
		}
		if err != nil || rootNode.ID == uuid.Nil {
			err = h.db.Joins("JOIN nodes ON nodes.id = questions.node_id").
				Where("nodes.subject = ?", subject).
				Order("RANDOM()").First(&firstQ).Error
		}

		if err == nil {
			var creator model.User
			if err := h.db.Where("role = ?", "teacher").First(&creator).Error; err != nil {
				if err := h.db.Where("role = ?", "admin").First(&creator).Error; err != nil {
					creator.ID = uuid.Nil
				}
			}

			newExam := model.Exam{
				ID:              uuid.New(),
				Title:           "Đánh giá chẩn đoán thích ứng - " + subject,
				Subject:         subject,
				GradeLevel:      "Cả lớp",
				DurationMinutes: 45,
				Status:          "preparing_exam",
				CreatedBy:       creator.ID,
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
				exams = append(exams, newExam)
			}
		}
	}

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
		logEntry := model.ActivityLog{
			ID:        uuid.New(),
			StudentID: userID,
			Subject:   exam.Subject,
			NodeID:    nodeID,
			Action:    action,
			Detail:    fmt.Sprintf("Mã câu hỏi: %s. Phương án chọn: %s (Adaptive)", examQ.SourceQuestionID, req.SelectedChoiceID),
			CreatedAt: time.Now(),
		}
		h.db.Create(&logEntry)
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
		return c.JSON(fiber.Map{
			"isFinished": true,
			"isCorrect":  isCorrect,
		})
	}

	// 6. Lựa chọn câu hỏi tiếp theo dựa trên Thuật toán CAT 3 chặng
	var nextQ model.Question
	foundNext := false

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

		err = h.db.Where("node_id IN ? AND difficulty = ?", hubIDs, targetDiff).
			Order("RANDOM()").First(&nextQ).Error
		if err == nil {
			foundNext = true
		}
	}

	// CHẶNG 2: Drilling & Backtracking (Đào sâu & Truy vết ngược) - Từ câu 8 đến 17
	if !foundNext && answeredCount >= 7 && answeredCount < 18 {
		var wrongLogs []model.ActivityLog
		h.db.Where("student_id = ? AND subject = ? AND action = ?", userID, exam.Subject, "answer_incorrect").
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
				err = h.db.Where("node_id IN ?", parentIDs).Order("RANDOM()").First(&nextQ).Error
				if err == nil {
					foundNext = true
				}
			}
		}
	}

	// CHẶNG 3: Cross-Verification (Xác thực chéo) - Từ câu 18 đến 24
	if !foundNext {
		err = h.db.Joins("JOIN nodes ON nodes.id = questions.node_id").
			Where("nodes.subject = ? AND questions.difficulty IN ?", exam.Subject, []string{"easy", "medium"}).
			Order("RANDOM()").First(&nextQ).Error
		if err == nil {
			foundNext = true
		}
	}

	if !foundNext {
		err = h.db.Joins("JOIN nodes ON nodes.id = questions.node_id").
			Where("nodes.subject = ?", exam.Subject).
			Order("RANDOM()").First(&nextQ).Error
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

