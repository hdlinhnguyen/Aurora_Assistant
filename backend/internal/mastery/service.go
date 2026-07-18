package mastery

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type StateStore interface {
	UpsertStates(context.Context, []TopicState) error
	GetProfile(context.Context, uuid.UUID, string) (Profile, error)
	GetHistory(context.Context, uuid.UUID, uuid.UUID, string) ([]HistoryPoint, error)
}

type Service struct {
	db             *gorm.DB
	store          StateStore
	calculator     Calculator
	subjectTopics  func(context.Context, uuid.UUID, string) ([]uuid.UUID, error)
	evidence       func(context.Context, uuid.UUID, string) ([]QuizEvidence, error)
	currentProfile func(context.Context, uuid.UUID, string) (Profile, error)
}

func NewService(db *gorm.DB, store StateStore, calculator Calculator) *Service {
	svc := &Service{db: db, store: store, calculator: calculator}
	svc.subjectTopics = svc.loadSubjectTopics
	svc.evidence = svc.loadEvidence
	svc.currentProfile = store.GetProfile
	return svc
}

func (s *Service) GetProfile(ctx context.Context, studentID uuid.UUID, subject string) (Profile, error) {
	return s.store.GetProfile(ctx, studentID, subject)
}

func (s *Service) GetHistory(ctx context.Context, studentID, topicID uuid.UUID, historyRange string) ([]HistoryPoint, error) {
	return s.store.GetHistory(ctx, studentID, topicID, historyRange)
}

func (s *Service) CanTeacherView(ctx context.Context, teacherID, studentID uuid.UUID) error {
	var teacherCount, studentCount int64
	if err := s.db.WithContext(ctx).Model(&model.User{}).Where("id = ? AND role = ?", teacherID, "teacher").Count(&teacherCount).Error; err != nil {
		return err
	}
	if err := s.db.WithContext(ctx).Model(&model.User{}).Where("id = ? AND role = ?", studentID, "student").Count(&studentCount).Error; err != nil {
		return err
	}
	if teacherCount != 1 || studentCount != 1 {
		return ErrForbidden
	}
	return nil
}

func (s *Service) RecalculateStudent(ctx context.Context, studentID uuid.UUID, subject string) (Profile, error) {
	topicIDs, err := s.subjectTopics(ctx, studentID, subject)
	if err != nil {
		return Profile{}, err
	}
	evidence, err := s.evidence(ctx, studentID, subject)
	if err != nil {
		return Profile{}, err
	}
	now := time.Now().UTC()
	result, err := s.calculator.Calculate(ctx, CalculateRequest{
		StudentID: studentID.String(), TopicIDs: topicIDs, RawQuiz: evidence, RawPaper: []any{}, AsOf: now,
	})
	if err != nil {
		return Profile{}, err
	}
	current, err := s.currentProfile(ctx, studentID, subject)
	if err != nil {
		return Profile{}, err
	}
	versions := nextVersions(current.Topics)
	states := make([]TopicState, 0, len(result.States))
	for topicKey, payload := range result.States {
		topicID, err := uuid.Parse(topicKey)
		if err != nil {
			return Profile{}, fmt.Errorf("invalid topic id %q: %w", topicKey, err)
		}
		if payload.EvidenceCount == 0 {
			continue
		}
		state, err := payloadToState(payload, studentID, topicID, versions[topicKey])
		if err != nil {
			return Profile{}, err
		}
		states = append(states, state)
	}
	if err := s.store.UpsertStates(ctx, states); err != nil {
		return Profile{}, err
	}
	profile := Profile{StudentID: studentID, Subject: subject, CalculatedAt: now, Topics: map[string]TopicState{}}
	for _, state := range states {
		profile.Topics[state.TopicID.String()] = state
	}
	return profile, nil
}

func nextVersions(current map[string]TopicState) map[string]int {
	versions := make(map[string]int, len(current))
	for key, state := range current {
		versions[key] = state.Version + 1
	}
	return versions
}

func payloadToState(payload TopicStatePayload, studentID, topicID uuid.UUID, version int) (TopicState, error) {
	calculatedAt := time.Now().UTC()
	if version < 1 {
		version = payload.Version
	}
	state := TopicState{StudentID: studentID, TopicID: topicID, MasteryProbability: payload.MasteryProbability, ConfidenceScore: payload.ConfidenceScore, Consistency: payload.Consistency, EvidenceCount: payload.EvidenceCount, EffectiveEvidence: payload.EffectiveEvidence, Status: payload.MasteryStatus, EvidenceSummary: payload.EvidenceSummary, SourceBreakdown: payload.SourceBreakdown, Version: version, LastEvidenceAt: payload.LastEvidenceAt, CalculatedAt: calculatedAt}
	if err := ValidateState(state); err != nil {
		return TopicState{}, err
	}
	return state, nil
}

func (s *Service) loadSubjectTopics(ctx context.Context, _ uuid.UUID, subject string) ([]uuid.UUID, error) {
	var nodes []model.Node
	if err := s.db.WithContext(ctx).Where("subject = ?", subject).Order("id").Find(&nodes).Error; err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, 0, len(nodes))
	for _, node := range nodes {
		ids = append(ids, node.ID)
	}
	return ids, nil
}

func (s *Service) loadEvidence(ctx context.Context, studentID uuid.UUID, subject string) ([]QuizEvidence, error) {
	var logs []model.ActivityLog
	if err := s.db.WithContext(ctx).Where("student_id = ? AND subject = ? AND action IN ?", studentID, subject, []string{"answer_correct", "answer_incorrect"}).Order("created_at").Find(&logs).Error; err != nil {
		return nil, err
	}
	result := make([]QuizEvidence, 0, len(logs))
	for _, log := range logs {
		score := 0.0
		if log.Action == "answer_correct" {
			score = 1
		}
		result = append(result, QuizEvidence{EvidenceID: log.ID.String(), StudentID: studentID, SessionID: "activity-log", QuestionID: log.ID.String(), TopicID: log.NodeID, Score: score, AttemptNumber: 1, GradingMethod: "auto", OccurredAt: log.CreatedAt})
	}
	return result, nil
}

func decodeJSON[T any](raw string, target *T) error { return json.Unmarshal([]byte(raw), target) }
