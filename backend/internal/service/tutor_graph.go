package service

import (
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

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

func cleanupNodeScopedLearningData(tx *gorm.DB, nodeIDs []uuid.UUID) error {
	if len(nodeIDs) == 0 {
		return nil
	}
	if err := tx.Where("node_id IN ?", nodeIDs).Delete(&model.Question{}).Error; err != nil {
		return err
	}
	if err := tx.Where("node_id IN ?", nodeIDs).Delete(&model.ActivityLog{}).Error; err != nil {
		return err
	}
	if err := tx.Where("initial_level_node_id IN ? OR current_level_node_id IN ?", nodeIDs, nodeIDs).Delete(&model.StudentState{}).Error; err != nil {
		return err
	}
	if err := tx.Where("topic_id IN ?", nodeIDs).Delete(&model.StudentTopicMastery{}).Error; err != nil {
		return err
	}
	if err := tx.Where("topic_id IN ?", nodeIDs).Delete(&model.StudentTopicMasteryHistory{}).Error; err != nil {
		return err
	}
	return nil
}

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
		if err := cleanupNodeScopedLearningData(tx, existingNodeIDs); err != nil {
			log.Printf("[DEBUG DeleteSubject] ERROR deleting node-scoped learning data: %v", err)
			return err
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
	if err := cleanupNodeScopedLearningData(tx, existingNodeIDs); err != nil {
		tx.Rollback()
		return err
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
	if err := cleanupNodeScopedLearningData(tx, existingNodeIDs); err != nil {
		tx.Rollback()
		return err
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
