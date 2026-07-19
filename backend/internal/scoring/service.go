package scoring

import (
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"backend/internal/exam"
	"backend/internal/model"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ExamGatewayFactory func(*gorm.DB) exam.ScoringGateway

type Service struct {
	repository *Repository
	gateway    ExamGatewayFactory
}

func NewService(repository *Repository, gateway ExamGatewayFactory) *Service {
	return &Service{repository: repository, gateway: gateway}
}

func (s *Service) CreateBatch(actor uuid.UUID, input CreateBatchInput) (*BatchDetail, error) {
	if actor == uuid.Nil || input.ExamID == uuid.Nil || input.ExpectedExamVersion < 1 ||
		strings.TrimSpace(input.IdempotencyKey) == "" || len(input.StudentIDs) == 0 {
		return nil, requestError("A valid exam, students, version, and idempotency key are required.")
	}
	if len(input.StudentIDs) != 1 {
		return nil, requestError("Chỉ được chấm một học sinh trong mỗi phiên cá nhân.")
	}
	seen := make(map[uuid.UUID]struct{}, len(input.StudentIDs))
	for _, id := range input.StudentIDs {
		if id == uuid.Nil {
			return nil, studentError(ErrorCodeInvalidStudent, "Every student must be valid.")
		}
		if _, exists := seen[id]; exists {
			return nil, studentError(ErrorCodeDuplicateStudent, "Student IDs must be unique.")
		}
		seen[id] = struct{}{}
	}
	canonical, _ := json.Marshal(struct {
		ExamID              uuid.UUID   `json:"examId"`
		StudentIDs          []uuid.UUID `json:"studentIds"`
		ExpectedExamVersion int         `json:"expectedExamVersion"`
	}{input.ExamID, append([]uuid.UUID(nil), input.StudentIDs...), input.ExpectedExamVersion})

	var detail *BatchDetail
	err := s.repository.Transaction(func(tx *Repository) error {
		var event model.ScoringInternalEvent
		err := tx.db.Where("event_type = ? AND idempotency_key = ?", "create_batch", input.IdempotencyKey).Take(&event).Error
		if err == nil {
			if event.PayloadJSON != string(canonical) {
				return &DomainError{Code: ErrorCodeIdempotencyConflict, Message: "Idempotency key was already used with another payload.", Status: http.StatusConflict}
			}
			return json.Unmarshal([]byte(event.ResultJSON), &detail)
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		var students []model.User
		if err := tx.db.Joins("JOIN classrooms ON classrooms.id = users.classroom_id").
			Where("users.id IN ? AND users.role = ? AND classrooms.teacher_id = ?", input.StudentIDs, "student", actor).
			Find(&students).Error; err != nil {
			return err
		}
		if len(students) != len(input.StudentIDs) {
			return studentError(ErrorCodeInvalidStudent, "Every selected user must be a student.")
		}
		var existing int64
		if err := tx.db.Model(&model.ScoringSubmission{}).
			Joins("JOIN grading_batches ON grading_batches.id = scoring_submissions.grading_batch_id").
			Where("grading_batches.exam_id = ? AND scoring_submissions.student_id = ?", input.ExamID, input.StudentIDs[0]).
			Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return studentError(ErrorCodeDuplicateStudent, "Học sinh này đã có phiên chấm cho đề.")
		}
		sort.Slice(students, func(i, j int) bool { return students[i].ID.String() < students[j].ID.String() })
		gateway := s.gateway(tx.db)
		var snapshotModel *model.ExamSnapshot
		var snapshotErr error
		var exam model.Exam
		if err := tx.db.First(&exam, "id = ? AND created_by = ?", input.ExamID, actor).Error; err != nil {
			return err
		}
		if exam.LockedSnapshotID != nil {
			snapshotModel, snapshotErr = gateway.GetLockedSnapshot(actor, input.ExamID, input.ExpectedExamVersion)
		} else {
			snapshotModel, snapshotErr = gateway.LockForScoring(actor, input.ExamID, input.ExpectedExamVersion, 1, input.IdempotencyKey+":exam")
		}
		if snapshotErr != nil {
			return snapshotErr
		}
		snapshot, err := ParseGradingSnapshot(*snapshotModel)
		if err != nil {
			return err
		}
		batch := model.GradingBatch{ExamID: input.ExamID, ExamSnapshotID: snapshotModel.ID, CreatedBy: actor, Status: model.GradingBatchStatusGrading, TotalSubmissions: len(students)}
		if err := tx.db.Create(&batch).Error; err != nil {
			return err
		}
		zero := model.MustScore("0.00")
		submissions := make([]model.ScoringSubmission, 0, len(students))
		for _, student := range students {
			submission := model.ScoringSubmission{GradingBatchID: batch.ID, StudentID: student.ID, Status: model.ScoringSubmissionStatusGrading, Version: 1, AwardedPoints: zero}
			if err := tx.db.Create(&submission).Error; err != nil {
				return err
			}
			for _, question := range snapshot.Questions {
				qr := model.ScoringQuestionResult{SubmissionID: submission.ID, ExamQuestionID: question.ID, Status: model.ScoringResultUnanswered, AwardedPoints: zero, UpdatedBy: actor}
				if err := tx.db.Create(&qr).Error; err != nil {
					return err
				}
				for _, rubric := range question.Rubrics {
					rr := model.ScoringRubricResult{SubmissionID: submission.ID, ExamRubricItemID: rubric.ID, Status: model.ScoringResultUnanswered, AwardedPoints: zero, UpdatedBy: actor}
					if err := tx.db.Create(&rr).Error; err != nil {
						return err
					}
				}
			}
			submissions = append(submissions, submission)
		}
		tx.db.Create(&model.ScoringAuditLog{BatchID: batch.ID, Action: "batch_created", ActorID: actor, NewValueJSON: string(canonical), OccurredAt: time.Now().UTC()})
		detail = &BatchDetail{GradingBatch: batch, Submissions: submissions}
		resultJSON, _ := json.Marshal(detail)
		return tx.db.Create(&model.ScoringInternalEvent{EventType: "create_batch", IdempotencyKey: input.IdempotencyKey, PayloadJSON: string(canonical), ResultJSON: string(resultJSON), ProcessedAt: time.Now().UTC()}).Error
	})
	return detail, err
}

func (s *Service) ListStudents(actor uuid.UUID, search string) ([]model.User, error) {
	var users []model.User
	query := s.repository.db.Joins("JOIN classrooms ON classrooms.id = users.classroom_id").
		Where("users.role = ? AND classrooms.teacher_id = ?", "student", actor)
	if search = strings.TrimSpace(search); search != "" {
		query = query.Where("users.name ILIKE ? OR users.email ILIKE ?", "%"+search+"%", "%"+search+"%")
	}
	return users, query.Order("users.name, users.id").Find(&users).Error
}

func (s *Service) ListBatches(actor uuid.UUID, status, search string) ([]model.GradingBatch, error) {
	var batches []model.GradingBatch
	query := s.repository.db.Model(&model.GradingBatch{}).
		Joins("JOIN exams ON exams.id = grading_batches.exam_id").
		Where("grading_batches.created_by = ?", actor)
	if status = strings.TrimSpace(status); status != "" {
		query = query.Where("grading_batches.status = ?", status)
	}
	if search = strings.TrimSpace(search); search != "" {
		query = query.Where("exams.title ILIKE ?", "%"+search+"%")
	}
	return batches, query.Order("grading_batches.created_at DESC, grading_batches.id").Find(&batches).Error
}

func (s *Service) GetBatch(actor, id uuid.UUID) (*BatchDetail, error) {
	batch, err := s.repository.LockOwnedBatch(id, actor)
	if err != nil {
		return nil, err
	}
	var submissions []model.ScoringSubmission
	if err := s.repository.db.Where("grading_batch_id = ?", id).Order("created_at, id").Find(&submissions).Error; err != nil {
		return nil, err
	}
	return &BatchDetail{GradingBatch: *batch, Submissions: submissions}, nil
}

func (s *Service) GetSubmission(actor, id uuid.UUID) (*SubmissionDetail, error) {
	submission, _, err := s.repository.LockOwnedSubmission(id, actor)
	if err != nil {
		return nil, err
	}
	var questions []model.ScoringQuestionResult
	var rubrics []model.ScoringRubricResult
	if err := s.repository.db.Where("submission_id = ?", id).Find(&questions).Error; err != nil {
		return nil, err
	}
	if err := s.repository.db.Where("submission_id = ?", id).Find(&rubrics).Error; err != nil {
		return nil, err
	}
	return &SubmissionDetail{ScoringSubmission: *submission, Questions: questions, Rubrics: rubrics}, nil
}

func requestError(message string) *DomainError {
	return &DomainError{Code: ErrorCodeInvalidRequest, Message: message, Status: http.StatusBadRequest}
}
func studentError(code, message string) *DomainError {
	return &DomainError{Code: code, Message: message, Field: "studentIds", Status: http.StatusBadRequest}
}
