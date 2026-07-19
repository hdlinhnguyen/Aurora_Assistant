package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"time"

	"backend/internal/model"
	"backend/internal/telemetry"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

func (s *tutorService) GetStudentState(studentID uuid.UUID, subject string) (*model.StudentState, error) {
	var state model.StudentState
	err := s.db.Where("student_id = ? AND subject = ?", studentID, subject).First(&state).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			// Khởi tạo trạng thái mặc định cho học sinh mới, yêu cầu làm bài khảo sát/chẩn đoán
			state = model.StudentState{
				ID:                 uuid.New(),
				StudentID:          studentID,
				Subject:            subject,
				NeedsDiagnostic:    true,
				InitialLevelNodeID: uuid.Nil,
				CurrentLevelNodeID: uuid.Nil,
				CreatedAt:          time.Now(),
				UpdatedAt:          time.Now(),
			}
			if err := s.db.Create(&state).Error; err != nil {
				return nil, err
			}
			return &state, nil
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
	if err := s.db.Where("id = ? AND node_id = ?", questionID, nodeID).First(&q).Error; err != nil {
		return false, nil, err
	}
	var options []string
	if err := json.Unmarshal([]byte(q.OptionsJSON), &options); err != nil || len(options) < 2 {
		return false, nil, errors.New("question has invalid answer options")
	}
	if selectedOption < 0 || selectedOption >= len(options) {
		return false, nil, errors.New("selected option is out of range")
	}

	var node model.Node
	if err := s.db.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return false, nil, err
	}

	isCorrect := q.CorrectOption == selectedOption
	action := "answer_incorrect"
	detail := fmt.Sprintf("[question_id=%s] [difficulty=%s] Trả lời câu hỏi '%s' (Độ khó: %s), chọn %d (Sai, Đáp án đúng: %d)", q.ID, q.Difficulty, q.Content, q.Difficulty, selectedOption, q.CorrectOption)
	if isCorrect {
		action = "answer_correct"
		detail = fmt.Sprintf("[question_id=%s] [difficulty=%s] Trả lời câu hỏi '%s' (Độ khó: %s), chọn %d (Đúng)", q.ID, q.Difficulty, q.Content, q.Difficulty, selectedOption)

		var state model.StudentState
		err := s.db.Where("student_id = ? AND subject = ?", studentID, node.Subject).First(&state).Error
		if err == nil {
			state.CurrentLevelNodeID = nodeID
			state.UpdatedAt = time.Now()
			s.db.Save(&state)
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
						var mappedNode model.Node
						if err := s.db.Where("id = ? AND subject = ?", mappedNodeID, node.Subject).First(&mappedNode).Error; err == nil {
							s.LogActivity(studentID, node.Subject, mappedNodeID, "struggle", fmt.Sprintf("Chẩn đoán lỗi sai nền tảng (First-Principle) từ câu hỏi %s", q.ID))
							s.LogActivity(
								studentID,
								node.Subject,
								mappedNodeID,
								"answer_incorrect",
								fmt.Sprintf("[question_id=%s] [difficulty=%s] [inference_weight=0.35] [source=distractor] Bằng chứng sai gián tiếp từ distractor mapping", q.ID, q.Difficulty),
							)

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
		Where("edges.target_id = ? AND edges.status = ? AND nodes.subject = ?", nodeID, "active", node.Subject).
		Order("nodes.id").
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

	var easyQuestionCount int64
	_ = s.db.Model(&model.Question{}).
		Where("node_id = ? AND LOWER(TRIM(difficulty)) IN ?", nodeID, []string{"easy", "nb", "nhận biết"}).
		Count(&easyQuestionCount).Error

	return map[string]interface{}{
		"nodeId":   nodeID,
		"parents":  parentsList,
		"hasEasyQ": easyQuestionCount > 0,
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

	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("student_id = ? AND subject = ?", studentID, subject).Delete(&model.ActivityLog{}).Error; err != nil {
			return err
		}
		topicIDs := tx.Model(&model.Node{}).Select("id").Where("subject = ?", subject)
		if err := tx.Where("student_id = ? AND topic_id IN (?)", studentID, topicIDs).
			Delete(&model.StudentTopicMasteryHistory{}).Error; err != nil {
			return err
		}
		if err := tx.Where("student_id = ? AND topic_id IN (?)", studentID, topicIDs).
			Delete(&model.StudentTopicMastery{}).Error; err != nil {
			return err
		}
		return tx.Save(&state).Error
	})
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
		Joins("LEFT JOIN student_topic_masteries stm ON stm.topic_id = nodes.id AND stm.student_id = ?", studentID).
		Where("edges.target_id = ? AND edges.status = ? AND nodes.subject = ?", nodeID, "active", node.Subject).
		Order("CASE WHEN stm.mastery_status = 'confirmed_gap' THEN 0 WHEN stm.mastery_status = 'learning' THEN 1 WHEN stm.mastery_status = 'uncertain' THEN 2 WHEN stm.mastery_status IS NULL THEN 3 ELSE 4 END").
		Order("COALESCE(stm.mastery_probability, 0.3) ASC").
		Order("COALESCE(stm.confidence_score, 0) ASC").
		Order("nodes.id ASC").
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

func (s *tutorService) ChatNodeTheory(studentID uuid.UUID, nodeID uuid.UUID, message string, history []map[string]string, questionText string) (string, error) {
	var node model.Node
	if err := s.db.Where("id = ?", nodeID).First(&node).Error; err != nil {
		return "", err
	}

	// Guardrail: kiểm tra input trước khi gọi LLM (xem guardrail_service.go)
	if verdict := CheckStudentInput(message); verdict != nil {
		s.logGuardrailEvent(studentID, nil, "theory_chat", verdict, message)
		return SafeResponse(verdict.Category, "socratic"), nil
	}

	if questionText != "" {
		return s.aiSvc.GenerateSocraticPracticeResponse(node.Theory, questionText, history, message)
	}

	return s.aiSvc.GenerateRAGResponse(node.Theory, history, message)
}
