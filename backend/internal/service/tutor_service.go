package service

import (
	"errors"
	"fmt"
	"time"

	"backend/internal/model"
	"backend/internal/telemetry"

	"github.com/google/uuid"
	"gorm.io/gorm"
)


type StudentStat struct {
	StudentID       string  `json:"studentId"`
	StudentName     string  `json:"studentName"`
	ExpectedMastery float64 `json:"expectedMastery"` // X-axis (Kỳ vọng)
	ActualMastery   float64 `json:"actualMastery"`   // Y-axis (Thực tế)
	TotalAnswers    int     `json:"totalAnswers"`
	CorrectAnswers  int     `json:"correctAnswers"`
	MasteryRate     float64 `json:"masteryRate"`
	IsOutlier       bool    `json:"isOutlier"`
}

type TutorService interface {
	CreateSession(studentID uuid.UUID, topic string, mode string) (*model.ChatSession, error)
	GetStudentSessions(studentID uuid.UUID) ([]model.ChatSession, error)
	GetSessionMessages(sessionID uuid.UUID) ([]model.Message, error)
	SendMessage(sessionID uuid.UUID, senderID uuid.UUID, content string) (*model.Message, *model.Message, error)
	SaveSessionAxioms(sessionID uuid.UUID, axiomsJSON string) error
	GetSessionAxioms(sessionID uuid.UUID) (string, error)
	GetTeacherDashboardData() ([]GapStat, []StudentNeedHelp, []FeynmanStudentStat, error)
	// Topic CRUD
	CreateTopic(topic *model.Topic) error
	GetTeacherTopics(teacherID uuid.UUID) ([]model.Topic, error)
	UpdateTopic(topicID uuid.UUID, updates map[string]interface{}) error
	DeleteTopic(topicID uuid.UUID) error
	GetSubjects() ([]string, error)
	DeleteSubject(subject string) error
	RenameSubject(oldName, newName string) error

	// Tree Graph
	GetTree(subject string) ([]model.Node, []model.Edge, error)
	CreateNode(node *model.Node) error
	UpdateNode(nodeID uuid.UUID, updates map[string]interface{}) error
	DeleteNode(nodeID uuid.UUID) error
	CreateEdge(edge *model.Edge) error
	DeleteEdge(edgeID uuid.UUID) error

	// Questions
	GetQuestions(nodeID uuid.UUID) ([]model.Question, error)
	GetSubjectQuestions(subject string) ([]model.Question, error)
	CreateQuestion(q *model.Question) error
	UpdateQuestion(qID uuid.UUID, updates map[string]interface{}) error
	DeleteQuestion(qID uuid.UUID) error

	// Student Progress & Logs
	GetStudentState(studentID uuid.UUID, subject string) (*model.StudentState, error)
	StartSubjectNode(studentID uuid.UUID, subject string, nodeID uuid.UUID) (*model.StudentState, error)
	SubmitAnswer(studentID uuid.UUID, nodeID uuid.UUID, questionID uuid.UUID, selectedOption int) (bool, *model.Question, error)
	SubmitCantDo(studentID uuid.UUID, nodeID uuid.UUID) (map[string]interface{}, error)
	LogActivity(studentID uuid.UUID, subject string, nodeID uuid.UUID, action string, detail string) error
	RequestReDiagnostic(studentID uuid.UUID, subject string) error
	AdaptiveDowngrade(studentID uuid.UUID, nodeID uuid.UUID) (map[string]interface{}, error)

	// Teacher Dashboard Progress
	GetStudentsProgress() ([]map[string]interface{}, error)
	GetStudentSubjectProgress(studentID uuid.UUID, subject string) (map[string]interface{}, error)
	GetMonitoringData(subject string) ([]StudentStat, error)
	GetClassInterventionGroups(subject string) (map[string]interface{}, error)

	// Socratic RAG Chat
	ChatNodeTheory(studentID uuid.UUID, nodeID uuid.UUID, message string, history []map[string]string, questionText string) (string, error)

	// Feynman
	ScoreFeynman(nodeID uuid.UUID, explanation string) (*FeynmanGrade, string, error)

	// Guardrail
	GetGuardrailEvents(severity string, limit int) ([]GuardrailEventView, error)
	MarkGuardrailEventHandled(eventID uuid.UUID) error
	ParseAndBuildTree(subject string, fileContent string) error
	ParseChunk(chunk string) (ParsedGraph, error)
	SaveTree(subject string, graph ParsedGraph) error
}

type tutorService struct {
	db        *gorm.DB
	aiSvc     AIService
	telemetry telemetry.ActorPublisher
}

type TutorOption func(*tutorService)

func WithTelemetryPublisher(publisher telemetry.ActorPublisher) TutorOption {
	return func(service *tutorService) {
		service.telemetry = publisher
	}
}

type GapStat struct {
	Gap   string `json:"gap"`
	Count int64  `json:"count"`
}

type StudentNeedHelp struct {
	Name           string `json:"name"`
	Email          string `json:"email"`
	IncorrectSteps int64  `json:"incorrectSteps"`
	SessionID      string `json:"sessionId" gorm:"column:session_id"`
}

type FeynmanStudentStat struct {
	Name         string  `json:"name"`
	Email        string  `json:"email"`
	AverageScore float64 `json:"averageScore"`
	SessionID    string  `json:"sessionId" gorm:"column:session_id"`
}

func NewTutorService(db *gorm.DB, aiSvc AIService, options ...TutorOption) TutorService {
	service := &tutorService{
		db:    db,
		aiSvc: aiSvc,
	}
	for _, option := range options {
		option(service)
	}
	return service
}


// GuardrailEventView là bản ghi sự kiện kèm tên học sinh cho dashboard giáo viên.
type GuardrailEventView struct {
	ID             uuid.UUID  `json:"id"`
	StudentID      uuid.UUID  `json:"studentId"`
	StudentName    string     `json:"studentName"`
	StudentEmail   string     `json:"studentEmail"`
	SessionID      *uuid.UUID `json:"sessionId"`
	Source         string     `json:"source"`
	Category       string     `json:"category"`
	Message        string     `json:"message"`
	Severity       string     `json:"severity"`
	Handled        bool       `json:"handled"`
	HandledBy      *uuid.UUID `json:"handledBy"`
	HandledAt      *time.Time `json:"handledAt"`
	CreatedAt      time.Time  `json:"createdAt"`
}

func (s *tutorService) CreateSession(studentID uuid.UUID, topic string, mode string) (*model.ChatSession, error) {
	if mode == "" {
		mode = "socratic"
	}
	session := &model.ChatSession{
		ID:        uuid.New(),
		StudentID: studentID,
		Topic:     topic,
		Status:    "active",
		Mode:      mode,
	}

	if err := s.db.Create(session).Error; err != nil {
		return nil, err
	}

	var welcomeContent string
	if mode == "feynman" {
		welcomeContent = "Em chào thầy/cô ạ! Em tên là Bi. Em đang muốn học về chủ đề: " + topic + ". Thầy/cô giải thích thật dễ hiểu cho em nhé!"
	} else {
		welcomeContent = "Chào em! Thầy là Aurora Socratic Tutor. Hôm nay chúng ta sẽ thảo luận về: " + topic + ". Hãy đưa ra bài tập hoặc câu hỏi của em để bắt đầu nhé!"
	}

	welcomeMsg := &model.Message{
		ID:            uuid.New(),
		SessionID:     session.ID,
		Sender:        "ai",
		Content:       welcomeContent,
		DetectedGap:   "",
		IsCorrectStep: true,
		CreatedAt:     time.Now(),
	}
	s.db.Create(welcomeMsg)

	return session, nil
}

func (s *tutorService) GetStudentSessions(studentID uuid.UUID) ([]model.ChatSession, error) {
	var sessions []model.ChatSession
	err := s.db.Where("student_id = ?", studentID).Order("created_at desc").Find(&sessions).Error
	return sessions, err
}

func (s *tutorService) GetSessionMessages(sessionID uuid.UUID) ([]model.Message, error) {
	var messages []model.Message
	err := s.db.Where("session_id = ?", sessionID).Order("created_at asc").Find(&messages).Error
	return messages, err
}

func (s *tutorService) SendMessage(sessionID uuid.UUID, senderID uuid.UUID, content string) (*model.Message, *model.Message, error) {
	var session model.ChatSession
	if err := s.db.Where("id = ?", sessionID).First(&session).Error; err != nil {
		return nil, nil, errors.New("chat session not found")
	}

	if session.StudentID != senderID {
		return nil, nil, errors.New("unauthorized session access")
	}

	studentMsg := &model.Message{
		ID:            uuid.New(),
		SessionID:     sessionID,
		Sender:        "student",
		Content:       content,
		DetectedGap:   "",
		IsCorrectStep: true,
		CreatedAt:     time.Now(),
	}

	if err := s.db.Create(studentMsg).Error; err != nil {
		return nil, nil, err
	}

	// ── Guardrail lớp 1: kiểm tra input TRƯỚC khi gọi LLM ──
	// Tin nhắn học sinh vẫn được lưu (giáo viên cần thấy trong Inspect Drawer),
	// nhưng không gửi sang LLM; trả lời bằng kịch bản an toàn và ghi sự kiện.
	if verdict := CheckStudentInput(content); verdict != nil {
		s.logGuardrailEvent(senderID, &sessionID, "chat_input", verdict, content)
		safeMsg := &model.Message{
			ID:            uuid.New(),
			SessionID:     sessionID,
			Sender:        "ai",
			Content:       SafeResponse(verdict.Category, session.Mode),
			DetectedGap:   "",
			IsCorrectStep: true, // sự cố an toàn không phải tín hiệu đánh giá kiến thức
			FeynmanScore:  0,
			CreatedAt:     time.Now(),
		}
		if err := s.db.Create(safeMsg).Error; err != nil {
			return studentMsg, nil, err
		}
		return studentMsg, safeMsg, nil
	}

	var history []model.Message
	s.db.Where("session_id = ?", sessionID).Order("created_at asc").Find(&history)

	aiText, detectedGap, isCorrectStep, feynmanScore, safetyFlag, err := s.aiSvc.GenerateResponse(history, session.Topic, session.Mode)
	if err != nil {
		aiText = "Xin lỗi em, thầy gặp chút sự cố mạng khi tải câu hỏi tiếp theo. Em hãy thử gửi lại tin nhắn nhé."
		isCorrectStep = true
		feynmanScore = 0
		safetyFlag = ""
	}

	// ── Guardrail lớp 2: LLM tự gắn cờ trường hợp regex bỏ sót ──
	// Ghi sự kiện cho giáo viên; giữ nguyên response_message vì LLM đã được
	// hướng dẫn tự trả lời an toàn đúng nhân vật, nhưng loại tín hiệu đánh giá
	// (gap/score) để không làm nhiễu thống kê.
	if verdict := MapSafetyFlag(safetyFlag); verdict != nil {
		s.logGuardrailEvent(senderID, &sessionID, "chat_output", verdict, content)
		detectedGap = ""
		isCorrectStep = true
		feynmanScore = 0
		if verdict.Severity == "high" {
			// Khủng hoảng: dùng kịch bản chuẩn thay vì để LLM tùy biến
			aiText = SafeResponse(verdict.Category, session.Mode)
		}
	}

	aiMsg := &model.Message{
		ID:            uuid.New(),
		SessionID:     sessionID,
		Sender:        "ai",
		Content:       aiText,
		DetectedGap:   detectedGap,
		IsCorrectStep: isCorrectStep,
		FeynmanScore:  feynmanScore,
		CreatedAt:     time.Now(),
	}

	if err := s.db.Create(aiMsg).Error; err != nil {
		return studentMsg, nil, err
	}

	return studentMsg, aiMsg, nil
}

func (s *tutorService) SaveSessionAxioms(sessionID uuid.UUID, axiomsJSON string) error {
	return s.db.Model(&model.ChatSession{}).Where("id = ?", sessionID).Update("axioms_json", axiomsJSON).Error
}

func (s *tutorService) GetSessionAxioms(sessionID uuid.UUID) (string, error) {
	var session model.ChatSession
	if err := s.db.Where("id = ?", sessionID).First(&session).Error; err != nil {
		return "", err
	}
	return session.AxiomsJSON, nil
}

func (s *tutorService) logGuardrailEvent(studentID uuid.UUID, sessionID *uuid.UUID, source string, v *GuardrailVerdict, content string) {
	event := &model.GuardrailEvent{
		ID:             uuid.New(),
		StudentID:      studentID,
		SessionID:      sessionID,
		Source:         source,
		Category:       v.Category,
		Severity:       v.Severity,
		ContentExcerpt: ExcerptForLog(content),
		MatchedPattern: v.Matched,
		CreatedAt:      time.Now(),
	}
	if err := s.db.Create(event).Error; err != nil {
		// Không chặn luồng chat vì lỗi ghi log — chỉ in cảnh báo server
		fmt.Printf("[GUARDRAIL WARNING] Không thể lưu guardrail event: %v\n", err)
	}
}

// ScoreFeynman chấm lời giảng bằng LLM, kèm tên node làm topic và theory làm căn cứ.
// Trả về (grade, topicName, error); error ErrAINotConfigured khi chưa có API key.
func (s *tutorService) ScoreFeynman(nodeID uuid.UUID, explanation string) (*FeynmanGrade, string, error) {
	topic := "chủ đề đang học"
	theory := ""
	if nodeID != uuid.Nil {
		var node model.Node
		if err := s.db.First(&node, "id = ?", nodeID).Error; err == nil {
			if node.Name != "" {
				topic = node.Name
			}
			theory = node.Theory
		}
	}
	grade, err := s.aiSvc.ScoreFeynmanExplanation(topic, theory, explanation)
	if err != nil {
		return nil, topic, err
	}
	return grade, topic, nil
}

func (s *tutorService) GetGuardrailEvents(severity string, limit int) ([]GuardrailEventView, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q := s.db.Table("guardrail_events").
		Select("guardrail_events.id, guardrail_events.student_id, users.name as student_name, users.email as student_email, guardrail_events.session_id, guardrail_events.source, guardrail_events.category, guardrail_events.severity, guardrail_events.content_excerpt as message, guardrail_events.handled, guardrail_events.created_at").
		Joins("join users on users.id = guardrail_events.student_id").
		Order("guardrail_events.created_at desc").
		Limit(limit)
	if severity != "" {
		q = q.Where("guardrail_events.severity = ?", severity)
	}

	var events []GuardrailEventView
	err := q.Scan(&events).Error
	return events, err
}

func (s *tutorService) MarkGuardrailEventHandled(eventID uuid.UUID) error {
	return s.db.Model(&model.GuardrailEvent{}).Where("id = ?", eventID).Update("handled", true).Error
}

