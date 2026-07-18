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
	Teacher                 model.User
	Students                []model.User
	Subject                 string
	NodeIDs                 []uuid.UUID
	QuestionCount           int
	ActivityCount           int
	ExamCount               int
	ApprovedSubmissionCount int
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
	if err := resetHistoricalExamData(tx, userIDs); err != nil {
		return err
	}

	var nodes []model.Node
	if err := tx.Unscoped().Where("subject = ?", config.Subject).Find(&nodes).Error; err != nil {
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
		if err := tx.Where("subject = ?", config.Subject).Delete(&model.Edge{}).Error; err != nil {
			return err
		}
		if err := tx.Unscoped().Where("id IN ?", nodeIDs).Delete(&model.Node{}).Error; err != nil {
			return err
		}
	}

	if len(userIDs) > 0 {
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
	for _, account := range config.Students {
		student, err := createAccount(tx, account)
		if err != nil {
			return Result{}, err
		}
		students = append(students, student)
	}

	curriculum, err := createSyntheticCurriculum(tx, config, teacher)
	if err != nil {
		return Result{}, err
	}

	questionsByNode := make(map[uuid.UUID][]model.Question)
	questionCount := 0
	for nodeIndex, node := range curriculum.Targets {
		questions := make([]model.Question, 0, 3)
		for questionIndex := 0; questionIndex < 3; questionIndex++ {
			question := model.Question{
				ID: uuid.New(), NodeID: node.ID,
				Content:     fmt.Sprintf("Synthetic question %d.%d", nodeIndex+1, questionIndex+1),
				OptionsJSON: `["Option A","Option B","Option C","Option D"]`, CorrectOption: questionIndex % 4,
				Difficulty: []string{"easy", "medium", "hard"}[questionIndex], QuestionType: "multiple_choice", GradeLevel: "7",
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
		state := model.StudentState{ID: uuid.New(), StudentID: student.ID, Subject: config.Subject, InitialLevelNodeID: curriculum.Root.ID, CurrentLevelNodeID: curriculum.Targets[0].ID}
		if err := tx.Create(&state).Error; err != nil {
			return Result{}, err
		}
		session := model.ChatSession{ID: uuid.New(), StudentID: student.ID, Topic: curriculum.Targets[0].Name, Status: "active", Mode: "socratic"}
		if err := tx.Create(&session).Error; err != nil {
			return Result{}, err
		}
		message := model.Message{ID: uuid.New(), SessionID: session.ID, Sender: "student", Content: "Synthetic learning session", IsCorrectStep: true, CreatedAt: baseTime}
		if err := tx.Create(&message).Error; err != nil {
			return Result{}, err
		}

		for topicIndex, node := range curriculum.Targets[:3] {
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

	nodeIDs := curriculumNodeIDs(curriculum)
	targetNodeIDs := make([]uuid.UUID, 0, len(curriculum.Targets))
	for _, node := range curriculum.Targets {
		targetNodeIDs = append(targetNodeIDs, node.ID)
	}
	exams, approvedCount, err := createHistoricalExamData(
		tx, config, teacher, students, targetNodeIDs, time.Now().UTC().Truncate(time.Minute),
	)
	if err != nil {
		return Result{}, err
	}
	return Result{
		Teacher: teacher, Students: students, Subject: config.Subject, NodeIDs: nodeIDs,
		QuestionCount: questionCount, ActivityCount: activityCount,
		ExamCount: len(exams), ApprovedSubmissionCount: approvedCount,
	}, nil
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
