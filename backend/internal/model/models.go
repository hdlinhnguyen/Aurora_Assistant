package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	Email       string         `gorm:"uniqueIndex;not null" json:"email"`
	Password    string         `gorm:"not null" json:"-"`
	Name        string         `json:"name"`
	Role        string         `gorm:"type:varchar(20);default:'student'" json:"role"` // "student", "teacher", "admin"
	ClassroomID *uuid.UUID     `gorm:"type:uuid;index" json:"classroomId"`
	Status      string         `gorm:"type:varchar(20);default:'active'" json:"status"` // "active", "pending", "inactive"
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`
}

type Classroom struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	Name      string    `gorm:"type:varchar(100);not null" json:"name"`
	TeacherID uuid.UUID `gorm:"type:uuid;index;not null" json:"teacherId"`
	Teacher   User      `gorm:"foreignKey:TeacherID" json:"-"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type ChatSession struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	StudentID  uuid.UUID `gorm:"type:uuid;index;not null" json:"studentId"`
	Student    User      `gorm:"foreignKey:StudentID" json:"-"`
	Topic      string    `gorm:"type:varchar(255);not null" json:"topic"`
	Status     string    `gorm:"type:varchar(20);default:'active'" json:"status"` // "active" or "completed"
	Mode       string    `gorm:"type:varchar(20);default:'socratic'" json:"mode"` // "socratic" or "feynman"
	AxiomsJSON string    `gorm:"type:text" json:"axiomsJson"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type Message struct {
	ID            uuid.UUID   `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	SessionID     uuid.UUID   `gorm:"type:uuid;index;not null" json:"sessionId"`
	Session       ChatSession `gorm:"foreignKey:SessionID" json:"-"`
	Sender        string      `gorm:"type:varchar(10);not null" json:"sender"` // "student" or "ai"
	Content       string      `gorm:"type:text;not null" json:"content"`
	DetectedGap   string      `gorm:"type:varchar(255)" json:"detectedGap"` // Gap identified by Socratic AI, if any
	IsCorrectStep bool        `gorm:"type:boolean;default:true" json:"isCorrectStep"`
	FeynmanScore  int         `gorm:"type:integer;default:0" json:"feynmanScore"`
	AxiomsJSON    string      `gorm:"type:text" json:"axiomsJson"`
	CreatedAt     time.Time   `json:"createdAt"`
}

type Topic struct {
	ID             uuid.UUID      `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	TeacherID      uuid.UUID      `gorm:"type:uuid;index;not null" json:"teacherId"`
	Teacher        User           `gorm:"foreignKey:TeacherID" json:"-"`
	Name           string         `gorm:"type:varchar(255);not null" json:"name"`
	Subject        string         `gorm:"type:varchar(100)" json:"subject"`
	GradeLevel     string         `gorm:"type:varchar(50)" json:"gradeLevel"`
	Modes          string         `gorm:"type:varchar(100);default:'socratic,feynman'" json:"modes"`
	AxiomsJSON     string         `gorm:"type:text" json:"axiomsJson"`
	SystemPrompt   string         `gorm:"type:text" json:"systemPrompt"`
	CommonMistakes string         `gorm:"type:text" json:"commonMistakes"`
	HintLevel      string         `gorm:"type:varchar(20);default:'medium'" json:"hintLevel"`
	Published      bool           `gorm:"type:boolean;default:false" json:"published"`
	CreatedAt      time.Time      `json:"createdAt"`
	UpdatedAt      time.Time      `json:"updatedAt"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

type Node struct {
	ID            uuid.UUID      `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	Subject       string         `gorm:"type:varchar(255);not null;index" json:"subject"`
	Name          string         `gorm:"type:varchar(255);not null" json:"name"`
	Theory        string         `gorm:"type:text" json:"theory"`
	TopicGroup    string         `gorm:"type:varchar(255);default:'Chủ đề chung'" json:"topicGroup"`
	PosX          float64        `gorm:"type:double precision;default:0" json:"posX"`
	PosY          float64        `gorm:"type:double precision;default:0" json:"posY"`
	IsRoot        bool           `gorm:"type:boolean;default:false" json:"isRoot"`
	StableKey     string         `gorm:"type:varchar(255);index" json:"stableKey"`
	SourceItemIDs string         `gorm:"type:text" json:"sourceItemIds"`                  // Comma-separated or JSON list of raw source records
	Status        string         `gorm:"type:varchar(50);default:'active'" json:"status"` // "active", "draft"
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

type Edge struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	Subject    string    `gorm:"type:varchar(255);not null;index" json:"subject"`
	SourceID   uuid.UUID `gorm:"type:uuid;not null;index" json:"sourceId"`
	TargetID   uuid.UUID `gorm:"type:uuid;not null;index" json:"targetId"`
	Status     string    `gorm:"type:varchar(50);default:'active'" json:"status"`    // "active", "draft"
	SourceType string    `gorm:"type:varchar(50);default:'human'" json:"sourceType"` // "human", "rule", "llm"
	CreatedAt  time.Time `json:"createdAt"`
}

type Question struct {
	ID                 uuid.UUID      `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	NodeID             uuid.UUID      `gorm:"type:uuid;not null;index" json:"nodeId"`
	Content            string         `gorm:"type:text;not null" json:"content"`
	OptionsJSON        string         `gorm:"type:text;not null" json:"optionsJson"` // JSON array, e.g. ["A", "B"]
	CorrectOption      int            `gorm:"type:integer;not null" json:"correctOption"`
	Difficulty         string         `gorm:"type:varchar(20);default:'medium'" json:"difficulty"` // "easy", "medium", "hard"
	QuestionType       string         `gorm:"type:varchar(20);not null;default:'multiple_choice'" json:"questionType"`
	GradeLevel         string         `gorm:"type:varchar(50)" json:"gradeLevel"`
	DistractorMappings string         `gorm:"type:text" json:"distractorMappings"` // JSON map, e.g. {"option_b": "node-uuid"}
	Sig                string         `gorm:"type:varchar(255);index" json:"sig"` // Signature for dedup (from master_bank)
	CreatedAt          time.Time      `json:"createdAt"`
	UpdatedAt          time.Time      `json:"updatedAt"`
	DeletedAt          gorm.DeletedAt `gorm:"index" json:"-"`
}

type QuestionRubricItem struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	QuestionID uuid.UUID `gorm:"type:uuid;not null;index;uniqueIndex:idx_question_rubric_position,priority:1" json:"questionId"`
	Question   Question  `gorm:"foreignKey:QuestionID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"-"`
	Content    string    `gorm:"type:text;not null" json:"content"`
	Points     Score     `gorm:"not null" json:"points"`
	Position   int       `gorm:"not null;uniqueIndex:idx_question_rubric_position,priority:2" json:"position"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type QuestionTopicMapping struct {
	QuestionID uuid.UUID `gorm:"type:uuid;primaryKey" json:"questionId"`
	Question   Question  `gorm:"foreignKey:QuestionID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"-"`
	NodeID     uuid.UUID `gorm:"type:uuid;primaryKey" json:"nodeId"`
	Node       Node      `gorm:"foreignKey:NodeID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	CreatedBy  uuid.UUID `gorm:"type:uuid;not null;index" json:"createdBy"`
	Creator    User      `gorm:"foreignKey:CreatedBy;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	CreatedAt  time.Time `json:"createdAt"`
}

type QuestionRubricItemTopicMapping struct {
	RubricItemID uuid.UUID          `gorm:"type:uuid;primaryKey" json:"rubricItemId"`
	RubricItem   QuestionRubricItem `gorm:"foreignKey:RubricItemID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"-"`
	NodeID       uuid.UUID          `gorm:"type:uuid;primaryKey" json:"nodeId"`
	Node         Node               `gorm:"foreignKey:NodeID;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	CreatedBy    uuid.UUID          `gorm:"type:uuid;not null;index" json:"createdBy"`
	Creator      User               `gorm:"foreignKey:CreatedBy;constraint:OnUpdate:CASCADE,OnDelete:RESTRICT" json:"-"`
	CreatedAt    time.Time          `json:"createdAt"`
}

type QuestionTaggingState struct {
	QuestionID uuid.UUID  `gorm:"type:uuid;primaryKey" json:"questionId"`
	Question   Question   `gorm:"foreignKey:QuestionID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE" json:"-"`
	Version    int        `gorm:"not null;default:1;check:question_tagging_version_positive,version >= 1" json:"version"`
	UpdatedBy  *uuid.UUID `gorm:"type:uuid;index" json:"updatedBy"`
	Updater    *User      `gorm:"foreignKey:UpdatedBy;constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"-"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

type StudentState struct {
	ID                 uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	StudentID          uuid.UUID `gorm:"type:uuid;not null;index" json:"studentId"`
	Subject            string    `gorm:"type:varchar(255);not null;index" json:"subject"`
	InitialLevelNodeID uuid.UUID `gorm:"type:uuid" json:"initialLevelNodeId"`
	CurrentLevelNodeID uuid.UUID `gorm:"type:uuid" json:"currentLevelNodeId"`
	NeedsDiagnostic    bool      `gorm:"default:true" json:"needsDiagnostic"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type ActivityLog struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	StudentID uuid.UUID `gorm:"type:uuid;not null;index" json:"studentId"`
	Subject   string    `gorm:"type:varchar(255);not null;index" json:"subject"`
	NodeID    uuid.UUID `gorm:"type:uuid;not null;index" json:"nodeId"`
	Action    string    `gorm:"type:varchar(50);not null" json:"action"` // "click_node", "answer_correct", etc.
	Detail    string    `gorm:"type:text" json:"detail"`
	CreatedAt time.Time `json:"createdAt"`
}

type AICache struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Hash      string    `gorm:"type:varchar(64);uniqueIndex" json:"hash"`
	Prompt    string    `gorm:"type:text" json:"prompt"`
	Result    string    `gorm:"type:text" json:"result"`
	CreatedAt time.Time `json:"createdAt"`
}

// GuardrailEvent lưu các sự kiện bị lớp kiểm duyệt gắn cờ (input học sinh hoặc
// safety_flag từ LLM) để giáo viên theo dõi và can thiệp — đặc biệt severity "high".
type GuardrailEvent struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	StudentID      uuid.UUID  `gorm:"type:uuid;not null;index" json:"studentId"`
	Student        User       `gorm:"foreignKey:StudentID" json:"-"`
	SessionID      *uuid.UUID `gorm:"type:uuid;index" json:"sessionId"`                // nullable: chat lý thuyết không có session
	Source         string     `gorm:"type:varchar(30);not null" json:"source"`         // "chat_input", "chat_output", "theory_chat"
	Category       string     `gorm:"type:varchar(30);not null;index" json:"category"` // "self_harm", "abuse", "sexual", "violence", "profanity", "jailbreak", "personal_info"
	Severity       string     `gorm:"type:varchar(10);not null;index" json:"severity"` // "high", "medium", "low"
	ContentExcerpt string     `gorm:"type:text" json:"contentExcerpt"`
	MatchedPattern string     `gorm:"type:varchar(255)" json:"matchedPattern"`
	Handled        bool       `gorm:"type:boolean;default:false;index" json:"handled"`
	CreatedAt      time.Time  `json:"createdAt"`
}

type LearningPath struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	StudentID uuid.UUID `gorm:"type:uuid;not null;index" json:"studentId"`
	ClassID   string    `gorm:"type:varchar(100);not null" json:"classId"`
	ThreadID  string    `gorm:"type:varchar(100);not null" json:"threadId"`
	Status    string    `gorm:"type:varchar(50);not null" json:"status"` // "Draft", "Approved", "Active"
	StepsJSON string    `gorm:"type:text;not null" json:"stepsJson"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
