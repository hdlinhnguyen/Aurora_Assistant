package handler

import (
	"context"
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"

	"backend/internal/config"
	"backend/internal/model"
	"backend/internal/telemetry"
)

type FeynmanEventRequest struct {
	NodeID       string         `json:"nodeId"`
	Explanation  string         `json:"explanation"`
	ClarityScore int            `json:"clarityScore"`
	SubScores    map[string]int `json:"subScores"`
	VagueSpots   []string       `json:"vagueSpots"`
}

// SubmitFeynmanEvent nhận sự kiện "giảng lại bài" từ Tập Vở Feynman của học sinh.
// Lưu thành ChatSession mode "feynman" + Message mang FeynmanScore, nên dashboard giáo viên
// (GetTeacherDashboardData → feynmanStats) tự gộp thành "Chỉ số Feynman Clarity" không cần thêm analytics.
func (h *TutorHandler) SubmitFeynmanEvent(c fiber.Ctx) error {
	studentIDStr, _ := c.Locals("userID").(string)
	studentID, err := uuid.Parse(studentIDStr)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid user id"})
	}

	var req FeynmanEventRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}
	req.Explanation = strings.TrimSpace(req.Explanation)
	if req.Explanation == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "thiếu explanation"})
	}
	if req.ClarityScore < 0 || req.ClarityScore > 100 {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "clarityScore phải trong 0..100"})
	}

	// Chủ đề phiên = tên node nếu tra được (dashboard đọc dễ hơn UUID).
	topic := "Tập Vở Feynman"
	if nodeID, parseErr := uuid.Parse(req.NodeID); parseErr == nil {
		var node model.Node
		if findErr := config.DB.First(&node, "id = ?", nodeID).Error; findErr == nil && node.Name != "" {
			topic = node.Name
		}
	}

	// Gom các lần giảng cùng một bài vào một phiên để điểm trung bình phiên phản ánh tiến bộ.
	var session model.ChatSession
	err = config.DB.Where("student_id = ? AND mode = ? AND topic = ?", studentID, "feynman", topic).
		Order("created_at desc").First(&session).Error
	if err != nil {
		session = model.ChatSession{StudentID: studentID, Topic: topic, Mode: "feynman", Status: "active"}
		if createErr := config.DB.Create(&session).Error; createErr != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": createErr.Error()})
		}
	}

	meta, _ := json.Marshal(fiber.Map{
		"nodeId":     req.NodeID,
		"subScores":  req.SubScores,
		"vagueSpots": req.VagueSpots,
	})
	message := model.Message{
		SessionID:     session.ID,
		Sender:        "student",
		Content:       req.Explanation,
		IsCorrectStep: true,
		FeynmanScore:  req.ClarityScore,
		AxiomsJSON:    string(meta),
	}
	if err := config.DB.Create(&message).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	h.publishFeynmanTelemetry(studentID, req.NodeID, req.ClarityScore, req.Explanation)

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"ok":        true,
		"sessionId": session.ID,
		"messageId": message.ID,
	})
}

// Quyền riêng tư: chỉ phát điểm + độ dài lời giảng, không phát nội dung.
func (h *TutorHandler) publishFeynmanTelemetry(studentID uuid.UUID, nodeID string, clarityScore int, explanation string) {
	if h.telemetry == nil {
		return
	}
	event := telemetry.Event{
		EventID: uuid.NewString(), Name: "feynman_submitted", SchemaVersion: telemetry.CurrentSchemaVersion,
		OccurredAt: time.Now().UTC(), TopicID: nodeID, Source: "go_backend",
		ConsentState: "required", RetentionClass: "interaction",
		Properties: map[string]any{"clarity_score": clarityScore, "explanation_length": len(explanation)},
	}
	if _, err := h.telemetry.PublishActor(context.Background(), studentID, "student", event); err != nil {
		log.Printf("telemetry feynman event failed: %v", err)
	}
}
