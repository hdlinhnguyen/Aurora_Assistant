package syntheticseed

import (
	"context"
	"fmt"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type Result struct {
	Teacher       model.User
	Students      []model.User
	Subject       string
	NodeIDs       []uuid.UUID
	QuestionCount int
	ActivityCount int
}

type Service struct {
	db     *gorm.DB
	config Config
}

func New(db *gorm.DB, config Config) *Service {
	return &Service{db: db, config: config}
}

func (s *Service) ResetAndSeed(ctx context.Context) (Result, error) {
	var result Result
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := resetSyntheticData(tx, s.config); err != nil {
			return err
		}
		seeded, err := createSyntheticData(tx, s.config)
		if err != nil {
			return err
		}
		result = seeded
		return nil
	})
	return result, err
}

func resetSyntheticData(tx *gorm.DB, config Config) error {
	var users []model.User
	if err := tx.Unscoped().Where("email LIKE ?", "synthetic.%@aurora.local").Find(&users).Error; err != nil {
		return err
	}
	userIDs := make([]uuid.UUID, 0, len(users))
	for _, user := range users {
		userIDs = append(userIDs, user.ID)
	}

	var nodes []model.Node
	// Bao gồm cả dữ liệu synthetic cũ (khi đổi tên môn) qua stable_key để dọn sạch orphan.
	if err := tx.Unscoped().Where("subject = ? OR stable_key LIKE ?", config.Subject, "synthetic-%").Find(&nodes).Error; err != nil {
		return err
	}
	nodeIDs := make([]uuid.UUID, 0, len(nodes))
	for _, node := range nodes {
		nodeIDs = append(nodeIDs, node.ID)
	}

	if len(nodeIDs) > 0 {
		var questions []model.Question
		if err := tx.Unscoped().Where("node_id IN ?", nodeIDs).Find(&questions).Error; err != nil {
			return err
		}
		questionIDs := make([]uuid.UUID, 0, len(questions))
		for _, question := range questions {
			questionIDs = append(questionIDs, question.ID)
		}
		if len(questionIDs) > 0 {
			var rubricIDs []uuid.UUID
			if err := tx.Model(&model.QuestionRubricItem{}).Where("question_id IN ?", questionIDs).Pluck("id", &rubricIDs).Error; err != nil {
				return err
			}
			if len(rubricIDs) > 0 {
				if err := tx.Where("rubric_item_id IN ?", rubricIDs).Delete(&model.QuestionRubricItemTopicMapping{}).Error; err != nil {
					return err
				}
			}
			for _, deletion := range []any{&model.QuestionTopicMapping{}, &model.QuestionTaggingState{}, &model.QuestionRubricItem{}} {
				if err := tx.Where("question_id IN ?", questionIDs).Delete(deletion).Error; err != nil {
					return err
				}
			}
			if err := tx.Unscoped().Where("id IN ?", questionIDs).Delete(&model.Question{}).Error; err != nil {
				return err
			}
		}
		if err := tx.Where("topic_id IN ?", nodeIDs).Delete(&model.StudentTopicMasteryHistory{}).Error; err != nil {
			return err
		}
		if err := tx.Where("topic_id IN ?", nodeIDs).Delete(&model.StudentTopicMastery{}).Error; err != nil {
			return err
		}
		if err := tx.Where("subject = ? OR source_type = ?", config.Subject, "synthetic").Delete(&model.Edge{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("id IN ?", nodeIDs).Delete(&model.Node{}).Error; err != nil {
			return err
		}
	}

	if len(userIDs) > 0 {
		// Delete exam-related data created by these users
		var examIDs []uuid.UUID
		if err := tx.Model(&model.Exam{}).Where("created_by IN ?", userIDs).Pluck("id", &examIDs).Error; err != nil {
			return err
		}
		if len(examIDs) > 0 {
			var examQuestionIDs []uuid.UUID
			if err := tx.Model(&model.ExamQuestion{}).Where("exam_id IN ?", examIDs).Pluck("id", &examQuestionIDs).Error; err != nil {
				return err
			}
			if len(examQuestionIDs) > 0 {
				tx.Where("exam_question_id IN ?", examQuestionIDs).Delete(&model.ExamRubricItem{})
			}
			for _, del := range []any{&model.ExamExport{}, &model.ExamAuditLog{}, &model.ExamInternalEvent{}, &model.ExamGradingProgress{}, &model.ExamSnapshot{}, &model.ExamQuestion{}} {
				tx.Where("exam_id IN ?", examIDs).Delete(del)
			}
			tx.Unscoped().Where("id IN ?", examIDs).Delete(&model.Exam{})
		}

		var sessionIDs []uuid.UUID
		if err := tx.Model(&model.ChatSession{}).Where("student_id IN ?", userIDs).Pluck("id", &sessionIDs).Error; err != nil {
			return err
		}
		if len(sessionIDs) > 0 {
			if err := tx.Where("session_id IN ?", sessionIDs).Delete(&model.Message{}).Error; err != nil {
				return err
			}
		}
		for _, deletion := range []struct {
			query string
			value any
		}{
			{"student_id IN ?", &model.ChatSession{}},
			{"student_id IN ?", &model.StudentState{}},
			{"student_id IN ?", &model.ActivityLog{}},
			{"student_id IN ?", &model.StudentTopicMasteryHistory{}},
			{"student_id IN ?", &model.StudentTopicMastery{}},
			{"student_id IN ?", &model.GuardrailEvent{}},
			{"student_id IN ?", &model.LearningPath{}},
		} {
			if err := tx.Where(deletion.query, userIDs).Delete(deletion.value).Error; err != nil {
				return err
			}
		}
		if err := tx.Unscoped().Where("teacher_id IN ?", userIDs).Delete(&model.Topic{}).Error; err != nil {
			return err
		}
		// Delete classrooms owned by synthetic teachers
		if err := tx.Where("teacher_id IN ?", userIDs).Delete(&model.Classroom{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("id IN ?", userIDs).Delete(&model.User{}).Error; err != nil {
			return err
		}
	}
	return nil
}

func createSyntheticData(tx *gorm.DB, config Config) (Result, error) {
	teacher, err := createAccount(tx, config.Teacher)
	if err != nil {
		return Result{}, err
	}
	students := make([]model.User, 0, len(config.Students))

	// Create a default classroom for the synthetic teacher
	classroom := model.Classroom{
		ID:        uuid.New(),
		Name:      "Lớp Demo",
		TeacherID: teacher.ID,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := tx.Create(&classroom).Error; err != nil {
		return Result{}, fmt.Errorf("create synthetic classroom: %w", err)
	}

	for _, account := range config.Students {
		student, err := createAccount(tx, account)
		if err != nil {
			return Result{}, err
		}
		// Assign student to the synthetic classroom
		if err := tx.Model(&student).Update("classroom_id", classroom.ID).Error; err != nil {
			return Result{}, err
		}
		students = append(students, student)
	}

	nodes := []model.Node{
		{ID: uuid.New(), Subject: config.Subject, Name: config.Subject, Theory: "Khởi đầu hành trình Toán lớp 4 — chọn một bài học để bắt đầu nhé!", PosX: 400, PosY: 50, IsRoot: true, StableKey: "synthetic-root", Status: "active"},
		{ID: uuid.New(), Subject: config.Subject, Name: "Cộng phân số", Theory: "Cộng hai phân số: nếu khác mẫu thì quy đồng trước, sau đó cộng các tử số với nhau.", PosX: 250, PosY: 180, StableKey: "synthetic-fraction-add", Status: "active"},
		{ID: uuid.New(), Subject: config.Subject, Name: "Cộng phân số cùng mẫu", Theory: "Khi hai phân số đã cùng mẫu, ta chỉ việc cộng hai tử số và giữ nguyên mẫu số.", PosX: 150, PosY: 310, StableKey: "synthetic-same-denominator", Status: "active"},
		{ID: uuid.New(), Subject: config.Subject, Name: "Cộng phân số khác mẫu", Theory: "Muốn cộng hai phân số khác mẫu, trước tiên quy đồng để hai mẫu số bằng nhau, rồi cộng các tử số.", PosX: 350, PosY: 310, StableKey: "synthetic-different-denominators", Status: "active"},
		{ID: uuid.New(), Subject: config.Subject, Name: "Nhân số thập phân", Theory: "Nhân số thập phân như nhân số tự nhiên, rồi đếm tổng số chữ số ở phần thập phân của hai thừa số để đặt dấu phẩy vào tích.", PosX: 550, PosY: 180, StableKey: "synthetic-decimal-multiply", Status: "active"},
	}
	if err := tx.Create(&nodes).Error; err != nil {
		return Result{}, err
	}
	edges := []model.Edge{
		{ID: uuid.New(), Subject: config.Subject, SourceID: nodes[0].ID, TargetID: nodes[1].ID, Status: "active", SourceType: "synthetic"},
		{ID: uuid.New(), Subject: config.Subject, SourceID: nodes[1].ID, TargetID: nodes[2].ID, Status: "active", SourceType: "synthetic"},
		{ID: uuid.New(), Subject: config.Subject, SourceID: nodes[1].ID, TargetID: nodes[3].ID, Status: "active", SourceType: "synthetic"},
		{ID: uuid.New(), Subject: config.Subject, SourceID: nodes[0].ID, TargetID: nodes[4].ID, Status: "active", SourceType: "synthetic"},
	}
	if err := tx.Create(&edges).Error; err != nil {
		return Result{}, err
	}

	for _, node := range nodes[1:] {
		topic := model.Topic{ID: uuid.New(), TeacherID: teacher.ID, Name: node.Name, Subject: config.Subject, GradeLevel: "Synthetic", Modes: "socratic,feynman", Published: true}
		if err := tx.Create(&topic).Error; err != nil {
			return Result{}, err
		}
	}

	// Ngân hàng câu hỏi tiếng Việt cho từng bài (3 câu: Nhận biết / Thông hiểu / Vận dụng).
	questionBank := [][]struct {
		Content    string
		Options    string
		Correct    int
		Difficulty string
	}{
		{ // Cộng phân số
			{"Để cộng hai phân số khác mẫu, bước quan trọng đầu tiên là gì?", `["Quy đồng để hai mẫu số bằng nhau","Cộng thẳng tử với tử, mẫu với mẫu","Nhân hai mẫu số lại với nhau","Bỏ mẫu số đi rồi cộng"]`, 0, "easy"},
			{"1/2 + 1/2 bằng bao nhiêu?", `["1/4","2/4","1","1/2"]`, 2, "medium"},
			{"An ăn 1/3 cái bánh, Bình ăn 1/3 cái bánh. Cả hai ăn hết mấy phần cái bánh?", `["2/3","2/6","1/3","1/6"]`, 0, "hard"},
		},
		{ // Cộng phân số cùng mẫu
			{"2/5 + 1/5 bằng bao nhiêu?", `["3/5","3/10","2/10","1/5"]`, 0, "easy"},
			{"Khi cộng hai phân số cùng mẫu, ta làm gì với mẫu số?", `["Giữ nguyên mẫu số","Cộng hai mẫu số lại","Nhân hai mẫu số","Đổi sang mẫu số khác"]`, 0, "medium"},
			{"3/7 + 2/7 + 1/7 bằng bao nhiêu?", `["6/7","6/21","5/7","6/14"]`, 0, "hard"},
		},
		{ // Cộng phân số khác mẫu
			{"Muốn cộng 1/2 + 1/3, việc đầu tiên cần làm là gì?", `["Quy đồng về mẫu số chung là 6","Cộng thẳng thành 2/5","Nhân hai tử số với nhau","Giữ nguyên rồi cộng hai tử"]`, 0, "easy"},
			{"Sau khi quy đồng, 1/2 + 1/3 bằng bao nhiêu?", `["5/6","2/5","3/5","1/6"]`, 0, "medium"},
			{"1/4 + 1/6 bằng bao nhiêu?", `["5/12","2/10","1/5","2/24"]`, 0, "hard"},
		},
		{ // Nhân số thập phân
			{"0,2 × 3 bằng bao nhiêu?", `["0,6","6","0,06","2,3"]`, 0, "easy"},
			{"0,5 × 0,4 bằng bao nhiêu?", `["0,20","2,0","0,9","0,02"]`, 0, "medium"},
			{"Khi nhân 1,25 × 0,4, tích có mấy chữ số ở phần thập phân?", `["3 chữ số","1 chữ số","2 chữ số","0 chữ số"]`, 0, "hard"},
		},
	}

	questionsByNode := make(map[uuid.UUID][]model.Question)
	questionCount := 0
	for nodeIndex, node := range nodes[1:] {
		bank := questionBank[nodeIndex]
		questions := make([]model.Question, 0, len(bank))
		for _, item := range bank {
			question := model.Question{
				ID: uuid.New(), NodeID: node.ID,
				Content:     item.Content,
				OptionsJSON: item.Options, CorrectOption: item.Correct,
				Difficulty: item.Difficulty, QuestionType: "multiple_choice", GradeLevel: "Lớp 4",
			}
			questions = append(questions, question)
		}
		if err := tx.Create(&questions).Error; err != nil {
			return Result{}, err
		}
		questionsByNode[node.ID] = questions
		questionCount += len(questions)
	}

	baseTime := time.Now().UTC().Add(-2 * time.Hour).Truncate(time.Minute)
	activityCount := 0
	for studentIndex, student := range students {
		state := model.StudentState{ID: uuid.New(), StudentID: student.ID, Subject: config.Subject, InitialLevelNodeID: nodes[0].ID, CurrentLevelNodeID: nodes[1].ID}
		if err := tx.Create(&state).Error; err != nil {
			return Result{}, err
		}
		session := model.ChatSession{ID: uuid.New(), StudentID: student.ID, Topic: nodes[1].Name, Status: "active", Mode: "socratic"}
		if err := tx.Create(&session).Error; err != nil {
			return Result{}, err
		}
		message := model.Message{ID: uuid.New(), SessionID: session.ID, Sender: "student", Content: "Phiên học tập mẫu", IsCorrectStep: true, CreatedAt: baseTime}
		if err := tx.Create(&message).Error; err != nil {
			return Result{}, err
		}

		for topicIndex, node := range nodes[1:4] {
			questions := questionsByNode[node.ID]
			for _, attempt := range GenerateAttempts(config.Seed, studentIndex, topicIndex, len(questions)) {
				action := "answer_incorrect"
				if attempt.Correct {
					action = "answer_correct"
				}
				entry := model.ActivityLog{
					ID: uuid.New(), StudentID: student.ID, Subject: config.Subject, NodeID: node.ID,
					Action: action, Detail: fmt.Sprintf("Synthetic answer for %s", questions[attempt.QuestionIndex].ID),
					CreatedAt: baseTime.Add(time.Duration(studentIndex)*time.Hour + attempt.OccurredAtOffset),
				}
				if err := tx.Create(&entry).Error; err != nil {
					return Result{}, err
				}
				activityCount++
			}
		}
	}

	nodeIDs := make([]uuid.UUID, 0, len(nodes))
	for _, node := range nodes {
		nodeIDs = append(nodeIDs, node.ID)
	}
	return Result{Teacher: teacher, Students: students, Subject: config.Subject, NodeIDs: nodeIDs, QuestionCount: questionCount, ActivityCount: activityCount}, nil
}

func createAccount(tx *gorm.DB, account Account) (model.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(account.Password), bcrypt.DefaultCost)
	if err != nil {
		return model.User{}, err
	}
	user := model.User{ID: uuid.New(), Email: account.Email, Password: string(hash), Name: account.Name, Role: account.Role}
	return user, tx.Create(&user).Error
}

func studentIDs(students []model.User) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(students))
	for _, student := range students {
		ids = append(ids, student.ID)
	}
	return ids
}
