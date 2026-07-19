package config

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"backend/internal/model"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func migrationModels() []any {
	return []any{
		&model.User{},
		&model.Classroom{},
		&model.ChatSession{},
		&model.Message{},
		&model.Topic{},
		&model.Node{},
		&model.Edge{},
		&model.Question{},
		&model.QuestionRubricItem{},
		&model.QuestionTopicMapping{},
		&model.QuestionRubricItemTopicMapping{},
		&model.QuestionTaggingState{},
		&model.StudentState{},
		&model.ActivityLog{},
		&model.TutorLearningState{},
		&model.MisconceptionMemory{},
		&model.AICache{},
		&model.LearningPath{},
		&model.StudentTopicMastery{},
		&model.StudentTopicMasteryHistory{},
		&model.GuardrailEvent{},
		&model.TelemetryEvent{},
		&model.TelemetryOutbox{},
		&model.QuestionAttemptFact{},
		&model.Exam{},
		&model.ExamQuestion{},
		&model.ExamRubricItem{},
		&model.ExamSnapshot{},
		&model.ExamGradingProgress{},
		&model.ExamInternalEvent{},
		&model.ExamExport{},
		&model.ExamAuditLog{},
		&model.GradingBatch{},
		&model.ScoringSubmission{},
		&model.ScoringQuestionResult{},
		&model.ScoringRubricResult{},
		&model.ScoringApprovalSnapshot{},
		&model.ScoringAuditLog{},
		&model.ScoringInternalEvent{},
		&model.Badge{},
		&model.StudentBadge{},
	}
}

func ExamExportDir() string {
	dir := os.Getenv("EXAM_EXPORT_DIR")
	if dir == "" {
		dir = "./data/exam-exports"
	}
	if !filepath.IsAbs(dir) {
		dir = filepath.Join(".", dir)
	}
	_ = os.MkdirAll(dir, 0o700)
	return dir
}

func ConnectDB() {
	host := os.Getenv("DB_HOST")
	user := os.Getenv("DB_USER")
	password := os.Getenv("DB_PASSWORD")
	dbname := os.Getenv("DB_NAME")
	port := os.Getenv("DB_PORT")
	sslmode := os.Getenv("DB_SSLMODE")

	if host == "" {
		host = "localhost"
	}
	if user == "" {
		user = "aurora"
	}
	if password == "" {
		password = "password123"
	}
	if dbname == "" {
		dbname = "aurora_dev"
	}
	if port == "" {
		port = "5434"
	}
	if sslmode == "" {
		sslmode = "disable"
	}

	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=%s",
		host, user, password, dbname, port, sslmode)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})

	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	// Ensure uuid-ossp extension exists before migrating tables
	if err := db.Exec(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`).Error; err != nil {
		log.Fatal("Failed to create extension uuid-ossp:", err)
	}

	err = db.AutoMigrate(migrationModels()...)
	if err != nil {
		log.Fatal("Failed to migrate database:", err)
	}
	// Individual grading sessions may share one exam snapshot; remove the
	// legacy one-batch-per-exam unique index from earlier deployments.
	if err := db.Exec(`DROP INDEX IF EXISTS uni_grading_batches_exam_id`).Error; err != nil {
		log.Fatal("Failed to update grading session indexes:", err)
	}
	if err := db.Exec(`DROP INDEX IF EXISTS idx_grading_batches_exam_id`).Error; err != nil {
		log.Fatal("Failed to update grading session indexes:", err)
	}
	if err := db.Exec(`DROP INDEX IF EXISTS uni_grading_batches_exam_snapshot_id`).Error; err != nil {
		log.Fatal("Failed to update grading snapshot indexes:", err)
	}
	if err := db.Exec(`DROP INDEX IF EXISTS idx_grading_batches_exam_snapshot_id`).Error; err != nil {
		log.Fatal("Failed to update grading snapshot indexes:", err)
	}
	if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_grading_batches_exam_id ON grading_batches (exam_id)`).Error; err != nil {
		log.Fatal("Failed to create grading session index:", err)
	}
	if err := db.Exec(`CREATE INDEX IF NOT EXISTS idx_grading_batches_exam_snapshot_id ON grading_batches (exam_snapshot_id)`).Error; err != nil {
		log.Fatal("Failed to create grading snapshot index:", err)
	}

	// Drop the unique index on questions.sig if it was previously created
	// (empty-sig rows from legacy questions violate uniqueness)
	db.Exec(`DROP INDEX IF EXISTS idx_questions_sig`)
	db.Exec(`DROP INDEX IF EXISTS "idx_questions_sig"`)
	// Create a regular (non-unique) index instead
	db.Exec(`CREATE INDEX IF NOT EXISTS idx_questions_sig_lookup ON questions(sig) WHERE sig IS NOT NULL AND sig != ''`)

	sqlDB, err := db.DB()
	if err == nil {
		sqlDB.SetMaxIdleConns(10)
		sqlDB.SetMaxOpenConns(100)
		sqlDB.SetConnMaxLifetime(time.Hour)
		log.Println("Database connection pool configured: MaxOpen=100, MaxIdle=10")
	}

	DB = db
	log.Println("Connected to PostgreSQL successfully")
}
