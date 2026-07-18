package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"backend/internal/model"
	"backend/internal/telemetry"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
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
	ChatNodeTheory(studentID uuid.UUID, nodeID uuid.UUID, message string, history []map[string]string) (string, error)

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

func (s *tutorService) GetTeacherDashboardData() ([]GapStat, []StudentNeedHelp, []FeynmanStudentStat, error) {
	var gapStats []GapStat
	err := s.db.Model(&model.Message{}).
		Select("detected_gap as gap, count(*) as count").
		Where("detected_gap <> ''").
		Group("detected_gap").
		Order("count desc").
		Scan(&gapStats).Error
	if err != nil {
		return nil, nil, nil, err
	}

	var studentsNeedHelp []StudentNeedHelp
	err = s.db.Table("messages").
		Select("users.name as name, users.email as email, count(messages.id) as incorrect_steps, chat_sessions.id as session_id").
		Joins("join chat_sessions on messages.session_id = chat_sessions.id").
		Joins("join users on chat_sessions.student_id = users.id").
		Where("messages.is_correct_step = ?", false).
		Group("users.id, users.name, users.email, chat_sessions.id").
		Order("incorrect_steps desc").
		Limit(5).
		Scan(&studentsNeedHelp).Error
	if err != nil {
		return nil, nil, nil, err
	}

	var feynmanStats []FeynmanStudentStat
	err = s.db.Table("messages").
		Select("users.name as name, users.email as email, avg(messages.feynman_score) as average_score, chat_sessions.id as session_id").
		Joins("join chat_sessions on messages.session_id = chat_sessions.id").
		Joins("join users on chat_sessions.student_id = users.id").
		Where("chat_sessions.mode = ? AND messages.feynman_score > 0", "feynman").
		Group("users.id, users.name, users.email, chat_sessions.id").
		Order("average_score desc").
		Scan(&feynmanStats).Error

	return gapStats, studentsNeedHelp, feynmanStats, err
}

// ─── Topic CRUD ─────────────────────────────────────────

func (s *tutorService) CreateTopic(topic *model.Topic) error {
	topic.ID = uuid.New()
	return s.db.Create(topic).Error
}

func (s *tutorService) GetTeacherTopics(teacherID uuid.UUID) ([]model.Topic, error) {
	var topics []model.Topic
	err := s.db.Where("teacher_id = ?", teacherID).Order("created_at desc").Find(&topics).Error
	return topics, err
}

func (s *tutorService) UpdateTopic(topicID uuid.UUID, updates map[string]interface{}) error {
	return s.db.Model(&model.Topic{}).Where("id = ?", topicID).Updates(updates).Error
}

func (s *tutorService) DeleteTopic(topicID uuid.UUID) error {
	return s.db.Where("id = ?", topicID).Delete(&model.Topic{}).Error
}

func (s *tutorService) GetTree(subject string) ([]model.Node, []model.Edge, error) {
	var nodes []model.Node
	var edges []model.Edge
	if err := s.db.Where("subject = ?", subject).Order("created_at asc").Find(&nodes).Error; err != nil {
		return nil, nil, err
	}
	if err := s.db.Where("subject = ?", subject).Find(&edges).Error; err != nil {
		return nil, nil, err
	}
	return nodes, edges, nil
}

func (s *tutorService) CreateNode(node *model.Node) error {
	node.ID = uuid.New()
	node.CreatedAt = time.Now()
	node.UpdatedAt = time.Now()
	return s.db.Create(node).Error
}

func (s *tutorService) UpdateNode(nodeID uuid.UUID, updates map[string]interface{}) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var node model.Node
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&node, "id = ?", nodeID).Error; err != nil {
			return err
		}
		if subject, ok := updates["subject"]; ok && subject != nil {
			newSubject, ok := subject.(string)
			if !ok {
				return &DomainError{Code: "invalid_subject", Message: "Node subject must be a string."}
			}
			if newSubject != node.Subject {
				var sourceRefs, directRefs, rubricRefs int64
				if err := tx.Model(&model.Question{}).Where("node_id = ?", nodeID).Count(&sourceRefs).Error; err != nil {
					return err
				}
				if err := tx.Model(&model.QuestionTopicMapping{}).Where("node_id = ?", nodeID).Count(&directRefs).Error; err != nil {
					return err
				}
				if err := tx.Model(&model.QuestionRubricItemTopicMapping{}).Where("node_id = ?", nodeID).Count(&rubricRefs).Error; err != nil {
					return err
				}
				if sourceRefs > 0 || directRefs > 0 || rubricRefs > 0 {
					return &DomainError{
						Code:    "node_in_use",
						Message: "Node subject cannot change while the node is referenced by questions or tags.",
					}
				}
			}
		}
		updates["updated_at"] = time.Now()
		return tx.Model(&model.Node{}).Where("id = ?", nodeID).Updates(updates).Error
	})
}

func (s *tutorService) DeleteNode(nodeID uuid.UUID) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		var node model.Node
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			First(&node, "id = ?", nodeID).Error; err != nil {
			return err
		}
		var sourceRefs, directRefs, rubricRefs int64
		if err := tx.Model(&model.Question{}).Where("node_id = ?", nodeID).Count(&sourceRefs).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.QuestionTopicMapping{}).Where("node_id = ?", nodeID).Count(&directRefs).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.QuestionRubricItemTopicMapping{}).Where("node_id = ?", nodeID).Count(&rubricRefs).Error; err != nil {
			return err
		}
		if sourceRefs > 0 || directRefs > 0 || rubricRefs > 0 {
			return &DomainError{
				Code:    "node_in_use",
				Message: "Node cannot be deleted while it is referenced by questions or tags.",
			}
		}
		if err := tx.Where("source_id = ? OR target_id = ?", nodeID, nodeID).Delete(&model.Edge{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ?", nodeID).Delete(&model.Node{}).Error
	})
}

func (s *tutorService) CreateEdge(edge *model.Edge) error {
	edge.ID = uuid.New()
	edge.CreatedAt = time.Now()
	return s.db.Create(edge).Error
}

func (s *tutorService) DeleteEdge(edgeID uuid.UUID) error {
	return s.db.Where("id = ?", edgeID).Delete(&model.Edge{}).Error
}

func (s *tutorService) GetQuestions(nodeID uuid.UUID) ([]model.Question, error) {
	var questions []model.Question
	err := s.db.Where("node_id = ?", nodeID).Order("created_at asc").Find(&questions).Error
	return questions, err
}

func (s *tutorService) GetSubjectQuestions(subject string) ([]model.Question, error) {
	var questions []model.Question
	err := s.db.Table("questions").
		Select("questions.*").
		Joins("join nodes on questions.node_id = nodes.id").
		Where("nodes.subject = ? AND questions.deleted_at IS NULL", subject).
		Order("questions.created_at asc").
		Find(&questions).Error
	return questions, err
}

func (s *tutorService) CreateQuestion(q *model.Question) error {
	q.ID = uuid.New()
	q.CreatedAt = time.Now()
	q.UpdatedAt = time.Now()
	return s.db.Create(q).Error
}

func (s *tutorService) UpdateQuestion(qID uuid.UUID, updates map[string]interface{}) error {
	updates["updated_at"] = time.Now()
	return s.db.Model(&model.Question{}).Where("id = ?", qID).Updates(updates).Error
}

func (s *tutorService) DeleteQuestion(qID uuid.UUID) error {
	return s.db.Where("id = ?", qID).Delete(&model.Question{}).Error
}

func (s *tutorService) GetStudentState(studentID uuid.UUID, subject string) (*model.StudentState, error) {
	var state model.StudentState
	err := s.db.Where("student_id = ? AND subject = ?", studentID, subject).First(&state).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &state, nil
}

func (s *tutorService) StartSubjectNode(studentID uuid.UUID, subject string, nodeID uuid.UUID) (*model.StudentState, error) {
	var state model.StudentState
	err := s.db.Where("student_id = ? AND subject = ?", studentID, subject).First(&state).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			state = model.StudentState{
				ID:                 uuid.New(),
				StudentID:          studentID,
				Subject:            subject,
				InitialLevelNodeID: nodeID,
				CurrentLevelNodeID: nodeID,
				CreatedAt:          time.Now(),
				UpdatedAt:          time.Now(),
			}
			if err := s.db.Create(&state).Error; err != nil {
				return nil, err
			}
			s.LogActivity(studentID, subject, nodeID, "start_subject", "Chọn level ban đầu: "+nodeID.String())
			return &state, nil
		}
		return nil, err
	}
	return &state, nil
}

func (s *tutorService) SubmitAnswer(studentID uuid.UUID, nodeID uuid.UUID, questionID uuid.UUID, selectedOption int) (bool, *model.Question, error) {
	var q model.Question
	if err := s.db.Where("id = ?", questionID).First(&q).Error; err != nil {
		return false, nil, err
	}

	var node model.Node
	if err := s.db.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return false, nil, err
	}

	isCorrect := q.CorrectOption == selectedOption
	action := "answer_incorrect"
	detail := fmt.Sprintf("Trả lời câu hỏi '%s' (Độ khó: %s), chọn %d (Sai, Đáp án đúng: %d)", q.Content, q.Difficulty, selectedOption, q.CorrectOption)
	if isCorrect {
		action = "answer_correct"
		detail = fmt.Sprintf("Trả lời câu hỏi '%s' (Độ khó: %s), chọn %d (Đúng)", q.Content, q.Difficulty, selectedOption)

		var state model.StudentState
		err := s.db.Where("student_id = ? AND subject = ?", studentID, node.Subject).First(&state).Error
		if err == nil {
			state.CurrentLevelNodeID = nodeID
			state.UpdatedAt = time.Now()
			s.db.Save(&state)
		}

		// Success state propagation
		var parentEdges []model.Edge
		if err := s.db.Where("target_id = ? AND status = 'active'", nodeID).Find(&parentEdges).Error; err == nil {
			for _, edge := range parentEdges {
				s.LogActivity(studentID, node.Subject, edge.SourceID, "mastered", "Lan truyền trạng thái Đạt (Success Propagation)")
			}
		}
	} else {
		// First-Principle Diagnostics via Distractor Mapping
		if q.DistractorMappings != "" {
			var mappings map[string]string
			if err := json.Unmarshal([]byte(q.DistractorMappings), &mappings); err == nil {
				optionKey := fmt.Sprintf("%d", selectedOption)
				mappedNodeIDStr, hasMap := mappings[optionKey]
				if !hasMap {
					optionLetterKey := "option_" + string(rune('a'+selectedOption))
					mappedNodeIDStr, hasMap = mappings[optionLetterKey]
				}

				if hasMap && mappedNodeIDStr != "" {
					if mappedNodeID, err := uuid.Parse(mappedNodeIDStr); err == nil {
						s.LogActivity(studentID, node.Subject, mappedNodeID, "struggle", fmt.Sprintf("Chẩn đoán lỗi sai nền tảng (First-Principle) từ câu hỏi %s", q.ID))

						var state model.StudentState
						if err := s.db.Where("student_id = ? AND subject = ?", studentID, node.Subject).First(&state).Error; err == nil {
							state.CurrentLevelNodeID = mappedNodeID
							state.UpdatedAt = time.Now()
							s.db.Save(&state)
						}
						detail += fmt.Sprintf(" -> Chuyển chẩn đoán về chủ đề nền tảng: %s", mappedNodeIDStr)
					}
				}
			}
		}
	}

	s.LogActivity(studentID, node.Subject, nodeID, action, detail)
	s.publishAnswerTelemetry(studentID, nodeID, q, selectedOption, isCorrect)
	return isCorrect, &q, nil
}

func (s *tutorService) publishAnswerTelemetry(
	studentID, nodeID uuid.UUID,
	question model.Question,
	selectedOption int,
	isCorrect bool,
) {
	if s.telemetry == nil {
		return
	}
	now := time.Now().UTC()
	events := []telemetry.Event{
		{
			EventID: uuid.NewString(), Name: "question_answer_submitted", SchemaVersion: telemetry.CurrentSchemaVersion,
			OccurredAt: now, TopicID: nodeID.String(), Source: "go_backend", ConsentState: "required", RetentionClass: "interaction",
			Properties: map[string]any{
				"question_id": question.ID.String(), "selected_option": selectedOption,
				"active_time_ms": 0, "server_timing_available": false, "difficulty": question.Difficulty,
			},
		},
		{
			EventID: uuid.NewString(), Name: "question_graded", SchemaVersion: telemetry.CurrentSchemaVersion,
			OccurredAt: now, TopicID: nodeID.String(), Source: "go_backend", ConsentState: "required", RetentionClass: "interaction",
			Properties: map[string]any{
				"question_id": question.ID.String(), "is_correct": isCorrect, "difficulty": question.Difficulty,
			},
		},
	}
	for _, event := range events {
		if _, err := s.telemetry.PublishActor(context.Background(), studentID, "student", event); err != nil {
			log.Printf("telemetry answer event failed: %v", err)
		}
	}
}

func (s *tutorService) SubmitCantDo(studentID uuid.UUID, nodeID uuid.UUID) (map[string]interface{}, error) {
	var node model.Node
	if err := s.db.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return nil, err
	}

	s.LogActivity(studentID, node.Subject, nodeID, "click_cant_do", "Bấm 'Không làm được' tại nút")

	var parentNodes []model.Node
	err := s.db.Table("nodes").
		Select("nodes.*").
		Joins("join edges on nodes.id = edges.source_id").
		Where("edges.target_id = ?", nodeID).
		Find(&parentNodes).Error

	parentsList := []map[string]interface{}{}
	if err == nil {
		for _, p := range parentNodes {
			parentsList = append(parentsList, map[string]interface{}{
				"id":   p.ID,
				"name": p.Name,
			})
		}
	}

	return map[string]interface{}{
		"nodeId":   nodeID,
		"parents":  parentsList,
		"hasEasyQ": true,
	}, nil
}

func (s *tutorService) LogActivity(studentID uuid.UUID, subject string, nodeID uuid.UUID, action string, detail string) error {
	log := &model.ActivityLog{
		ID:        uuid.New(),
		StudentID: studentID,
		Subject:   subject,
		NodeID:    nodeID,
		Action:    action,
		Detail:    detail,
		CreatedAt: time.Now(),
	}
	return s.db.Create(log).Error
}

func (s *tutorService) RequestReDiagnostic(studentID uuid.UUID, subject string) error {
	var state model.StudentState
	err := s.db.Where("student_id = ? AND subject = ?", studentID, subject).First(&state).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			state = model.StudentState{
				ID:              uuid.New(),
				StudentID:       studentID,
				Subject:         subject,
				NeedsDiagnostic: true,
				CreatedAt:       time.Now(),
				UpdatedAt:       time.Now(),
			}
			return s.db.Create(&state).Error
		}
		return err
	}
	state.NeedsDiagnostic = true
	state.InitialLevelNodeID = uuid.Nil
	state.CurrentLevelNodeID = uuid.Nil
	state.UpdatedAt = time.Now()

	// Delete previous activity logs to reset progress
	s.db.Where("student_id = ? AND subject = ?", studentID, subject).Delete(&model.ActivityLog{})

	return s.db.Save(&state).Error
}

func (s *tutorService) AdaptiveDowngrade(studentID uuid.UUID, nodeID uuid.UUID) (map[string]interface{}, error) {
	var node model.Node
	if err := s.db.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return nil, err
	}

	// 1. Log high-severity Warning Gap for teacher alerting
	warningDetail := fmt.Sprintf("CẢNH BÁO: Học sinh hổng kiến thức nghiêm trọng tại node '%s'. Đã dùng hết gợi ý nhưng không vượt qua được thử thách.", node.Name)
	s.LogActivity(studentID, node.Subject, nodeID, "warning_gap", warningDetail)

	// 2. Find parent/prerequisite nodes to downgrade to
	var parentNodes []model.Node
	err := s.db.Table("nodes").
		Select("nodes.*").
		Joins("join edges on nodes.id = edges.source_id").
		Where("edges.target_id = ?", nodeID).
		Find(&parentNodes).Error

	var targetNode model.Node
	hasParent := false
	if err == nil && len(parentNodes) > 0 {
		targetNode = parentNodes[0]
		hasParent = true
	}

	// 3. Update Student State current level
	var state model.StudentState
	err = s.db.Where("student_id = ? AND subject = ?", studentID, node.Subject).First(&state).Error
	if err == nil {
		if hasParent {
			state.CurrentLevelNodeID = targetNode.ID
		}
		state.NeedsDiagnostic = false
		state.UpdatedAt = time.Now()
		s.db.Save(&state)
	}

	res := map[string]interface{}{
		"hasParent": hasParent,
	}
	if hasParent {
		res["parentId"] = targetNode.ID.String()
		res["parentName"] = targetNode.Name
	}
	return res, nil
}

func (s *tutorService) GetStudentsProgress() ([]map[string]interface{}, error) {
	var results []map[string]interface{}

	// 1. Get all unique subjects
	subjects, err := s.GetSubjects()
	if err != nil {
		return nil, err
	}
	if len(subjects) == 0 {
		subjects = []string{"Toán đại số"}
	}

	// 2. Get all users with student role
	var students []model.User
	if err := s.db.Where("role = ?", "student").Order("name asc").Find(&students).Error; err != nil {
		return nil, err
	}

	// 3. Preload all node names to avoid N+1 queries
	type nodeNameRow struct {
		ID   uuid.UUID
		Name string
	}
	var allNodes []nodeNameRow
	s.db.Table("nodes").Select("id, name").Find(&allNodes)
	nodeNameMap := map[uuid.UUID]string{}
	for _, n := range allNodes {
		nodeNameMap[n.ID] = n.Name
	}

	// 4. Preload activity log aggregation: per student+subject
	type logAgg struct {
		StudentID      uuid.UUID `gorm:"column:student_id"`
		Subject        string    `gorm:"column:subject"`
		TotalAnswers   int       `gorm:"column:total_answers"`
		CorrectAnswers int       `gorm:"column:correct_answers"`
		LastActiveAt   time.Time `gorm:"column:last_active_at"`
	}
	var logAggs []logAgg
	s.db.Table("activity_logs").
		Select(`student_id, subject,
			COUNT(CASE WHEN action IN ('answer_correct','answer_incorrect') THEN 1 END) as total_answers,
			COUNT(CASE WHEN action = 'answer_correct' THEN 1 END) as correct_answers,
			MAX(created_at) as last_active_at`).
		Group("student_id, subject").
		Find(&logAggs)

	// Build lookup map: studentID:subject -> logAgg
	logAggMap := map[string]logAgg{}
	for _, la := range logAggs {
		key := la.StudentID.String() + ":" + la.Subject
		logAggMap[key] = la
	}

	// 5. For each student and subject, obtain status + aggregated metrics
	for _, student := range students {
		for _, subject := range subjects {
			var state model.StudentState
			stateErr := s.db.Where("student_id = ? AND subject = ?", student.ID, subject).First(&state).Error

			var initialNodeName, currentNodeName string
			var initialNodeId, currentNodeId interface{}
			var updatedAtVal time.Time

			if stateErr == nil {
				initialNodeId = state.InitialLevelNodeID
				currentNodeId = state.CurrentLevelNodeID
				updatedAtVal = state.UpdatedAt

				if state.InitialLevelNodeID != uuid.Nil {
					initialNodeName = nodeNameMap[state.InitialLevelNodeID]
					if initialNodeName == "" {
						initialNodeName = "Chưa chẩn đoán/Chưa học"
					}
				} else {
					initialNodeName = "Chưa chẩn đoán/Chưa học"
				}

				if state.CurrentLevelNodeID != uuid.Nil {
					currentNodeName = nodeNameMap[state.CurrentLevelNodeID]
					if currentNodeName == "" {
						currentNodeName = "Chưa học"
					}
				} else {
					currentNodeName = "Chưa học"
				}
			} else {
				initialNodeId = nil
				currentNodeId = nil
				initialNodeName = "Chưa chẩn đoán/Chưa học"
				currentNodeName = "Chưa học"
				updatedAtVal = student.CreatedAt
			}

			// Lookup aggregated activity log stats
			aggKey := student.ID.String() + ":" + subject
			agg := logAggMap[aggKey]

			var lastActiveAtVal interface{}
			if agg.TotalAnswers > 0 || !agg.LastActiveAt.IsZero() {
				lastActiveAtVal = agg.LastActiveAt
			} else {
				lastActiveAtVal = nil
			}

			results = append(results, map[string]interface{}{
				"studentId":      student.ID,
				"studentName":    student.Name,
				"studentEmail":   student.Email,
				"subject":        subject,
				"initialNodeId":  initialNodeId,
				"initialNode":    initialNodeName,
				"currentNodeId":  currentNodeId,
				"currentNode":    currentNodeName,
				"updatedAt":      updatedAtVal,
				"totalAnswers":   agg.TotalAnswers,
				"correctAnswers": agg.CorrectAnswers,
				"lastActiveAt":   lastActiveAtVal,
			})
		}
	}

	return results, nil
}
func (s *tutorService) GetStudentSubjectProgress(studentID uuid.UUID, subject string) (map[string]interface{}, error) {
	var state model.StudentState
	err := s.db.Where("student_id = ? AND subject = ?", studentID, subject).First(&state).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	var logs []model.ActivityLog
	s.db.Where("student_id = ? AND subject = ?", studentID, subject).Order("created_at desc").Find(&logs)

	formattedLogs := []map[string]interface{}{}
	nodeCorrectCount := map[string]int{}
	nodeIncorrectCount := map[string]int{}
	nodeCantDoCount := map[string]int{}

	for _, l := range logs {
		var nodeName string
		s.db.Table("nodes").Where("id = ?", l.NodeID).Select("name").Row().Scan(&nodeName)

		formattedLogs = append(formattedLogs, map[string]interface{}{
			"id":        l.ID,
			"nodeId":    l.NodeID,
			"nodeName":  nodeName,
			"action":    l.Action,
			"detail":    l.Detail,
			"createdAt": l.CreatedAt,
		})

		nodeIdStr := l.NodeID.String()
		if l.Action == "answer_correct" {
			nodeCorrectCount[nodeIdStr]++
		} else if l.Action == "answer_incorrect" {
			nodeIncorrectCount[nodeIdStr]++
		} else if l.Action == "click_cant_do" {
			nodeCantDoCount[nodeIdStr]++
		}
	}

	nodeStatus := map[string]string{}
	for nodeIDStr, incorrect := range nodeIncorrectCount {
		cantDo := nodeCantDoCount[nodeIDStr]
		correct := nodeCorrectCount[nodeIDStr]
		if correct > 0 {
			nodeStatus[nodeIDStr] = "mastered"
		}
		if (incorrect + cantDo) > 0 {
			if correct == 0 {
				nodeStatus[nodeIDStr] = "struggle"
			} else if (incorrect + cantDo) > correct {
				nodeStatus[nodeIDStr] = "struggle"
			}
		}
	}

	for nodeIDStr, cantDo := range nodeCantDoCount {
		if cantDo > 0 && nodeStatus[nodeIDStr] == "" {
			nodeStatus[nodeIDStr] = "struggle"
		}
	}

	for nodeIDStr, correct := range nodeCorrectCount {
		if correct > 0 && nodeStatus[nodeIDStr] == "" {
			nodeStatus[nodeIDStr] = "mastered"
		}
	}

	// Build per-node accuracy map for mastery ring visualization
	nodeAccuracy := map[string]map[string]int{}
	allNodeIds := map[string]bool{}
	for k := range nodeCorrectCount {
		allNodeIds[k] = true
	}
	for k := range nodeIncorrectCount {
		allNodeIds[k] = true
	}
	for k := range nodeCantDoCount {
		allNodeIds[k] = true
	}
	for nodeIDStr := range allNodeIds {
		correct := nodeCorrectCount[nodeIDStr]
		incorrect := nodeIncorrectCount[nodeIDStr]
		cantDo := nodeCantDoCount[nodeIDStr]
		total := correct + incorrect + cantDo
		nodeAccuracy[nodeIDStr] = map[string]int{
			"correct":   correct,
			"incorrect": incorrect,
			"total":     total,
		}
	}

	// Build detailed per-node per-difficulty statistics for the tracking matrix
	nodeDifficultyStats := map[string]map[string]map[string]int{}
	for _, l := range logs {
		nodeIdStr := l.NodeID.String()
		if nodeDifficultyStats[nodeIdStr] == nil {
			nodeDifficultyStats[nodeIdStr] = map[string]map[string]int{
				"easy":      {"correct": 0, "incorrect": 0, "total": 0},
				"medium":    {"correct": 0, "incorrect": 0, "total": 0},
				"hard":      {"correct": 0, "incorrect": 0, "total": 0},
				"very_hard": {"correct": 0, "incorrect": 0, "total": 0},
			}
		}

		difficulty := "medium"
		if strings.Contains(l.Detail, "Độ khó: easy") || strings.Contains(l.Detail, "Độ khó: Nhận biết") {
			difficulty = "easy"
		} else if strings.Contains(l.Detail, "Độ khó: medium") || strings.Contains(l.Detail, "Độ khó: Thông hiểu") {
			difficulty = "medium"
		} else if strings.Contains(l.Detail, "Độ khó: hard") || strings.Contains(l.Detail, "Độ khó: Vận dụng") {
			difficulty = "hard"
		} else if strings.Contains(l.Detail, "Độ khó: very_hard") || strings.Contains(l.Detail, "Độ khó: Vận dụng cao") {
			difficulty = "very_hard"
		}

		if l.Action == "answer_correct" {
			nodeDifficultyStats[nodeIdStr][difficulty]["correct"]++
			nodeDifficultyStats[nodeIdStr][difficulty]["total"]++
		} else if l.Action == "answer_incorrect" {
			nodeDifficultyStats[nodeIdStr][difficulty]["incorrect"]++
			nodeDifficultyStats[nodeIdStr][difficulty]["total"]++
		}
	}

	return map[string]interface{}{
		"state":               state,
		"logs":                formattedLogs,
		"nodeStatus":          nodeStatus,
		"nodeAccuracy":        nodeAccuracy,
		"nodeDifficultyStats": nodeDifficultyStats,
	}, nil
}

func (s *tutorService) ChatNodeTheory(studentID uuid.UUID, nodeID uuid.UUID, message string, history []map[string]string) (string, error) {
	var node model.Node
	if err := s.db.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return "", err
	}

	// Guardrail: kiểm tra input trước khi gọi LLM (xem guardrail_service.go)
	if verdict := CheckStudentInput(message); verdict != nil {
		s.logGuardrailEvent(studentID, nil, "theory_chat", verdict, message)
		return SafeResponse(verdict.Category, "socratic"), nil
	}

	return s.aiSvc.GenerateRAGResponse(node.Theory, history, message)
}

// ─── Guardrail Events ────────────────────────────────────────────────────────

// GuardrailEventView là bản ghi sự kiện kèm tên học sinh cho dashboard giáo viên.
type GuardrailEventView struct {
	ID             uuid.UUID  `json:"id"`
	StudentID      uuid.UUID  `json:"studentId"`
	StudentName    string     `json:"studentName"`
	StudentEmail   string     `json:"studentEmail"`
	SessionID      *uuid.UUID `json:"sessionId"`
	Source         string     `json:"source"`
	Category       string     `json:"category"`
	Severity       string     `json:"severity"`
	ContentExcerpt string     `json:"contentExcerpt"`
	Handled        bool       `json:"handled"`
	CreatedAt      time.Time  `json:"createdAt"`
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

func (s *tutorService) GetGuardrailEvents(severity string, limit int) ([]GuardrailEventView, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	q := s.db.Table("guardrail_events").
		Select("guardrail_events.id, guardrail_events.student_id, users.name as student_name, users.email as student_email, guardrail_events.session_id, guardrail_events.source, guardrail_events.category, guardrail_events.severity, guardrail_events.content_excerpt, guardrail_events.handled, guardrail_events.created_at").
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

func (s *tutorService) GetSubjects() ([]string, error) {
	var subjects []string
	if err := s.db.Model(&model.Node{}).Distinct().Where("subject NOT LIKE ?", "%Khoa học%").Pluck("subject", &subjects).Error; err != nil {
		return nil, err
	}

	// Filter out any other unwanted subjects, and default to only "Toán Lớp 5"
	cleanedSubjects := []string{}
	for _, sub := range subjects {
		if sub != "" && sub != "Khoa học Lớp 4" {
			cleanedSubjects = append(cleanedSubjects, sub)
		}
	}

	if len(cleanedSubjects) == 0 {
		cleanedSubjects = []string{}
	}
	return cleanedSubjects, nil
}

func (s *tutorService) DeleteSubject(subject string) error {
	log.Printf("[DEBUG DeleteSubject] Starting delete for subject=%q", subject)
	return s.db.Transaction(func(tx *gorm.DB) error {
		var existingNodeIDs []uuid.UUID
		tx.Model(&model.Node{}).Where("subject = ?", subject).Pluck("id", &existingNodeIDs)
		log.Printf("[DEBUG DeleteSubject] Found %d nodes for subject=%q", len(existingNodeIDs), subject)
		if len(existingNodeIDs) > 0 {
			// Delete questions
			res := tx.Where("node_id IN ?", existingNodeIDs).Delete(&model.Question{})
			if res.Error != nil {
				log.Printf("[DEBUG DeleteSubject] ERROR deleting questions: %v", res.Error)
				return res.Error
			}
			log.Printf("[DEBUG DeleteSubject] Deleted %d questions", res.RowsAffected)

			// Delete student states
			res = tx.Where("initial_level_node_id IN ? OR current_level_node_id IN ?", existingNodeIDs, existingNodeIDs).Delete(&model.StudentState{})
			if res.Error != nil {
				log.Printf("[DEBUG DeleteSubject] ERROR deleting student states: %v", res.Error)
				return res.Error
			}
			log.Printf("[DEBUG DeleteSubject] Deleted %d student states", res.RowsAffected)

			// Delete activity logs
			res = tx.Where("node_id IN ?", existingNodeIDs).Delete(&model.ActivityLog{})
			if res.Error != nil {
				log.Printf("[DEBUG DeleteSubject] ERROR deleting activity logs: %v", res.Error)
				return res.Error
			}
			log.Printf("[DEBUG DeleteSubject] Deleted %d activity logs", res.RowsAffected)
		}
		// Delete edges
		res := tx.Where("subject = ?", subject).Delete(&model.Edge{})
		if res.Error != nil {
			log.Printf("[DEBUG DeleteSubject] ERROR deleting edges: %v", res.Error)
			return res.Error
		}
		log.Printf("[DEBUG DeleteSubject] Deleted %d edges", res.RowsAffected)

		// Delete nodes
		res = tx.Where("subject = ?", subject).Delete(&model.Node{})
		if res.Error != nil {
			log.Printf("[DEBUG DeleteSubject] ERROR deleting nodes: %v", res.Error)
			return res.Error
		}
		log.Printf("[DEBUG DeleteSubject] Deleted %d nodes. SUCCESS!", res.RowsAffected)
		return nil
	})
}

func (s *tutorService) RenameSubject(oldName, newName string) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&model.Node{}).Where("subject = ?", oldName).Update("subject", newName).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.Edge{}).Where("subject = ?", oldName).Update("subject", newName).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.StudentState{}).Where("subject = ?", oldName).Update("subject", newName).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.ActivityLog{}).Where("subject = ?", oldName).Update("subject", newName).Error; err != nil {
			return err
		}
		return nil
	})
}

type ParsedQuestion struct {
	Content       string   `json:"content"`
	Options       []string `json:"options"`
	CorrectOption int      `json:"correctOption"`
	Difficulty    string   `json:"difficulty"`
}
type ParsedNode struct {
	Name       string           `json:"name"`
	Theory     string           `json:"theory"`
	TopicGroup string           `json:"topicGroup"`
	IsRoot     bool             `json:"isRoot"`
	Questions  []ParsedQuestion `json:"questions"`
}

type ParsedEdge struct {
	SourceNodeName string `json:"sourceNodeName"`
	TargetNodeName string `json:"targetNodeName"`
}

type ParsedGraph struct {
	Nodes []ParsedNode `json:"nodes"`
	Edges []ParsedEdge `json:"edges"`
}

func (s *tutorService) ParseAndBuildTree(subject string, fileContent string) error {
	fmt.Printf("[CURRICULUM PARSER] Khởi động bóc tách cho môn học: %s (Kích thước văn bản: %d ký tự)\n", subject, len(fileContent))

	// 1. Chunking text by characters (approx 30,000 chars per chunk)
	const chunkSize = 30000
	var chunks []string
	runes := []rune(fileContent)
	totalRunes := len(runes)

	for i := 0; i < totalRunes; i += chunkSize {
		end := i + chunkSize
		if end > totalRunes {
			end = totalRunes
		}
		chunks = append(chunks, string(runes[i:end]))
	}
	fmt.Printf("[CURRICULUM PARSER] Văn bản được chia thành %d đoạn nhỏ để xử lý tuần tự (rate-limited)..\n", len(chunks))

	// Process chunks sequentially to respect API rate limits (free tier: 5 RPM)
	var parsedGraphs []ParsedGraph
	for idx, chunk := range chunks {
		fmt.Printf("[CURRICULUM PARSER] Đoạn %d/%d: Gửi yêu cầu bóc tách sang Gemini API...\n", idx+1, len(chunks))

		var lastErr error
		var success bool
		for attempt := 1; attempt <= 3; attempt++ {
			res, err := s.aiSvc.ParseCurriculum(chunk)
			if err == nil {
				cleanJSON := strings.TrimPrefix(res, "```json")
				cleanJSON = strings.TrimPrefix(cleanJSON, "```")
				cleanJSON = strings.TrimSuffix(cleanJSON, "```")
				cleanJSON = strings.TrimSpace(cleanJSON)

				var pg ParsedGraph
				if parseErr := json.Unmarshal([]byte(cleanJSON), &pg); parseErr != nil {
					fmt.Printf("[CURRICULUM PARSER] Đoạn %d: LỖI parse JSON: %v\n", idx+1, parseErr)
					lastErr = parseErr
				} else {
					parsedGraphs = append(parsedGraphs, pg)
					fmt.Printf("[CURRICULUM PARSER] Đoạn %d/%d: Thành công (%d nút, %d liên kết)\n", idx+1, len(chunks), len(pg.Nodes), len(pg.Edges))
					success = true
					break
				}
			} else {
				lastErr = err
				// If rate limited (429), wait longer
				if strings.Contains(err.Error(), "429") {
					fmt.Printf("[CURRICULUM PARSER] Đoạn %d: Bị giới hạn tốc độ (429). Chờ 35 giây trước khi thử lại (lần %d)...\n", idx+1, attempt)
					time.Sleep(35 * time.Second)
				} else {
					fmt.Printf("[CURRICULUM PARSER] Đoạn %d: Lỗi lần %d: %v. Chờ 5 giây...\n", idx+1, attempt, err)
					time.Sleep(5 * time.Second)
				}
			}
		}

		if !success {
			fmt.Printf("[CURRICULUM PARSER] Đoạn %d: Bỏ qua sau 3 lần thất bại: %v\n", idx+1, lastErr)
		}

		// Rate limit delay between chunks (15s to stay under 5 RPM)
		if idx < len(chunks)-1 {
			fmt.Printf("[CURRICULUM PARSER] Chờ 15 giây trước khi xử lý đoạn tiếp theo...\n")
			time.Sleep(15 * time.Second)
		}
	}

	if len(parsedGraphs) == 0 {
		return fmt.Errorf("không thể bóc tách bất kỳ đoạn tài liệu nào do lỗi API hoặc lỗi phân tích JSON")
	}

	// 2. Reduce Phase: Merge and Deduplicate Nodes and Edges
	mergedNodesMap := make(map[string]ParsedNode)
	var mergedEdges []ParsedEdge

	for _, pg := range parsedGraphs {
		for _, n := range pg.Nodes {
			if n.Name == "" {
				continue
			}
			if _, exists := mergedNodesMap[n.Name]; !exists {
				mergedNodesMap[n.Name] = n
			}
		}
		for _, e := range pg.Edges {
			if e.SourceNodeName == "" || e.TargetNodeName == "" {
				continue
			}
			duplicate := false
			for _, me := range mergedEdges {
				if me.SourceNodeName == e.SourceNodeName && me.TargetNodeName == e.TargetNodeName {
					duplicate = true
					break
				}
			}
			if !duplicate {
				mergedEdges = append(mergedEdges, e)
			}
		}
	}

	var finalGraph ParsedGraph
	for _, n := range mergedNodesMap {
		finalGraph.Nodes = append(finalGraph.Nodes, n)
	}
	finalGraph.Edges = mergedEdges

	fmt.Printf("[CURRICULUM PARSER] Khử trùng lặp thành công. Tổng số nút cuối cùng: %d, Tổng số liên kết: %d\n", len(finalGraph.Nodes), len(finalGraph.Edges))

	// 3. Build topological graph for layout calculation
	adj := make(map[string][]string)
	inDegree := make(map[string]int)
	for _, n := range finalGraph.Nodes {
		inDegree[n.Name] = 0
		adj[n.Name] = []string{}
	}
	for _, e := range finalGraph.Edges {
		if _, srcExists := mergedNodesMap[e.SourceNodeName]; srcExists {
			if _, tgtExists := mergedNodesMap[e.TargetNodeName]; tgtExists {
				adj[e.SourceNodeName] = append(adj[e.SourceNodeName], e.TargetNodeName)
				inDegree[e.TargetNodeName]++
			}
		}
	}

	var queue []string
	levels := make(map[string]int)
	for name, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, name)
			levels[name] = 0
		}
	}

	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		for _, neighbor := range adj[curr] {
			if levels[neighbor] < levels[curr]+1 {
				levels[neighbor] = levels[curr] + 1
			}
			inDegree[neighbor]--
			if inDegree[neighbor] == 0 {
				queue = append(queue, neighbor)
			}
		}
	}

	nodesByLevel := make(map[int][]string)
	maxLevel := 0
	for name, lvl := range levels {
		nodesByLevel[lvl] = append(nodesByLevel[lvl], name)
		if lvl > maxLevel {
			maxLevel = lvl
		}
	}

	nameToNode := make(map[string]*model.Node)

	fmt.Println("[CURRICULUM PARSER] Bước 4: Đang bắt đầu ghi đè cơ sở dữ liệu (GORM Transaction)...")
	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	var existingNodeIDs []uuid.UUID
	tx.Model(&model.Node{}).Where("subject = ?", subject).Pluck("id", &existingNodeIDs)
	if len(existingNodeIDs) > 0 {
		if err := tx.Where("node_id IN ?", existingNodeIDs).Delete(&model.Question{}).Error; err != nil {
			tx.Rollback()
			return err
		}
	}
	if err := tx.Where("subject = ?", subject).Delete(&model.Edge{}).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Where("subject = ?", subject).Delete(&model.Node{}).Error; err != nil {
		tx.Rollback()
		return err
	}

	for lvl := 0; lvl <= maxLevel; lvl++ {
		levelNodes := nodesByLevel[lvl]
		count := len(levelNodes)
		for idx, name := range levelNodes {
			originalNode := mergedNodesMap[name]

			// Dynamic layout: 280px per node horizontally, centered
			nodeSpacing := 280.0
			totalLevelWidth := nodeSpacing * float64(count)
			startX := 100.0 // left margin
			var posX float64
			if count == 1 {
				posX = startX + totalLevelWidth/2.0 - 100.0
			} else {
				posX = startX + float64(idx)*nodeSpacing
			}
			posY := 80.0 + float64(lvl)*200.0

			node := &model.Node{
				ID:         uuid.New(),
				Subject:    subject,
				Name:       name,
				Theory:     originalNode.Theory,
				TopicGroup: originalNode.TopicGroup,
				PosX:       posX,
				PosY:       posY,
				IsRoot:     originalNode.IsRoot || lvl == 0,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			}

			if err := tx.Create(node).Error; err != nil {
				tx.Rollback()
				return err
			}
			nameToNode[name] = node
		}
	}

	for _, pe := range finalGraph.Edges {
		srcNode, srcExists := nameToNode[pe.SourceNodeName]
		tgtNode, tgtExists := nameToNode[pe.TargetNodeName]
		if srcExists && tgtExists {
			edge := &model.Edge{
				ID:        uuid.New(),
				Subject:   subject,
				SourceID:  srcNode.ID,
				TargetID:  tgtNode.ID,
				CreatedAt: time.Now(),
			}
			if err := tx.Create(edge).Error; err != nil {
				tx.Rollback()
				return err
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		fmt.Printf("[CURRICULUM PARSER] LỖI khi commit database transaction: %v\n", err)
		return err
	}
	fmt.Println("[CURRICULUM PARSER] HOÀN TẤT DỰNG CÂY KIẾN THỨC THÀNH CÔNG!")
	return nil
}

func (s *tutorService) ParseChunk(chunk string) (ParsedGraph, error) {
	var pg ParsedGraph
	res, err := s.aiSvc.ParseCurriculum(chunk)
	if err != nil {
		return pg, err
	}

	cleanJSON := strings.TrimPrefix(res, "```json")
	cleanJSON = strings.TrimPrefix(cleanJSON, "```")
	cleanJSON = strings.TrimSuffix(cleanJSON, "```")
	cleanJSON = strings.TrimSpace(cleanJSON)

	if parseErr := json.Unmarshal([]byte(cleanJSON), &pg); parseErr != nil {
		return pg, fmt.Errorf("lỗi giải mã JSON từ AI: %v", parseErr)
	}

	return pg, nil
}

func (s *tutorService) SaveTree(subject string, finalGraph ParsedGraph) error {
	fmt.Printf("[CURRICULUM PARSER] Khởi động lưu cây cho môn học: %s (%d nút, %d liên kết)\n", subject, len(finalGraph.Nodes), len(finalGraph.Edges))

	mergedNodesMap := make(map[string]ParsedNode)
	for _, n := range finalGraph.Nodes {
		if n.Name != "" {
			mergedNodesMap[n.Name] = n
		}
	}

	adj := make(map[string][]string)
	inDegree := make(map[string]int)
	for _, n := range finalGraph.Nodes {
		inDegree[n.Name] = 0
		adj[n.Name] = []string{}
	}
	for _, e := range finalGraph.Edges {
		if _, srcExists := mergedNodesMap[e.SourceNodeName]; srcExists {
			if _, tgtExists := mergedNodesMap[e.TargetNodeName]; tgtExists {
				adj[e.SourceNodeName] = append(adj[e.SourceNodeName], e.TargetNodeName)
				inDegree[e.TargetNodeName]++
			}
		}
	}

	var queue []string
	levels := make(map[string]int)
	for name, deg := range inDegree {
		if deg == 0 {
			queue = append(queue, name)
			levels[name] = 0
		}
	}

	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]
		for _, neighbor := range adj[curr] {
			if levels[neighbor] < levels[curr]+1 {
				levels[neighbor] = levels[curr] + 1
			}
			inDegree[neighbor]--
			if inDegree[neighbor] == 0 {
				queue = append(queue, neighbor)
			}
		}
	}

	nodesByLevel := make(map[int][]string)
	maxLevel := 0
	for name, lvl := range levels {
		nodesByLevel[lvl] = append(nodesByLevel[lvl], name)
		if lvl > maxLevel {
			maxLevel = lvl
		}
	}

	nameToNode := make(map[string]*model.Node)

	fmt.Println("[CURRICULUM PARSER] Bước 4: Đang bắt đầu ghi đè cơ sở dữ liệu (GORM Transaction)...")
	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	var existingNodeIDs []uuid.UUID
	tx.Model(&model.Node{}).Where("subject = ?", subject).Pluck("id", &existingNodeIDs)
	if len(existingNodeIDs) > 0 {
		if err := tx.Where("node_id IN ?", existingNodeIDs).Delete(&model.Question{}).Error; err != nil {
			tx.Rollback()
			return err
		}
	}
	if err := tx.Where("subject = ?", subject).Delete(&model.Edge{}).Error; err != nil {
		tx.Rollback()
		return err
	}
	if err := tx.Where("subject = ?", subject).Delete(&model.Node{}).Error; err != nil {
		tx.Rollback()
		return err
	}

	for lvl := 0; lvl <= maxLevel; lvl++ {
		levelNodes := nodesByLevel[lvl]
		count := len(levelNodes)
		for idx, name := range levelNodes {
			originalNode := mergedNodesMap[name]

			nodeSpacing := 280.0
			totalLevelWidth := nodeSpacing * float64(count)
			startX := 100.0
			var posX float64
			if count == 1 {
				posX = startX + totalLevelWidth/2.0 - 100.0
			} else {
				posX = startX + float64(idx)*nodeSpacing
			}
			posY := 80.0 + float64(lvl)*200.0

			node := &model.Node{
				ID:         uuid.New(),
				Subject:    subject,
				Name:       name,
				Theory:     originalNode.Theory,
				TopicGroup: originalNode.TopicGroup,
				PosX:       posX,
				PosY:       posY,
				IsRoot:     originalNode.IsRoot || lvl == 0,
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			}

			if err := tx.Create(node).Error; err != nil {
				tx.Rollback()
				return err
			}
			nameToNode[name] = node
		}
	}

	for _, pe := range finalGraph.Edges {
		srcNode, srcExists := nameToNode[pe.SourceNodeName]
		tgtNode, tgtExists := nameToNode[pe.TargetNodeName]
		if srcExists && tgtExists {
			edge := &model.Edge{
				ID:        uuid.New(),
				Subject:   subject,
				SourceID:  srcNode.ID,
				TargetID:  tgtNode.ID,
				CreatedAt: time.Now(),
			}
			if err := tx.Create(edge).Error; err != nil {
				tx.Rollback()
				return err
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		fmt.Printf("[CURRICULUM PARSER] LỖI khi commit database transaction: %v\n", err)
		return err
	}
	fmt.Println("[CURRICULUM PARSER] HOÀN TẤT LƯU CÂY KIẾN THỨC THÀNH CÔNG!")
	return nil
}

func (s *tutorService) GetMonitoringData(subject string) ([]StudentStat, error) {
	var students []model.User
	if err := s.db.Where("role = ?", "student").Order("name asc").Find(&students).Error; err != nil {
		return nil, err
	}

	var stats []StudentStat
	for _, student := range students {
		var total int64
		var correct int64

		s.db.Model(&model.ActivityLog{}).
			Where("student_id = ? AND subject = ? AND action IN ('answer_correct', 'answer_incorrect')", student.ID, subject).
			Count(&total)

		s.db.Model(&model.ActivityLog{}).
			Where("student_id = ? AND subject = ? AND action = 'answer_correct'", student.ID, subject).
			Count(&correct)

		rate := 0.0
		if total > 0 {
			rate = float64(correct) / float64(total)
		}

		actualMastery := rate * 100

		// Compute expected mastery: baseline 75% plus deterministic offset based on name hash for visual spread
		hashVal := 0
		for _, char := range student.Name {
			hashVal += int(char)
		}
		expectedMastery := 75.0 + float64(hashVal%16)

		// Outlier check: attempted at least 3 questions and actual score is more than 35% below expected score
		isOutlier := total >= 3 && (expectedMastery-actualMastery) > 35.0

		stats = append(stats, StudentStat{
			StudentID:       student.ID.String(),
			StudentName:     student.Name,
			ExpectedMastery: expectedMastery,
			ActualMastery:   actualMastery,
			TotalAnswers:    int(total),
			CorrectAnswers:  int(correct),
			MasteryRate:     actualMastery,
			IsOutlier:       isOutlier,
		})
	}
	return stats, nil
}
func (s *tutorService) GetClassInterventionGroups(subject string) (map[string]interface{}, error) {
	var nodes []model.Node
	if err := s.db.Where("subject = ?", subject).Find(&nodes).Error; err != nil {
		return nil, err
	}
	nodeNameMap := make(map[uuid.UUID]string)
	for _, n := range nodes {
		nodeNameMap[n.ID] = n.Name
	}

	var students []model.User
	if err := s.db.Where("role = ?", "student").Find(&students).Error; err != nil {
		return nil, err
	}
	studentNameMap := make(map[uuid.UUID]string)
	for _, st := range students {
		studentNameMap[st.ID] = st.Name
	}

	var logs []model.ActivityLog
	if err := s.db.Where("subject = ?", subject).Order("created_at asc").Find(&logs).Error; err != nil {
		return nil, err
	}

	studentNodeStates := make(map[uuid.UUID]map[uuid.UUID]bool)
	for _, log := range logs {
		if log.NodeID == uuid.Nil {
			continue
		}
		if _, exists := studentNodeStates[log.StudentID]; !exists {
			studentNodeStates[log.StudentID] = make(map[uuid.UUID]bool)
		}

		if log.Action == "answer_correct" || log.Action == "mastered" {
			studentNodeStates[log.StudentID][log.NodeID] = false
		} else if log.Action == "answer_incorrect" || log.Action == "click_cant_do" || log.Action == "struggle" {
			studentNodeStates[log.StudentID][log.NodeID] = true
		}
	}

	nodeStruggleCount := make(map[uuid.UUID]int)
	nodeStruggleStudents := make(map[uuid.UUID][]map[string]interface{})

	for stID, nodeStates := range studentNodeStates {
		stName, ok := studentNameMap[stID]
		if !ok {
			continue
		}
		for ndID, struggling := range nodeStates {
			if struggling {
				nodeStruggleCount[ndID]++
				nodeStruggleStudents[ndID] = append(nodeStruggleStudents[ndID], map[string]interface{}{
					"studentId":   stID.String(),
					"studentName": stName,
				})
			}
		}
	}

	var topGaps []map[string]interface{}
	var groups []map[string]interface{}

	for ndID, count := range nodeStruggleCount {
		ndName, ok := nodeNameMap[ndID]
		if !ok {
			continue
		}
		topGaps = append(topGaps, map[string]interface{}{
			"nodeId":        ndID.String(),
			"nodeName":      ndName,
			"struggleCount": count,
		})

		groups = append(groups, map[string]interface{}{
			"nodeId":   ndID.String(),
			"nodeName": ndName,
			"students": nodeStruggleStudents[ndID],
		})
	}

	// Sort descending
	for i := 0; i < len(topGaps)-1; i++ {
		for j := i + 1; j < len(topGaps); j++ {
			countI := topGaps[i]["struggleCount"].(int)
			countJ := topGaps[j]["struggleCount"].(int)
			if countI < countJ {
				topGaps[i], topGaps[j] = topGaps[j], topGaps[i]
				groups[i], groups[j] = groups[j], groups[i]
			}
		}
	}

	return map[string]interface{}{
		"topGaps": topGaps,
		"groups":  groups,
	}, nil
}
