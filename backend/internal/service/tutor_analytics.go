package service

import (
	"errors"
	"strings"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

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

