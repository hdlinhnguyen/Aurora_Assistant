package model

import (
	"time"

	"github.com/google/uuid"
)

const (
	GradingBatchStatusGrading   = "grading"
	GradingBatchStatusCompleted = "completed"

	ScoringSubmissionStatusGrading  = "grading"
	ScoringSubmissionStatusApproved = "approved"
	ScoringSubmissionStatusRevision = "revision"

	ScoringResultCorrect    = "correct"
	ScoringResultIncorrect  = "incorrect"
	ScoringResultUnanswered = "unanswered"
)

type GradingBatch struct {
	ID                  uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	ExamID              uuid.UUID  `gorm:"type:uuid;not null;index" json:"examId"`
	ExamSnapshotID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"examSnapshotId"`
	CreatedBy           uuid.UUID  `gorm:"type:uuid;not null;index:idx_grading_batch_owner_status,priority:1" json:"createdBy"`
	Status              string     `gorm:"type:varchar(20);not null;index:idx_grading_batch_owner_status,priority:2" json:"status"`
	TotalSubmissions    int        `gorm:"not null;check:chk_batch_total,total_submissions > 0" json:"totalSubmissions"`
	ApprovedSubmissions int        `gorm:"not null;default:0;check:chk_batch_approved,approved_submissions >= 0 AND approved_submissions <= total_submissions" json:"approvedSubmissions"`
	CreatedAt           time.Time  `json:"createdAt"`
	CompletedAt         *time.Time `json:"completedAt"`

	Exam         Exam         `gorm:"foreignKey:ExamID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	ExamSnapshot ExamSnapshot `gorm:"foreignKey:ExamSnapshotID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	Creator      User         `gorm:"foreignKey:CreatedBy;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
}

type ScoringSubmission struct {
	ID                       uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	GradingBatchID           uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_batch_student,priority:1;index:idx_submission_batch_status,priority:1" json:"gradingBatchId"`
	StudentID                uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex:idx_batch_student,priority:2" json:"studentId"`
	Status                   string     `gorm:"type:varchar(20);not null;index:idx_submission_batch_status,priority:2" json:"status"`
	Version                  int        `gorm:"not null;default:1" json:"version"`
	AwardedPoints            Score      `gorm:"not null" json:"awardedPoints"`
	EffectiveApprovalVersion int        `gorm:"not null;default:0" json:"effectiveApprovalVersion"`
	ApprovedBy               *uuid.UUID `gorm:"type:uuid" json:"approvedBy"`
	ApprovedAt               *time.Time `json:"approvedAt"`
	CreatedAt                time.Time  `json:"createdAt"`
	UpdatedAt                time.Time  `json:"updatedAt"`

	Batch    GradingBatch `gorm:"foreignKey:GradingBatchID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	Student  User         `gorm:"foreignKey:StudentID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	Approver *User        `gorm:"foreignKey:ApprovedBy;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
}

type ScoringQuestionResult struct {
	SubmissionID   uuid.UUID `gorm:"type:uuid;primaryKey" json:"submissionId"`
	ExamQuestionID uuid.UUID `gorm:"type:uuid;primaryKey" json:"examQuestionId"`
	Status         string    `gorm:"type:varchar(20);not null" json:"status"`
	Reviewed       bool      `gorm:"not null;default:false" json:"reviewed"`
	AwardedPoints  Score     `gorm:"not null" json:"awardedPoints"`
	UpdatedBy      uuid.UUID `gorm:"type:uuid;not null" json:"updatedBy"`
	UpdatedAt      time.Time `json:"updatedAt"`

	Submission   ScoringSubmission `gorm:"foreignKey:SubmissionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	ExamQuestion ExamQuestion      `gorm:"foreignKey:ExamQuestionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	Updater      User              `gorm:"foreignKey:UpdatedBy;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
}

type ScoringRubricResult struct {
	SubmissionID     uuid.UUID `gorm:"type:uuid;primaryKey" json:"submissionId"`
	ExamRubricItemID uuid.UUID `gorm:"type:uuid;primaryKey" json:"examRubricItemId"`
	Status           string    `gorm:"type:varchar(20);not null" json:"status"`
	Reviewed         bool      `gorm:"not null;default:false" json:"reviewed"`
	AwardedPoints    Score     `gorm:"not null" json:"awardedPoints"`
	UpdatedBy        uuid.UUID `gorm:"type:uuid;not null" json:"updatedBy"`
	UpdatedAt        time.Time `json:"updatedAt"`

	Submission     ScoringSubmission `gorm:"foreignKey:SubmissionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	ExamRubricItem ExamRubricItem    `gorm:"foreignKey:ExamRubricItemID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	Updater        User              `gorm:"foreignKey:UpdatedBy;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
}

type ScoringApprovalSnapshot struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	SubmissionID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex:idx_submission_approval_version,priority:1" json:"submissionId"`
	ApprovalVersion int       `gorm:"not null;uniqueIndex:idx_submission_approval_version,priority:2" json:"approvalVersion"`
	ResultJSON      string    `gorm:"type:text;not null" json:"resultJson"`
	TotalPoints     Score     `gorm:"not null" json:"totalPoints"`
	ApprovedBy      uuid.UUID `gorm:"type:uuid;not null" json:"approvedBy"`
	ApprovedAt      time.Time `json:"approvedAt"`

	Submission ScoringSubmission `gorm:"foreignKey:SubmissionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	Approver   User              `gorm:"foreignKey:ApprovedBy;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
}

type ScoringAuditLog struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	BatchID           uuid.UUID  `gorm:"type:uuid;not null;index" json:"batchId"`
	SubmissionID      *uuid.UUID `gorm:"type:uuid;index:idx_scoring_audit_submission_time,priority:1" json:"submissionId"`
	Action            string     `gorm:"type:varchar(60);not null" json:"action"`
	ActorID           uuid.UUID  `gorm:"type:uuid;not null" json:"actorId"`
	PreviousValueJSON string     `gorm:"type:text" json:"previousValueJson"`
	NewValueJSON      string     `gorm:"type:text" json:"newValueJson"`
	OccurredAt        time.Time  `gorm:"index:idx_scoring_audit_submission_time,priority:2" json:"occurredAt"`

	Batch      GradingBatch       `gorm:"foreignKey:BatchID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	Submission *ScoringSubmission `gorm:"foreignKey:SubmissionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	Actor      User               `gorm:"foreignKey:ActorID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
}

type ScoringInternalEvent struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	EventType      string    `gorm:"type:varchar(40);not null;uniqueIndex:idx_scoring_event_key,priority:1" json:"eventType"`
	IdempotencyKey string    `gorm:"type:varchar(200);not null;uniqueIndex:idx_scoring_event_key,priority:2" json:"idempotencyKey"`
	PayloadJSON    string    `gorm:"type:text;not null" json:"payloadJson"`
	ResultJSON     string    `gorm:"type:text;not null" json:"resultJson"`
	ProcessedAt    time.Time `json:"processedAt"`
}
