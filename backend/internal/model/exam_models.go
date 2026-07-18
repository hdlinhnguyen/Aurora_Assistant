package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

var maxScore = decimal.RequireFromString("99999.99")

// Score stores an exact decimal score with at most two decimal places.
type Score struct {
	decimal.Decimal
}

func ParseScore(raw string) (Score, error) {
	value, err := decimal.NewFromString(raw)
	if err != nil {
		return Score{}, fmt.Errorf("invalid score %q: %w", raw, err)
	}
	if err := validateScore(value); err != nil {
		return Score{}, err
	}
	return Score{Decimal: value}, nil
}

func validateScore(value decimal.Decimal) error {
	if value.Exponent() < -2 {
		return fmt.Errorf("score must have at most two decimal places")
	}
	if value.Abs().GreaterThan(maxScore) {
		return fmt.Errorf("score must be between -99999.99 and 99999.99")
	}
	return nil
}

func MustScore(raw string) Score {
	score, err := ParseScore(raw)
	if err != nil {
		panic(err)
	}
	return score
}

func (s Score) String() string {
	return s.Decimal.StringFixed(2)
}

func (s Score) MarshalJSON() ([]byte, error) {
	return json.Marshal(s.String())
}

func (s *Score) UnmarshalJSON(data []byte) error {
	if s == nil {
		return fmt.Errorf("cannot unmarshal score into nil receiver")
	}

	raw := strings.TrimSpace(string(data))
	if len(raw) > 0 && raw[0] == '"' {
		if err := json.Unmarshal(data, &raw); err != nil {
			return fmt.Errorf("unmarshal score: %w", err)
		}
	}
	score, err := ParseScore(raw)
	if err != nil {
		return err
	}
	*s = score
	return nil
}

func (s Score) Value() (driver.Value, error) {
	if err := validateScore(s.Decimal); err != nil {
		return nil, err
	}
	return s.String(), nil
}

func (s *Score) Scan(value any) error {
	if s == nil {
		return fmt.Errorf("cannot scan score into nil receiver")
	}

	var raw string
	switch typed := value.(type) {
	case string:
		raw = typed
	case []byte:
		raw = string(typed)
	default:
		return fmt.Errorf("cannot scan score from %T", value)
	}

	score, err := ParseScore(raw)
	if err != nil {
		return err
	}
	*s = score
	return nil
}

func (Score) GormDataType() string {
	return "decimal"
}

func (Score) GormDBDataType(db *gorm.DB, _ *schema.Field) string {
	if db != nil && db.Dialector.Name() == "postgres" {
		return "numeric(7,2)"
	}
	return "decimal(7,2)"
}

type Exam struct {
	ID                        uuid.UUID      `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	Title                     string         `gorm:"not null" json:"title"`
	Subject                   string         `gorm:"not null" json:"subject"`
	GradeLevel                string         `gorm:"not null" json:"gradeLevel"`
	DurationMinutes           int            `gorm:"not null" json:"durationMinutes"`
	Instructions              string         `gorm:"type:text" json:"instructions"`
	TotalPoints               Score          `gorm:"not null" json:"totalPoints"`
	Status                    string         `gorm:"not null;index:idx_exam_created_by_status,priority:2" json:"status"`
	Version                   int            `gorm:"not null;default:1" json:"version"`
	CreatedBy                 uuid.UUID      `gorm:"type:uuid;not null;index;index:idx_exam_created_by_status,priority:1;index:idx_exam_created_by_updated_at,priority:1" json:"createdBy"`
	Creator                   User           `gorm:"foreignKey:CreatedBy;references:ID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	FirstSubmissionReceivedAt *time.Time     `json:"firstSubmissionReceivedAt"`
	LockedSnapshotID          *uuid.UUID     `gorm:"type:uuid" json:"lockedSnapshotId"`
	CreatedAt                 time.Time      `json:"createdAt"`
	UpdatedAt                 time.Time      `gorm:"index:idx_exam_created_by_updated_at,priority:2" json:"updatedAt"`
	DeletedAt                 gorm.DeletedAt `gorm:"index" json:"-"`
}

type ExamQuestion struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	ExamID           uuid.UUID  `gorm:"type:uuid;not null;index;uniqueIndex:idx_exam_position,priority:1" json:"examId"`
	SourceType       string     `gorm:"not null" json:"sourceType"`
	SourceQuestionID *uuid.UUID `gorm:"type:uuid" json:"sourceQuestionId"`
	QuestionType     string     `gorm:"not null" json:"questionType"`
	Content          string     `gorm:"type:text;not null" json:"content"`
	Points           Score      `gorm:"not null" json:"points"`
	Position         int        `gorm:"not null;uniqueIndex:idx_exam_position,priority:2" json:"position"`
	ChoicesJSON      string     `gorm:"type:text" json:"choicesJson"`
	CorrectChoiceID  *string    `json:"correctChoiceId"`
	TopicNodeIDsJSON string     `gorm:"type:text" json:"topicNodeIdsJson"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}

type ExamRubricItem struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	ExamQuestionID   uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_rubric_position,priority:1" json:"examQuestionId"`
	Description      string    `gorm:"type:text;not null" json:"description"`
	Points           Score     `gorm:"not null" json:"points"`
	Position         int       `gorm:"not null;uniqueIndex:idx_rubric_position,priority:2" json:"position"`
	TopicNodeIDsJSON string    `gorm:"type:text" json:"topicNodeIdsJson"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type ExamSnapshot struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	ExamID       uuid.UUID `gorm:"type:uuid;not null;index" json:"examId"`
	ExamVersion  int       `gorm:"not null" json:"examVersion"`
	Purpose      string    `gorm:"not null" json:"purpose"`
	SnapshotJSON string    `gorm:"type:text;not null" json:"snapshotJson"`
	CreatedAt    time.Time `json:"createdAt"`
}

type ExamGradingProgress struct {
	ExamID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"examId"`
	TotalSubmissions  int       `gorm:"not null;default:0" json:"totalSubmissions"`
	GradedSubmissions int       `gorm:"not null;default:0" json:"gradedSubmissions"`
	ScoredSubmissions int       `gorm:"not null;default:0" json:"scoredSubmissions"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type ExamInternalEvent struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	ExamID         uuid.UUID `gorm:"type:uuid;not null;index" json:"examId"`
	EventType      string    `gorm:"not null;uniqueIndex:idx_exam_event_key,priority:1" json:"eventType"`
	IdempotencyKey string    `gorm:"not null;uniqueIndex:idx_exam_event_key,priority:2" json:"idempotencyKey"`
	PayloadJSON    string    `gorm:"type:text;not null" json:"payloadJson"`
	ResultJSON     string    `gorm:"type:text;not null" json:"resultJson"`
	ProcessedAt    time.Time `json:"processedAt"`
}

type ExamExport struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	ExamID      uuid.UUID `gorm:"type:uuid;not null;index" json:"examId"`
	ExamVersion int       `gorm:"not null" json:"examVersion"`
	Style       string    `gorm:"not null" json:"style"`
	FileName    string    `gorm:"not null" json:"fileName"`
	FilePath    string    `gorm:"not null" json:"-"`
	CreatedBy   uuid.UUID `gorm:"type:uuid;not null;index" json:"createdBy"`
	CreatedAt   time.Time `json:"createdAt"`
}

type ExamAuditLog struct {
	ID                uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	ExamID            uuid.UUID `gorm:"type:uuid;not null;index" json:"examId"`
	Action            string    `gorm:"not null" json:"action"`
	ActorID           uuid.UUID `gorm:"type:uuid;not null;index" json:"actorId"`
	PreviousValueJSON string    `gorm:"type:text" json:"previousValueJson"`
	NewValueJSON      string    `gorm:"type:text" json:"newValueJson"`
	OccurredAt        time.Time `json:"occurredAt"`
}
