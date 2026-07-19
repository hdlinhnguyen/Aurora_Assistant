package mastery

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"backend/internal/model"
	"backend/internal/telemetry"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type StateStore interface {
	UpsertStates(context.Context, []TopicState) error
	GetProfile(context.Context, uuid.UUID, string) (Profile, error)
	GetHistory(context.Context, uuid.UUID, uuid.UUID, string) ([]HistoryPoint, error)
}

const initialMasteryProbability = 0.30

type Service struct {
	db             *gorm.DB
	store          StateStore
	calculator     Calculator
	subjectTopics  func(context.Context, uuid.UUID, string) ([]uuid.UUID, error)
	evidence       func(context.Context, uuid.UUID, string) ([]QuizEvidence, error)
	currentProfile func(context.Context, uuid.UUID, string) (Profile, error)
	publisher      telemetry.ActorPublisher
}

type Option func(*Service)

func WithTelemetryPublisher(publisher telemetry.ActorPublisher) Option {
	return func(service *Service) {
		service.publisher = publisher
	}
}

func NewService(db *gorm.DB, store StateStore, calculator Calculator, options ...Option) *Service {
	svc := &Service{db: db, store: store, calculator: calculator}
	svc.subjectTopics = svc.loadSubjectTopics
	svc.evidence = svc.loadEvidence
	svc.currentProfile = store.GetProfile
	for _, option := range options {
		option(svc)
	}
	return svc
}

func (s *Service) GetProfile(ctx context.Context, studentID uuid.UUID, subject string) (Profile, error) {
	profile, err := s.store.GetProfile(ctx, studentID, subject)
	if err != nil {
		return Profile{}, err
	}
	topicIDs, err := s.subjectTopics(ctx, studentID, subject)
	if err != nil {
		return Profile{}, err
	}
	if profile.Topics == nil {
		profile.Topics = map[string]TopicState{}
	}
	profile.StudentID = studentID
	profile.Subject = subject
	calculatedAt := profile.CalculatedAt
	if calculatedAt.IsZero() {
		calculatedAt = time.Now().UTC()
		profile.CalculatedAt = calculatedAt
	}
	for _, topicID := range topicIDs {
		if _, exists := profile.Topics[topicID.String()]; !exists {
			profile.Topics[topicID.String()] = priorTopicState(studentID, topicID, calculatedAt)
		}
	}
	return profile, nil
}

func (s *Service) GetHistory(ctx context.Context, studentID, topicID uuid.UUID, historyRange string) ([]HistoryPoint, error) {
	return s.store.GetHistory(ctx, studentID, topicID, historyRange)
}

func (s *Service) CanTeacherView(ctx context.Context, teacherID, studentID uuid.UUID) error {
	var teacherCount, relationshipCount int64
	if err := s.db.WithContext(ctx).Model(&model.User{}).Where("id = ? AND role = ?", teacherID, "teacher").Count(&teacherCount).Error; err != nil {
		return err
	}
	if err := s.db.WithContext(ctx).Model(&model.User{}).
		Joins("JOIN classrooms ON classrooms.id = users.classroom_id").
		Where("users.id = ? AND users.role = ? AND classrooms.teacher_id = ?", studentID, "student", teacherID).
		Count(&relationshipCount).Error; err != nil {
		return err
	}
	if teacherCount != 1 || relationshipCount != 1 {
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
	profile := Profile{StudentID: studentID, Subject: subject, CalculatedAt: now, Topics: map[string]TopicState{}}
	for topicKey, payload := range result.States {
		topicID, err := uuid.Parse(topicKey)
		if err != nil {
			return Profile{}, fmt.Errorf("invalid topic id %q: %w", topicKey, err)
		}
		state, err := payloadToState(payload, studentID, topicID, versions[topicKey])
		if err != nil {
			return Profile{}, err
		}
		profile.Topics[topicKey] = state
		if state.EvidenceCount > 0 {
			states = append(states, state)
		}
	}
	if err := s.store.UpsertStates(ctx, states); err != nil {
		return Profile{}, err
	}
	s.publishDecision(ctx, studentID, subject, current, states, now)
	return profile, nil
}

func (s *Service) publishDecision(
	ctx context.Context,
	studentID uuid.UUID,
	subject string,
	current Profile,
	states []TopicState,
	calculatedAt time.Time,
) {
	if s.publisher == nil {
		return
	}
	totalEvidence := 0
	totalConfidence := 0.0
	for _, state := range states {
		totalEvidence += state.EvidenceCount
		totalConfidence += state.ConfidenceScore
	}
	meanConfidence := 0.0
	if len(states) > 0 {
		meanConfidence = totalConfidence / float64(len(states))
	}
	calculated := telemetry.Event{
		EventID: uuid.NewString(), Name: "mastery_calculated", SchemaVersion: telemetry.CurrentSchemaVersion,
		OccurredAt: calculatedAt, Source: "go_backend", ConsentState: "required", RetentionClass: "decision",
		Properties: map[string]any{
			"subject": subject, "topic_count": len(states), "evidence_count": totalEvidence,
			"confidence_mean": meanConfidence, "model_version": "bkt-v1",
		},
	}
	_, _ = s.publisher.PublishActor(ctx, studentID, "student", calculated)
	for _, state := range states {
		before := StatusUnknown
		if previous, exists := current.Topics[state.TopicID.String()]; exists && previous.Status != "" {
			before = previous.Status
		}
		if before == state.Status {
			continue
		}
		changed := telemetry.Event{
			EventID: uuid.NewString(), Name: "mastery_status_changed", SchemaVersion: telemetry.CurrentSchemaVersion,
			OccurredAt: calculatedAt, TopicID: state.TopicID.String(), Source: "go_backend",
			ConsentState: "required", RetentionClass: "decision",
			Properties: map[string]any{
				"status_before": before, "status_after": state.Status,
				"mastery_probability": state.MasteryProbability, "confidence_score": state.ConfidenceScore,
			},
		}
		_, _ = s.publisher.PublishActor(ctx, studentID, "student", changed)
	}
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

func priorTopicState(studentID, topicID uuid.UUID, calculatedAt time.Time) TopicState {
	return TopicState{
		StudentID:          studentID,
		TopicID:            topicID,
		MasteryProbability: initialMasteryProbability,
		ConfidenceScore:    0,
		Consistency:        1,
		EvidenceCount:      0,
		EffectiveEvidence:  0,
		Status:             StatusUnknown,
		EvidenceSummary:    map[string]float64{},
		SourceBreakdown:    map[string]int{},
		Version:            1,
		CalculatedAt:       calculatedAt,
	}
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
	attemptsByQuestion := map[string]int{}
	for _, log := range logs {
		score := 0.0
		if log.Action == "answer_correct" {
			score = 1
		}
		questionID := markerValue(log.Detail, "question_id")
		if questionID == "" {
			questionID = log.ID.String()
		}
		attemptsByQuestion[questionID]++
		difficulty := markerValue(log.Detail, "difficulty")
		if difficulty == "" {
			difficulty = "medium"
		}
		result = append(result, QuizEvidence{
			EvidenceID: log.ID.String(), StudentID: studentID, SessionID: "activity-log",
			QuestionID: questionID, TopicID: log.NodeID, Score: score, AttemptNumber: attemptsByQuestion[questionID],
			GradingMethod: "auto", OccurredAt: log.CreatedAt,
			InferenceWeight: inferenceWeightFromActivityDetail(log.Detail),
			Difficulty:      difficulty,
		})
	}
	return result, nil
}

func markerValue(detail, name string) string {
	marker := "[" + name + "="
	start := strings.Index(detail, marker)
	if start < 0 {
		return ""
	}
	start += len(marker)
	end := strings.IndexByte(detail[start:], ']')
	if end < 0 {
		return ""
	}
	return strings.TrimSpace(detail[start : start+end])
}

func decodeJSON[T any](raw string, target *T) error { return json.Unmarshal([]byte(raw), target) }

func inferenceWeightFromActivityDetail(detail string) float64 {
	const marker = "[inference_weight="
	start := strings.Index(detail, marker)
	if start < 0 {
		return 1
	}
	start += len(marker)
	end := strings.IndexByte(detail[start:], ']')
	if end < 0 {
		return 1
	}
	weight, err := strconv.ParseFloat(detail[start:start+end], 64)
	if err != nil || weight <= 0 || weight > 1 {
		return 1
	}
	return weight
}
