package handler

import (
	"bytes"
	"fmt"
	"io"
	"mime/multipart"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"backend/internal/model"
	"backend/internal/service"
)

type TutorHandler struct {
	svc service.TutorService
}

func NewTutorHandler(svc service.TutorService) *TutorHandler {
	return &TutorHandler{svc: svc}
}

type CreateSessionRequest struct {
	Topic string `json:"topic"`
	Mode  string `json:"mode"`
}

type SendMessageRequest struct {
	Content string `json:"content"`
}

type SaveAxiomsRequest struct {
	AxiomsJSON string `json:"axiomsJson"`
}

func (h *TutorHandler) CreateSession(c fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID người dùng không hợp lệ"})
	}

	var req CreateSessionRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req.Topic = strings.TrimSpace(req.Topic)
	if req.Topic == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Vui lòng nhập chủ đề bài học"})
	}

	session, err := h.svc.CreateSession(userID, req.Topic, req.Mode)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tạo phiên chat"})
	}

	return c.Status(fiber.StatusCreated).JSON(session)
}

func (h *TutorHandler) GetSessions(c fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID người dùng không hợp lệ"})
	}

	sessions, err := h.svc.GetStudentSessions(userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tải danh sách phiên học"})
	}

	return c.JSON(sessions)
}

func (h *TutorHandler) GetMessages(c fiber.Ctx) error {
	sessionIDStr := c.Params("id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID phiên học không hợp lệ"})
	}

	messages, err := h.svc.GetSessionMessages(sessionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tải tin nhắn"})
	}

	return c.JSON(messages)
}

func (h *TutorHandler) SendMessage(c fiber.Ctx) error {
	sessionIDStr := c.Params("id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID phiên học không hợp lệ"})
	}

	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID người dùng không hợp lệ"})
	}

	var req SendMessageRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	req.Content = strings.TrimSpace(req.Content)
	if req.Content == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Tin nhắn trống"})
	}

	studentMsg, aiMsg, err := h.svc.SendMessage(sessionID, userID, req.Content)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"studentMessage": studentMsg,
		"aiMessage":      aiMsg,
	})
}

func (h *TutorHandler) SaveAxioms(c fiber.Ctx) error {
	sessionIDStr := c.Params("id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID phiên học không hợp lệ"})
	}

	var req SaveAxiomsRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Invalid request body"})
	}

	if err := h.svc.SaveSessionAxioms(sessionID, req.AxiomsJSON); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể lưu sơ đồ nguyên lý gốc"})
	}

	return c.JSON(fiber.Map{"status": "success"})
}

func (h *TutorHandler) GetAxioms(c fiber.Ctx) error {
	sessionIDStr := c.Params("id")
	sessionID, err := uuid.Parse(sessionIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID phiên học không hợp lệ"})
	}

	axiomsJSON, err := h.svc.GetSessionAxioms(sessionID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tải sơ đồ nguyên lý gốc"})
	}

	return c.JSON(fiber.Map{"axiomsJson": axiomsJSON})
}

func (h *TutorHandler) GetDashboard(c fiber.Ctx) error {
	// Guard: verify user is a teacher
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}

	role, ok := claims["role"].(string)
	if !ok || role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Bạn không có quyền truy cập bảng thông tin Giáo viên"})
	}

	gapStats, studentsNeedHelp, feynmanStats, err := h.svc.GetTeacherDashboardData()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Lỗi tải báo cáo"})
	}

	return c.JSON(fiber.Map{
		"gapStats":         gapStats,
		"studentsNeedHelp": studentsNeedHelp,
		"feynmanStats":     feynmanStats,
	})
}

// ─── Topic CRUD Handlers ─────────────────────────────────

type CreateTopicRequest struct {
	Name           string `json:"name"`
	Subject        string `json:"subject"`
	GradeLevel     string `json:"gradeLevel"`
	Modes          string `json:"modes"`
	AxiomsJSON     string `json:"axiomsJson"`
	SystemPrompt   string `json:"systemPrompt"`
	CommonMistakes string `json:"commonMistakes"`
	HintLevel      string `json:"hintLevel"`
	Published      bool   `json:"published"`
}

func (h *TutorHandler) CreateTopic(c fiber.Ctx) error {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	role, _ := claims["role"].(string)
	if role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Chỉ giáo viên mới có quyền tạo chủ đề"})
	}

	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID người dùng không hợp lệ"})
	}

	var req CreateTopicRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Tên chủ đề không được để trống"})
	}

	topic := &model.Topic{
		TeacherID:      userID,
		Name:           req.Name,
		Subject:        req.Subject,
		GradeLevel:     req.GradeLevel,
		Modes:          req.Modes,
		AxiomsJSON:     req.AxiomsJSON,
		SystemPrompt:   req.SystemPrompt,
		CommonMistakes: req.CommonMistakes,
		HintLevel:      req.HintLevel,
		Published:      req.Published,
	}

	if topic.Modes == "" {
		topic.Modes = "socratic,feynman"
	}
	if topic.HintLevel == "" {
		topic.HintLevel = "medium"
	}

	if err := h.svc.CreateTopic(topic); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tạo chủ đề"})
	}

	return c.Status(fiber.StatusCreated).JSON(topic)
}

func (h *TutorHandler) GetTopics(c fiber.Ctx) error {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	role, _ := claims["role"].(string)
	if role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Chỉ giáo viên mới có quyền xem chủ đề"})
	}

	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID người dùng không hợp lệ"})
	}

	topics, err := h.svc.GetTeacherTopics(userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể tải danh sách chủ đề"})
	}

	return c.JSON(topics)
}

func (h *TutorHandler) UpdateTopic(c fiber.Ctx) error {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	role, _ := claims["role"].(string)
	if role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Chỉ giáo viên mới có quyền cập nhật chủ đề"})
	}

	topicIDStr := c.Params("id")
	topicID, err := uuid.Parse(topicIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID chủ đề không hợp lệ"})
	}

	var updates map[string]interface{}
	if err := c.Bind().JSON(&updates); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}

	updates = toSnakeMap(updates)

	if err := h.svc.UpdateTopic(topicID, updates); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể cập nhật chủ đề"})
	}

	return c.JSON(fiber.Map{"status": "success"})
}

func (h *TutorHandler) DeleteTopic(c fiber.Ctx) error {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	role, _ := claims["role"].(string)
	if role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Chỉ giáo viên mới có quyền xóa chủ đề"})
	}

	topicIDStr := c.Params("id")
	topicID, err := uuid.Parse(topicIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID chủ đề không hợp lệ"})
	}

	if err := h.svc.DeleteTopic(topicID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "Không thể xóa chủ đề"})
	}

	return c.JSON(fiber.Map{"status": "success"})
}

func (h *TutorHandler) GetSubjects(c fiber.Ctx) error {
	subjects, err := h.svc.GetSubjects()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(subjects)
}

func (h *TutorHandler) GetTree(c fiber.Ctx) error {
	subjectRaw := c.Params("subject")
	subject, err := url.PathUnescape(subjectRaw)
	if err != nil {
		subject = subjectRaw
	}
	nodes, edges, err := h.svc.GetTree(subject)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{
		"nodes": nodes,
		"edges": edges,
	})
}

func (h *TutorHandler) CreateNode(c fiber.Ctx) error {
	var node model.Node
	if err := c.Bind().JSON(&node); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}
	subjectRaw := c.Params("subject")
	subject, err := url.PathUnescape(subjectRaw)
	if err == nil {
		node.Subject = subject
	} else {
		node.Subject = subjectRaw
	}
	if err := h.svc.CreateNode(&node); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(node)
}

func (h *TutorHandler) UpdateNode(c fiber.Ctx) error {
	idStr := c.Params("id")
	nodeID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID nút không hợp lệ"})
	}
	var updates map[string]interface{}
	if err := c.Bind().JSON(&updates); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}
	updates = toSnakeMap(updates)
	if err := h.svc.UpdateNode(nodeID, updates); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "success"})
}

func (h *TutorHandler) DeleteNode(c fiber.Ctx) error {
	idStr := c.Params("id")
	nodeID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID nút không hợp lệ"})
	}
	if err := h.svc.DeleteNode(nodeID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "success"})
}

func (h *TutorHandler) CreateEdge(c fiber.Ctx) error {
	var edge model.Edge
	if err := c.Bind().JSON(&edge); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}
	subjectRaw := c.Params("subject")
	subject, err := url.PathUnescape(subjectRaw)
	if err == nil {
		edge.Subject = subject
	} else {
		edge.Subject = subjectRaw
	}
	if err := h.svc.CreateEdge(&edge); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(edge)
}

func (h *TutorHandler) DeleteEdge(c fiber.Ctx) error {
	idStr := c.Params("id")
	edgeID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID liên kết không hợp lệ"})
	}
	if err := h.svc.DeleteEdge(edgeID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "success"})
}

func (h *TutorHandler) GetQuestions(c fiber.Ctx) error {
	nodeIdStr := c.Params("nodeId")
	nodeID, err := uuid.Parse(nodeIdStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID nút không hợp lệ"})
	}
	questions, err := h.svc.GetQuestions(nodeID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(questions)
}

func (h *TutorHandler) CreateQuestion(c fiber.Ctx) error {
	nodeIdStr := c.Params("nodeId")
	nodeID, err := uuid.Parse(nodeIdStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID nút không hợp lệ"})
	}
	var q model.Question
	if err := c.Bind().JSON(&q); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}
	q.NodeID = nodeID
	if err := h.svc.CreateQuestion(&q); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(fiber.StatusCreated).JSON(q)
}

func (h *TutorHandler) UpdateQuestion(c fiber.Ctx) error {
	idStr := c.Params("id")
	qID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID câu hỏi không hợp lệ"})
	}
	var updates map[string]interface{}
	if err := c.Bind().JSON(&updates); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}
	updates = toSnakeMap(updates)
	if err := h.svc.UpdateQuestion(qID, updates); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "success"})
}

func (h *TutorHandler) DeleteQuestion(c fiber.Ctx) error {
	idStr := c.Params("id")
	qID, err := uuid.Parse(idStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID câu hỏi không hợp lệ"})
	}
	if err := h.svc.DeleteQuestion(qID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"status": "success"})
}

func (h *TutorHandler) UploadTheory(c fiber.Ctx) error {
	nodeIdStr := c.Params("nodeId")
	nodeID, err := uuid.Parse(nodeIdStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID nút không hợp lệ"})
	}

	theory := c.FormValue("theory")
	
	fileHeader, err := c.FormFile("file")
	if err == nil && fileHeader != nil {
		if extracted, err := extractTextFromFile(fileHeader); err == nil {
			theory = extracted
		}
	}

	if theory == "" {
		var req struct {
			Theory string `json:"theory"`
		}
		if err := c.Bind().JSON(&req); err == nil {
			theory = req.Theory
		}
	}

	updates := map[string]interface{}{
		"theory": theory,
	}

	if err := h.svc.UpdateNode(nodeID, updates); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "success", "theory": theory})
}

func (h *TutorHandler) GetStudentState(c fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID người dùng không hợp lệ"})
	}
	subjectRaw := c.Params("subject")
	subject, err := url.PathUnescape(subjectRaw)
	if err != nil {
		subject = subjectRaw
	}
	state, err := h.svc.GetStudentState(userID, subject)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(state)
}

func (h *TutorHandler) StartSubjectNode(c fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID người dùng không hợp lệ"})
	}
	subjectRaw := c.Params("subject")
	subject, err := url.PathUnescape(subjectRaw)
	if err != nil {
		subject = subjectRaw
	}
	var req struct {
		NodeID string `json:"nodeId"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}
	nodeID, err := uuid.Parse(req.NodeID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID nút không hợp lệ"})
	}

	state, err := h.svc.StartSubjectNode(userID, subject, nodeID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(state)
}

func (h *TutorHandler) SubmitAnswer(c fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID người dùng không hợp lệ"})
	}
	nodeIdStr := c.Params("nodeId")
	nodeID, err := uuid.Parse(nodeIdStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID nút không hợp lệ"})
	}
	var req struct {
		QuestionID     string `json:"questionId"`
		SelectedOption int    `json:"selectedOption"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}
	qID, err := uuid.Parse(req.QuestionID)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID câu hỏi không hợp lệ"})
	}

	isCorrect, question, err := h.svc.SubmitAnswer(userID, nodeID, qID, req.SelectedOption)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{
		"isCorrect": isCorrect,
		"question":  question,
	})
}

func (h *TutorHandler) SubmitCantDo(c fiber.Ctx) error {
	userIDStr := c.Locals("userID").(string)
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID người dùng không hợp lệ"})
	}
	nodeIdStr := c.Params("nodeId")
	nodeID, err := uuid.Parse(nodeIdStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID nút không hợp lệ"})
	}

	res, err := h.svc.SubmitCantDo(userID, nodeID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(res)
}

func (h *TutorHandler) GetStudentsProgress(c fiber.Ctx) error {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	role, _ := claims["role"].(string)
	if role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Chỉ giáo viên mới có quyền xem tiến trình"})
	}

	progress, err := h.svc.GetStudentsProgress()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(progress)
}

func (h *TutorHandler) GetStudentSubjectProgress(c fiber.Ctx) error {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	role, _ := claims["role"].(string)
	if role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Chỉ giáo viên mới có quyền xem chi tiết tiến trình"})
	}

	studentIdStr := c.Params("studentId")
	studentID, err := uuid.Parse(studentIdStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID học sinh không hợp lệ"})
	}
	subjectRaw := c.Params("subject")
	subject, err := url.PathUnescape(subjectRaw)
	if err != nil {
		subject = subjectRaw
	}

	progress, err := h.svc.GetStudentSubjectProgress(studentID, subject)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(progress)
}

func (h *TutorHandler) ChatNodeTheory(c fiber.Ctx) error {
	nodeIdStr := c.Params("nodeId")
	nodeID, err := uuid.Parse(nodeIdStr)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "ID nút không hợp lệ"})
	}

	var req struct {
		Message string              `json:"message"`
		History []map[string]string `json:"history"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}

	reply, err := h.svc.ChatNodeTheory(nodeID, req.Message, req.History)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"reply": reply})
}

func (h *TutorHandler) ParseAndBuildTree(c fiber.Ctx) error {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	role, _ := claims["role"].(string)
	if role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Chỉ giáo viên mới có quyền dựng cây kiến thức"})
	}

	subjectRaw := c.Params("subject")
	subject, err := url.PathUnescape(subjectRaw)
	if err != nil {
		subject = subjectRaw
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Không tìm thấy file tải lên"})
	}

	fmt.Printf("[API] Nhận yêu cầu bóc tách tài liệu dựng cây cho môn: %s, File: %s (%d bytes)\n", subject, fileHeader.Filename, fileHeader.Size)
	fmt.Println("[API] Đang tiến hành trích xuất văn bản từ tệp tin...")
	fileContent, err := extractTextFromFile(fileHeader)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Không thể trích xuất văn bản từ file: %v", err)})
	}

	if strings.TrimSpace(fileContent) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Nội dung file rỗng"})
	}

	if err := h.svc.ParseAndBuildTree(subject, fileContent); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "success", "message": "Dựng cây kiến thức thành công!"})
}

func extractTextFromFile(fileHeader *multipart.FileHeader) (string, error) {
	tempDir := os.TempDir()
	if tempDir == "" {
		tempDir = "."
	}
	ext := filepath.Ext(fileHeader.Filename)
	tempFile := filepath.Join(tempDir, fmt.Sprintf("upload_%d%s", time.Now().UnixNano(), ext))

	out, err := os.Create(tempFile)
	if err != nil {
		return "", err
	}
	defer func() {
		out.Close()
		os.Remove(tempFile)
	}()

	src, err := fileHeader.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	if _, err = io.Copy(out, src); err != nil {
		return "", err
	}
	out.Close()

	scriptPath := filepath.Join("scratch", "extract_text.py")
	if _, err := os.Stat(scriptPath); os.IsNotExist(err) {
		scriptPath = `C:\Users\Admin\Documents\Aivial\Aurora_Assistant\scratch\extract_text.py`
	}

	cmd := exec.Command("python", scriptPath, tempFile)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err = cmd.Run()
	if err != nil {
		return "", fmt.Errorf("extraction failed: %v, stderr: %s", err, stderr.String())
	}

	return stdout.String(), nil
}

var camelRegexp = regexp.MustCompile("([a-z0-9])([A-Z])")

func toSnakeMap(m map[string]interface{}) map[string]interface{} {
	res := make(map[string]interface{})
	for k, v := range m {
		snakeKey := camelRegexp.ReplaceAllString(k, "${1}_${2}")
		snakeKey = strings.ToLower(snakeKey)
		res[snakeKey] = v
	}
	return res
}

func (h *TutorHandler) ExtractText(c fiber.Ctx) error {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	role, _ := claims["role"].(string)
	if role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Chỉ giáo viên mới có quyền trích xuất tài liệu"})
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Không tìm thấy file tải lên"})
	}

	fileContent, err := extractTextFromFile(fileHeader)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": fmt.Sprintf("Không thể trích xuất văn bản từ file: %v", err)})
	}

	if strings.TrimSpace(fileContent) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Nội dung file rỗng"})
	}

	return c.JSON(fiber.Map{"status": "success", "content": fileContent})
}

func (h *TutorHandler) ParseChunk(c fiber.Ctx) error {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	role, _ := claims["role"].(string)
	if role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Chỉ giáo viên mới có quyền bóc tách kiến thức"})
	}

	var req struct {
		Chunk string `json:"chunk"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Yêu cầu không hợp lệ"})
	}

	if strings.TrimSpace(req.Chunk) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Đoạn văn bản không được để trống"})
	}

	graph, err := h.svc.ParseChunk(req.Chunk)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "success", "graph": graph})
}

func (h *TutorHandler) SaveTree(c fiber.Ctx) error {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	role, _ := claims["role"].(string)
	if role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Chỉ giáo viên mới có quyền lưu cây kiến thức"})
	}

	subjectRaw := c.Params("subject")
	subject, err := url.PathUnescape(subjectRaw)
	if err != nil {
		subject = subjectRaw
	}

	var req service.ParsedGraph
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu cây không hợp lệ"})
	}

	if err := h.svc.SaveTree(subject, req); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "success", "message": "Lưu cây kiến thức thành công!"})
}

func (h *TutorHandler) DeleteSubject(c fiber.Ctx) error {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	role, _ := claims["role"].(string)
	if role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Chỉ giáo viên mới có quyền xóa môn học"})
	}

	subjectRaw := c.Params("subject")
	subject, err := url.PathUnescape(subjectRaw)
	if err != nil {
		subject = subjectRaw
	}

	if err := h.svc.DeleteSubject(subject); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "success", "message": "Xóa môn học thành công!"})
}

func (h *TutorHandler) RenameSubject(c fiber.Ctx) error {
	token, ok := c.Locals("user").(*jwt.Token)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "Xác thực không hợp lệ"})
	}
	role, _ := claims["role"].(string)
	if role != "teacher" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Chỉ giáo viên mới có quyền đổi tên môn học"})
	}

	subjectRaw := c.Params("subject")
	oldName, err := url.PathUnescape(subjectRaw)
	if err != nil {
		oldName = subjectRaw
	}

	var req struct {
		NewName string `json:"newName"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Dữ liệu không hợp lệ"})
	}
	req.NewName = strings.TrimSpace(req.NewName)
	if req.NewName == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "Tên môn mới không được để trống"})
	}

	if err := h.svc.RenameSubject(oldName, req.NewName); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": err.Error()})
	}

	return c.JSON(fiber.Map{"status": "success", "message": "Đổi tên môn học thành công!"})
}



