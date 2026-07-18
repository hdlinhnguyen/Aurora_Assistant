package syntheticseed

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type curriculumTopic struct {
	StableKey     string
	Name          string
	Theory        string
	GradeLevel    int
	Strand        string
	Prerequisites []string
}

type curriculumEdge struct {
	SourceKey string
	TargetKey string
}

type curriculumClosure struct {
	Topics      []curriculumTopic
	Targets     []curriculumTopic
	Edges       []curriculumEdge
	ByStableKey map[string]curriculumTopic
}

type seededCurriculum struct {
	Root        model.Node
	Topics      []model.Node
	Targets     []model.Node
	ByStableKey map[string]model.Node
}

func grade7TargetKeys() []string {
	return []string{
		"l7-so-huu-ti-khai-niem",
		"l7-phep-tinh-so-huu-ti",
		"l7-can-bac-hai",
		"l7-so-thuc",
		"l7-ti-le-thuc",
		"l7-dai-luong-ti-le",
		"l7-bieu-thuc-dai-so",
		"l7-da-thuc-mot-bien",
	}
}

func syntheticCurriculumNodeIDs() ([]uuid.UUID, error) {
	closure, err := resolveCurriculumClosure(syntheticCurriculumCatalog(), grade7TargetKeys())
	if err != nil {
		return nil, err
	}
	nodeIDs := make([]uuid.UUID, 0, 1+len(closure.Topics))
	nodeIDs = append(nodeIDs, stableSyntheticUUID("curriculum", "root"))
	for _, topic := range closure.Topics {
		nodeIDs = append(nodeIDs, stableSyntheticUUID("curriculum", topic.StableKey))
	}
	return nodeIDs, nil
}

func syntheticCurriculumCatalog() []curriculumTopic {
	topic := func(key, name string, grade int, prerequisites ...string) curriculumTopic {
		return curriculumTopic{
			StableKey: key, Name: name, Theory: name, GradeLevel: grade,
			Strand: "Số và Đại số", Prerequisites: prerequisites,
		}
	}
	return []curriculumTopic{
		topic("l4-bieu-thuc-chu", "Biểu thức số và biểu thức chữ", 4, "l4-nhan-chia-so-tu-nhien"),
		topic("l4-khai-niem-phan-so", "Khái niệm phân số", 4),
		topic("l4-nhan-chia-so-tu-nhien", "Nhân, chia số tự nhiên", 4),
		topic("l4-phep-tinh-phan-so", "Cộng, trừ, nhân, chia phân số", 4, "l4-tinh-chat-phan-so", "l4-khai-niem-phan-so"),
		topic("l4-so-sanh-phan-so", "So sánh phân số", 4, "l4-tinh-chat-phan-so", "l4-khai-niem-phan-so"),
		topic("l4-tinh-chat-phan-so", "Tính chất phân số - rút gọn, quy đồng", 4, "l4-khai-niem-phan-so", "l4-nhan-chia-so-tu-nhien"),
		topic("l5-phep-tinh-so-thap-phan", "Phép tính với số thập phân", 5, "l5-so-thap-phan"),
		topic("l5-quy-dong-phan-so", "Quy đồng mẫu số và phép tính phân số khác mẫu", 5, "l4-phep-tinh-phan-so", "l4-so-sanh-phan-so"),
		topic("l5-so-thap-phan", "Số thập phân", 5, "l5-quy-dong-phan-so"),
		topic("l5-ti-so-phan-tram", "Tỉ số và tỉ số phần trăm", 5, "l5-quy-dong-phan-so"),
		topic("l6-khai-niem-so-nguyen", "Số nguyên âm - khái niệm và thứ tự", 6),
		topic("l6-luy-thua", "Phép tính số tự nhiên và luỹ thừa", 6, "l4-nhan-chia-so-tu-nhien"),
		topic("l6-phan-so-tinh-chat", "Phân số tử/mẫu nguyên và so sánh", 6, "l5-quy-dong-phan-so", "l6-phep-tinh-so-nguyen", "l6-uoc-boi"),
		topic("l6-phep-tinh-phan-so", "Phép tính với phân số mở rộng", 6, "l6-phan-so-tinh-chat", "l6-uoc-boi"),
		topic("l6-phep-tinh-so-nguyen", "Phép tính với số nguyên", 6, "l4-nhan-chia-so-tu-nhien", "l6-khai-niem-so-nguyen"),
		topic("l6-uoc-boi", "Chia hết, số nguyên tố, ước chung và bội chung", 6, "l4-nhan-chia-so-tu-nhien"),
		topic("l7-so-huu-ti-khai-niem", "Số hữu tỉ - khái niệm và thứ tự", 7, "l6-phan-so-tinh-chat", "l6-phep-tinh-so-nguyen"),
		topic("l7-phep-tinh-so-huu-ti", "Phép tính với số hữu tỉ", 7, "l7-so-huu-ti-khai-niem", "l6-phep-tinh-phan-so", "l6-luy-thua", "l6-phep-tinh-so-nguyen", "l5-phep-tinh-so-thap-phan"),
		topic("l7-can-bac-hai", "Căn bậc hai số học", 7, "l7-phep-tinh-so-huu-ti"),
		topic("l7-so-thuc", "Số vô tỉ và số thực", 7, "l7-can-bac-hai"),
		topic("l7-ti-le-thuc", "Tỉ lệ thức và dãy tỉ số bằng nhau", 7, "l7-phep-tinh-so-huu-ti", "l5-ti-so-phan-tram"),
		topic("l7-dai-luong-ti-le", "Giải toán về đại lượng tỉ lệ", 7, "l7-ti-le-thuc", "l7-phep-tinh-so-huu-ti"),
		topic("l7-bieu-thuc-dai-so", "Biểu thức đại số", 7, "l7-phep-tinh-so-huu-ti", "l4-bieu-thuc-chu"),
		topic("l7-da-thuc-mot-bien", "Đa thức một biến", 7, "l7-bieu-thuc-dai-so"),
	}
}

func resolveCurriculumClosure(catalog []curriculumTopic, targetKeys []string) (curriculumClosure, error) {
	byKey := make(map[string]curriculumTopic, len(catalog))
	for _, topic := range catalog {
		key := strings.TrimSpace(topic.StableKey)
		if key == "" {
			return curriculumClosure{}, fmt.Errorf("curriculum StableKey is required")
		}
		if _, duplicate := byKey[key]; duplicate {
			return curriculumClosure{}, fmt.Errorf("duplicate curriculum StableKey %s", key)
		}
		topic.StableKey = key
		byKey[key] = topic
	}

	state := make(map[string]int, len(catalog))
	included := make(map[string]struct{})
	var visit func(string) error
	visit = func(key string) error {
		topic, exists := byKey[key]
		if !exists {
			return fmt.Errorf("missing prerequisite %s", key)
		}
		switch state[key] {
		case 1:
			return fmt.Errorf("curriculum prerequisite cycle at %s", key)
		case 2:
			return nil
		}
		state[key] = 1
		for _, prerequisite := range topic.Prerequisites {
			if _, exists := byKey[prerequisite]; !exists {
				return fmt.Errorf("missing prerequisite %s for %s", prerequisite, key)
			}
			if err := visit(prerequisite); err != nil {
				return err
			}
		}
		state[key] = 2
		included[key] = struct{}{}
		return nil
	}

	for _, target := range targetKeys {
		if _, exists := byKey[target]; !exists {
			return curriculumClosure{}, fmt.Errorf("missing target %s", target)
		}
		if err := visit(target); err != nil {
			return curriculumClosure{}, err
		}
	}

	closure := curriculumClosure{ByStableKey: make(map[string]curriculumTopic, len(included))}
	for key := range included {
		topic := byKey[key]
		closure.Topics = append(closure.Topics, topic)
		closure.ByStableKey[key] = topic
	}
	sort.Slice(closure.Topics, func(i, j int) bool {
		if closure.Topics[i].GradeLevel == closure.Topics[j].GradeLevel {
			return closure.Topics[i].StableKey < closure.Topics[j].StableKey
		}
		return closure.Topics[i].GradeLevel < closure.Topics[j].GradeLevel
	})
	for _, target := range targetKeys {
		closure.Targets = append(closure.Targets, byKey[target])
	}
	edgeKeys := make(map[string]struct{})
	for _, topic := range closure.Topics {
		for _, prerequisite := range topic.Prerequisites {
			if _, exists := included[prerequisite]; !exists {
				continue
			}
			edge := curriculumEdge{SourceKey: prerequisite, TargetKey: topic.StableKey}
			key := edge.SourceKey + "->" + edge.TargetKey
			if _, duplicate := edgeKeys[key]; duplicate {
				continue
			}
			edgeKeys[key] = struct{}{}
			closure.Edges = append(closure.Edges, edge)
		}
	}
	sort.Slice(closure.Edges, func(i, j int) bool {
		if closure.Edges[i].SourceKey == closure.Edges[j].SourceKey {
			return closure.Edges[i].TargetKey < closure.Edges[j].TargetKey
		}
		return closure.Edges[i].SourceKey < closure.Edges[j].SourceKey
	})
	return closure, nil
}

func createSyntheticCurriculum(tx *gorm.DB, config Config, teacher model.User) (seededCurriculum, error) {
	closure, err := resolveCurriculumClosure(syntheticCurriculumCatalog(), grade7TargetKeys())
	if err != nil {
		return seededCurriculum{}, err
	}
	root := model.Node{
		ID: stableSyntheticUUID("curriculum", "root"), Subject: config.Subject, Name: config.Subject,
		Theory: "Chương trình Số và Đại số lớp 7 cùng kiến thức tiên quyết.", PosX: 500, PosY: 40,
		IsRoot: true, StableKey: "synthetic-grade7-number-algebra-root", Status: "active",
	}
	if err := tx.Create(&root).Error; err != nil {
		return seededCurriculum{}, fmt.Errorf("create synthetic curriculum root: %w", err)
	}

	result := seededCurriculum{
		Root: root, Topics: make([]model.Node, 0, len(closure.Topics)),
		Targets:     make([]model.Node, 0, len(closure.Targets)),
		ByStableKey: make(map[string]model.Node, len(closure.Topics)),
	}
	gradePosition := make(map[int]int)
	for _, topic := range closure.Topics {
		position := gradePosition[topic.GradeLevel]
		gradePosition[topic.GradeLevel] = position + 1
		node := model.Node{
			ID: stableSyntheticUUID("curriculum", topic.StableKey), Subject: config.Subject,
			Name: topic.Name, Theory: fmt.Sprintf("Lớp %d · %s", topic.GradeLevel, topic.Theory),
			PosX: float64(140 + (topic.GradeLevel-4)*240), PosY: float64(140 + position*95),
			StableKey: topic.StableKey, Status: "active",
		}
		if err := tx.Create(&node).Error; err != nil {
			return seededCurriculum{}, fmt.Errorf("create curriculum node %s: %w", topic.StableKey, err)
		}
		teacherTopic := model.Topic{
			ID: stableSyntheticUUID("curriculum-topic", topic.StableKey), TeacherID: teacher.ID,
			Name: topic.Name, Subject: config.Subject, GradeLevel: strconv.Itoa(topic.GradeLevel),
			Modes: "socratic,feynman", Published: true,
		}
		if err := tx.Create(&teacherTopic).Error; err != nil {
			return seededCurriculum{}, fmt.Errorf("create teacher topic %s: %w", topic.StableKey, err)
		}
		result.Topics = append(result.Topics, node)
		result.ByStableKey[topic.StableKey] = node
	}

	edges := make([]model.Edge, 0, len(closure.Edges)+len(closure.Topics))
	for _, edge := range closure.Edges {
		edges = append(edges, model.Edge{
			ID:      stableSyntheticUUID("curriculum-edge", edge.SourceKey, edge.TargetKey),
			Subject: config.Subject, SourceID: result.ByStableKey[edge.SourceKey].ID,
			TargetID: result.ByStableKey[edge.TargetKey].ID, Status: "active", SourceType: "synthetic",
		})
	}
	for _, topic := range closure.Topics {
		if len(topic.Prerequisites) != 0 {
			continue
		}
		edges = append(edges, model.Edge{
			ID: stableSyntheticUUID("curriculum-edge", "root", topic.StableKey), Subject: config.Subject,
			SourceID: root.ID, TargetID: result.ByStableKey[topic.StableKey].ID,
			Status: "active", SourceType: "synthetic",
		})
	}
	if len(edges) > 0 {
		if err := tx.Create(&edges).Error; err != nil {
			return seededCurriculum{}, fmt.Errorf("create synthetic curriculum edges: %w", err)
		}
	}
	for _, key := range grade7TargetKeys() {
		node, exists := result.ByStableKey[key]
		if !exists {
			return seededCurriculum{}, fmt.Errorf("missing seeded Grade 7 target %s", key)
		}
		result.Targets = append(result.Targets, node)
	}
	return result, nil
}

func curriculumNodeIDs(curriculum seededCurriculum) []uuid.UUID {
	ids := make([]uuid.UUID, 0, 1+len(curriculum.Topics))
	ids = append(ids, curriculum.Root.ID)
	for _, node := range curriculum.Topics {
		ids = append(ids, node.ID)
	}
	return ids
}
