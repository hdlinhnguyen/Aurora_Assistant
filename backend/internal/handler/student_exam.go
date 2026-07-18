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
