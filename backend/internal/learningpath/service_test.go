package learningpath

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	masteryprofile "backend/internal/mastery"
	"backend/internal/model"
	"backend/internal/telemetry"
	"backend/internal/testutil"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type fakeMasteryReader struct {
	states map[uuid.UUID][2]float64
}

type recordingPublisher struct {
	events []telemetry.Event
}

type fakeMasteryRecalculator struct {
	profile masteryprofile.Profile
}

func (f fakeMasteryRecalculator) RecalculateStudent(context.Context, uuid.UUID, string) (masteryprofile.Profile, error) {
	return f.profile, nil
}

func (p *recordingPublisher) PublishActor(_ context.Context, _ uuid.UUID, _ string, event telemetry.Event) (telemetry.PublishResult, error) {
	p.events = append(p.events, event)
	return telemetry.PublishResult{}, nil
}

func (f fakeMasteryReader) TopicMastery(_ context.Context, _ uuid.UUID, topicID uuid.UUID) (float64, float64, bool, error) {
	state, ok := f.states[topicID]
	return state[0], state[1], ok, nil
}

func TestInitializeIsIdempotentAndActivatesFirstStep(t *testing.T) {
	db := setupLearningPathDB(t)
	studentID, path, topics := seedApprovedPath(t, db, 3)
	svc := NewService(db, nil, fakeMasteryReader{})

	require.NoError(t, svc.Initialize(context.Background(), &path))
	require.NoError(t, svc.Initialize(context.Background(), &path))

	var rows []model.LearningPathStepProgress
	require.NoError(t, db.Where("learning_path_id = ?", path.ID).Order("step_order").Find(&rows).Error)
	require.Len(t, rows, 3)
	require.Equal(t, studentID, rows[0].StudentID)
	require.Equal(t, topics[0], rows[0].TopicID)
	require.Equal(t, StatusInProgress, rows[0].Status)
	require.Equal(t, StatusPending, rows[1].Status)
}

func TestApplyEvidenceCompletesAndUnlocksNextStep(t *testing.T) {
	db := setupLearningPathDB(t)
	studentID, path, topics := seedApprovedPath(t, db, 3)
	svc := NewService(db, nil, fakeMasteryReader{})
	require.NoError(t, svc.Initialize(context.Background(), &path))

	got, err := svc.ApplyEvidence(context.Background(), ApplyEvidenceInput{
		StudentID: studentID, TopicID: topics[0], Kind: EvidenceAnswer,
		Correct: true, Mastery: ptrFloat(.80), Confidence: ptrFloat(.60),
	})
	require.NoError(t, err)
	require.Equal(t, StatusCompleted, got.Status)
	require.Equal(t, 1, got.Attempts)
	require.Equal(t, 1, got.CorrectAnswers)

	var next model.LearningPathStepProgress
	require.NoError(t, db.Where("learning_path_id = ? AND step_order = ?", path.ID, 1).First(&next).Error)
	require.Equal(t, StatusInProgress, next.Status)
}

func TestApplyEvidenceBlocksAfterThreeLowAccuracyAttempts(t *testing.T) {
	db := setupLearningPathDB(t)
	studentID, path, topics := seedApprovedPath(t, db, 2)
	svc := NewService(db, nil, fakeMasteryReader{})
	require.NoError(t, svc.Initialize(context.Background(), &path))

	for i := 0; i < 3; i++ {
		_, err := svc.ApplyEvidence(context.Background(), ApplyEvidenceInput{
			StudentID: studentID, TopicID: topics[0], Kind: EvidenceAnswer,
			Correct: i == 2, Mastery: ptrFloat(.40), Confidence: ptrFloat(.40),
		})
		require.NoError(t, err)
	}

	var row model.LearningPathStepProgress
	require.NoError(t, db.Where("learning_path_id = ? AND topic_id = ?", path.ID, topics[0]).First(&row).Error)
	require.Equal(t, StatusBlocked, row.Status)
	require.NotNil(t, row.BlockedReason)
	require.Equal(t, BlockedReasonLowAccuracy, *row.BlockedReason)
}

func TestGetStudentProgressLazilyInitializesAndReturnsNextStep(t *testing.T) {
	db := setupLearningPathDB(t)
	studentID, _, topics := seedApprovedPath(t, db, 2)
	svc := NewService(db, nil, fakeMasteryReader{})

	got, err := svc.GetStudentProgress(context.Background(), studentID)
	require.NoError(t, err)
	require.Equal(t, 0, got.CompletedSteps)
	require.Equal(t, 2, got.TotalSteps)
	require.Equal(t, 0, got.CompletionPercent)
	require.NotNil(t, got.NextStep)
	require.Equal(t, topics[0], got.NextStep.TopicID)
	require.Equal(t, StatusInProgress, got.NextStep.Status)
	require.Len(t, got.Steps, 2)
	require.Equal(t, "Bổ sung nền tảng", got.OrderedSteps[0]["inclusion_reason"])
}

func TestStartStepRejectsPendingStepAndIsIdempotentForActiveStep(t *testing.T) {
	db := setupLearningPathDB(t)
	studentID, path, topics := seedApprovedPath(t, db, 2)
	svc := NewService(db, nil, fakeMasteryReader{})
	require.NoError(t, svc.Initialize(context.Background(), &path))

	_, err := svc.StartStep(context.Background(), studentID, topics[1])
	require.ErrorIs(t, err, ErrPrerequisiteIncomplete)

	first, err := svc.StartStep(context.Background(), studentID, topics[0])
	require.NoError(t, err)
	second, err := svc.StartStep(context.Background(), studentID, topics[0])
	require.NoError(t, err)
	require.Equal(t, first.TopicID, second.TopicID)
	require.Equal(t, first.Status, second.Status)
	require.Equal(t, first.Attempts, second.Attempts)
	require.NotNil(t, first.StartedAt)
	require.NotNil(t, second.StartedAt)
}

func TestInitializeCompletesQualifiedStepsBeforeActivatingNext(t *testing.T) {
	db := setupLearningPathDB(t)
	_, path, topics := seedApprovedPath(t, db, 3)
	svc := NewService(db, nil, fakeMasteryReader{states: map[uuid.UUID][2]float64{
		topics[0]: {.80, .60},
	}})

	require.NoError(t, svc.Initialize(context.Background(), &path))

	var rows []model.LearningPathStepProgress
	require.NoError(t, db.Where("learning_path_id = ?", path.ID).Order("step_order").Find(&rows).Error)
	require.Equal(t, StatusCompleted, rows[0].Status)
	require.Equal(t, StatusInProgress, rows[1].Status)
	require.Equal(t, StatusPending, rows[2].Status)
}

func TestInitializeRejectsDuplicateTopics(t *testing.T) {
	db := setupLearningPathDB(t)
	studentID, path, topics := seedApprovedPath(t, db, 2)
	raw, err := json.Marshal(map[string]any{"ordered_steps": []map[string]any{
		{"order": 0, "topic_id": topics[0].String()},
		{"order": 1, "topic_id": topics[0].String()},
	}})
	require.NoError(t, err)
	path.StudentID = studentID
	path.StepsJSON = string(raw)
	require.NoError(t, db.Save(&path).Error)

	err = NewService(db, nil, fakeMasteryReader{}).Initialize(context.Background(), &path)
	require.ErrorIs(t, err, ErrDuplicateTopic)
}

func TestGetTeacherProgressRequiresOwnedClassAndStudentMembership(t *testing.T) {
	db := setupLearningPathDB(t)
	studentID, path, _ := seedApprovedPath(t, db, 2)
	classID := uuid.MustParse(path.ClassID)
	teacherID := path.TeacherID
	require.NoError(t, db.Create(&model.User{ID: teacherID, Email: uuid.NewString() + "@test.local", Password: "x", Role: "teacher"}).Error)
	require.NoError(t, db.Create(&model.Classroom{ID: classID, Name: "7A", TeacherID: teacherID}).Error)
	require.NoError(t, db.Create(&model.User{ID: studentID, Email: uuid.NewString() + "@test.local", Password: "x", Role: "student", ClassroomID: &classID}).Error)
	svc := NewService(db, nil, fakeMasteryReader{})

	got, err := svc.GetTeacherProgress(context.Background(), teacherID, classID, studentID)
	require.NoError(t, err)
	require.Equal(t, 2, got.TotalSteps)

	_, err = svc.GetTeacherProgress(context.Background(), uuid.New(), classID, studentID)
	require.ErrorIs(t, err, ErrForbidden)
}

func TestApplyEvidencePublishesCompletionWithoutLearningContent(t *testing.T) {
	db := setupLearningPathDB(t)
	studentID, path, topics := seedApprovedPath(t, db, 1)
	publisher := &recordingPublisher{}
	svc := NewService(db, publisher, fakeMasteryReader{})
	require.NoError(t, svc.Initialize(context.Background(), &path))

	_, err := svc.ApplyEvidence(context.Background(), ApplyEvidenceInput{
		StudentID: studentID, TopicID: topics[0], Kind: EvidenceAnswer, Correct: true,
		Mastery: ptrFloat(.80), Confidence: ptrFloat(.60),
	})
	require.NoError(t, err)
	require.Len(t, publisher.events, 1)
	require.Equal(t, "learning_path_step_completed", publisher.events[0].Name)
	require.Equal(t, topics[0].String(), publisher.events[0].TopicID)
	require.Equal(t, 1, publisher.events[0].Properties["attempt_count"])
	require.NotContains(t, publisher.events[0].Properties, "question_content")
	require.NotContains(t, publisher.events[0].Properties, "hint_text")
}

func TestApplyEvidenceLoadsLatestMasteryWhenSnapshotsAreOmitted(t *testing.T) {
	db := setupLearningPathDB(t)
	studentID, path, topics := seedApprovedPath(t, db, 1)
	states := map[uuid.UUID][2]float64{}
	svc := NewService(db, nil, fakeMasteryReader{states: states})
	require.NoError(t, svc.Initialize(context.Background(), &path))
	states[topics[0]] = [2]float64{.80, .60}

	got, err := svc.ApplyEvidence(context.Background(), ApplyEvidenceInput{
		StudentID: studentID, TopicID: topics[0], Kind: EvidenceAnswer, Correct: true,
	})
	require.NoError(t, err)
	require.Equal(t, StatusCompleted, got.Status)
	require.NotNil(t, got.MasteryAfter)
	require.NotNil(t, got.ConfidenceAfter)
}

func TestDatabaseMasteryReaderReturnsPersistedTopicState(t *testing.T) {
	db := setupLearningPathDB(t)
	studentID, topicID := uuid.New(), uuid.New()
	require.NoError(t, db.AutoMigrate(&model.StudentTopicMastery{}))
	require.NoError(t, db.Create(&model.StudentTopicMastery{
		ID: uuid.New(), StudentID: studentID, TopicID: topicID,
		MasteryProbability: .82, ConfidenceScore: .67, MasteryStatus: "mastered",
		EvidenceSummaryJSON: "{}", SourceBreakdownJSON: "{}", Version: 1,
	}).Error)

	mastery, confidence, found, err := NewDatabaseMasteryReader(db, nil).TopicMastery(context.Background(), studentID, topicID)
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, .82, mastery)
	require.Equal(t, .67, confidence)
}

func TestDatabaseMasteryReaderRefreshesTopicFromNewEvidence(t *testing.T) {
	db := setupLearningPathDB(t)
	studentID, topicID := uuid.New(), uuid.New()
	require.NoError(t, db.AutoMigrate(&model.Node{}))
	require.NoError(t, db.Create(&model.Node{ID: topicID, Subject: "Toán", Name: "Phân số"}).Error)
	recalculator := fakeMasteryRecalculator{profile: masteryprofile.Profile{Topics: map[string]masteryprofile.TopicState{
		topicID.String(): {TopicID: topicID, MasteryProbability: .83, ConfidenceScore: .64},
	}}}

	mastery, confidence, found, err := NewDatabaseMasteryReader(db, recalculator).RefreshTopicMastery(context.Background(), studentID, topicID)
	require.NoError(t, err)
	require.True(t, found)
	require.Equal(t, .83, mastery)
	require.Equal(t, .64, confidence)
}

func setupLearningPathDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := testutil.OpenPostgres(t)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Classroom{}, &model.LearningPath{}, &model.LearningPathStepProgress{}))
	return db
}

func seedApprovedPath(t *testing.T, db *gorm.DB, count int) (uuid.UUID, model.LearningPath, []uuid.UUID) {
	t.Helper()
	studentID := uuid.New()
	path := model.LearningPath{
		ID: uuid.New(), StudentID: studentID, TeacherID: uuid.New(), ClassID: uuid.NewString(),
		ThreadID: uuid.NewString(), Status: "Approved", CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
	}
	steps := make([]map[string]any, 0, count)
	topics := make([]uuid.UUID, 0, count)
	for i := 0; i < count; i++ {
		topicID := uuid.New()
		topics = append(topics, topicID)
		steps = append(steps, map[string]any{"order": i, "topic_id": topicID.String(), "inclusion_reason": "Bổ sung nền tảng"})
	}
	payload := map[string]any{"ordered_steps": steps}
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	path.StepsJSON = string(raw)
	require.NoError(t, db.Create(&path).Error)
	return studentID, path, topics
}

func ptrFloat(value float64) *float64 { return &value }
