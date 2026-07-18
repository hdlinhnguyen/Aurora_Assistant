package handler

import (
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"backend/internal/config"
	"backend/internal/model"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
)

// GetAdaptiveQuestions orders questions around the student's current mastery band.
func (h *TutorHandler) GetAdaptiveQuestions(c fiber.Ctx) error {
	studentID, err := uuid.Parse(c.Locals("userID").(string))
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid user id"})
	}
	nodeID, err := uuid.Parse(c.Params("nodeId"))
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID nút không hợp lệ"})
	}
	questions, err := h.svc.GetQuestions(nodeID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	probability := 0.30
	var mastery model.StudentTopicMastery
	if config.DB.Where("student_id = ? AND topic_id = ?", studentID, nodeID).First(&mastery).Error == nil {
		probability = mastery.MasteryProbability
	}
	targetRank := 0
	if probability >= 0.70 {
		targetRank = 2
	} else if probability >= 0.40 {
		targetRank = 1
	}
	difficultyRank := func(difficulty string) int {
		switch strings.ToLower(strings.TrimSpace(difficulty)) {
		case "hard", "vd", "vdc", "vận dụng", "vận dụng cao":
			return 2
		case "medium", "th", "thông hiểu":
			return 1
		default:
			return 0
		}
	}
	sort.SliceStable(questions, func(i, j int) bool {
		left, right := difficultyRank(questions[i].Difficulty), difficultyRank(questions[j].Difficulty)
		leftDistance, rightDistance := left-targetRank, right-targetRank
		if leftDistance < 0 {
			leftDistance = -leftDistance
		}
		if rightDistance < 0 {
			rightDistance = -rightDistance
		}
		if leftDistance != rightDistance {
			return leftDistance < rightDistance
		}
		return left < right
	})
	return c.JSON(questions)
}

// GetStudentLearningPathLive calculates a self-serve path from fresh subject evidence.
func (h *TutorHandler) GetStudentLearningPathLive(c fiber.Ctx) error {
	studentIDRaw := c.Locals("userID").(string)
	studentID, err := uuid.Parse(studentIDRaw)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid user id"})
	}
	subject := strings.TrimSpace(c.Query("subject"))
	if subject == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "thiếu subject"})
	}
	var topicIDs []string
	if err := config.DB.Model(&model.Node{}).
		Where("subject = ? AND is_root = ?", subject, false).
		Order("id").Pluck("id", &topicIDs).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	if len(topicIDs) == 0 {
		return c.JSON(fiber.Map{"ordered_steps": []interface{}{}})
	}
	rawQuiz, err := learningPathEvidence([]string{studentID.String()}, subject)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	body, status, err := postLearningPathPython("/learning-path/live", CreatePathFastAPIBody{
		Request: CreatePathBodyRequest{
			ClassID: "live-" + studentIDRaw, StudentIDs: []string{studentIDRaw}, TargetTopicIDs: topicIDs,
			TeacherID: studentIDRaw, TargetMasteryThreshold: 0.80, MinimumConfidenceThreshold: 0.40,
		},
		RawQuiz: rawQuiz, RawPaper: []interface{}{}, AsOf: time.Now().UTC().Format(time.RFC3339),
	})
	if err != nil || status != http.StatusOK {
		return c.JSON(fiber.Map{"ordered_steps": []interface{}{}})
	}
	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return c.JSON(fiber.Map{"ordered_steps": []interface{}{}})
	}
	if c.Query("debug") == "1" {
		return c.JSON(fiber.Map{"nodeCount": len(topicIDs), "evidenceCount": len(rawQuiz), "studentId": studentIDRaw, "raw": result})
	}
	if paths, ok := result["paths"].(map[string]interface{}); ok {
		if path, ok := paths[studentIDRaw].(map[string]interface{}); ok {
			if steps, ok := path["ordered_steps"]; ok {
				return c.JSON(fiber.Map{"ordered_steps": steps})
			}
		}
	}
	return c.JSON(fiber.Map{"ordered_steps": []interface{}{}})
}
