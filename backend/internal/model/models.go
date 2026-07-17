package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	Email     string         `gorm:"uniqueIndex;not null" json:"email"`
	Password  string         `gorm:"not null" json:"-"`
	Name      string         `json:"name"`
	Role      string         `gorm:"type:varchar(20);default:'student'" json:"role"` // "student" or "teacher"
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

type ChatSession struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	StudentID uuid.UUID `gorm:"type:uuid;index;not null" json:"studentId"`
	Student   User      `gorm:"foreignKey:StudentID" json:"-"`
	Topic     string    `gorm:"type:varchar(255);not null" json:"topic"`
	Status    string    `gorm:"type:varchar(20);default:'active'" json:"status"` // "active" or "completed"
	Mode      string    `gorm:"type:varchar(20);default:'socratic'" json:"mode"` // "socratic" or "feynman"
	AxiomsJSON string   `gorm:"type:text" json:"axiomsJson"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
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
	ID         uuid.UUID      `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	Subject    string         `gorm:"type:varchar(255);not null;index" json:"subject"`
	Name       string         `gorm:"type:varchar(255);not null" json:"name"`
	Theory     string         `gorm:"type:text" json:"theory"`
	TopicGroup string         `gorm:"type:varchar(255);default:'Chủ đề chung'" json:"topicGroup"`
	PosX       float64        `gorm:"type:double precision;default:0" json:"posX"`
	PosY       float64        `gorm:"type:double precision;default:0" json:"posY"`
	IsRoot     bool           `gorm:"type:boolean;default:false" json:"isRoot"`
	CreatedAt  time.Time      `json:"createdAt"`
	UpdatedAt  time.Time      `json:"updatedAt"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}

type Edge struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	Subject   string    `gorm:"type:varchar(255);not null;index" json:"subject"`
	SourceID  uuid.UUID `gorm:"type:uuid;not null;index" json:"sourceId"`
	TargetID  uuid.UUID `gorm:"type:uuid;not null;index" json:"targetId"`
	CreatedAt time.Time `json:"createdAt"`
}

type Question struct {
	ID            uuid.UUID      `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	NodeID        uuid.UUID      `gorm:"type:uuid;not null;index" json:"nodeId"`
	Content       string         `gorm:"type:text;not null" json:"content"`
	OptionsJSON   string         `gorm:"type:text;not null" json:"optionsJson"` // JSON array, e.g. ["A", "B"]
	CorrectOption int            `gorm:"type:integer;not null" json:"correctOption"`
	Difficulty    string         `gorm:"type:varchar(20);default:'medium'" json:"difficulty"` // "easy", "medium", "hard"
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

type StudentState struct {
	ID                 uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()" json:"id"`
	StudentID          uuid.UUID `gorm:"type:uuid;not null;index" json:"studentId"`
	Subject            string    `gorm:"type:varchar(255);not null;index" json:"subject"`
	InitialLevelNodeID uuid.UUID `gorm:"type:uuid" json:"initialLevelNodeId"`
	CurrentLevelNodeID uuid.UUID `gorm:"type:uuid" json:"currentLevelNodeId"`
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
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	Hash      string         `gorm:"type:varchar(64);uniqueIndex" json:"hash"`
	Prompt    string         `gorm:"type:text" json:"prompt"`
	Result    string         `gorm:"type:text" json:"result"`
	CreatedAt time.Time      `json:"createdAt"`
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


