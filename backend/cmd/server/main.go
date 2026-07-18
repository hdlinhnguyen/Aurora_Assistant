package main

import (
	"context"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/joho/godotenv"
	"gorm.io/gorm"

	"backend/internal/config"
	"backend/internal/exam"
	"backend/internal/handler"
	masteryprofile "backend/internal/mastery"
	"backend/internal/middleware"
	"backend/internal/model"
	"backend/internal/scoring"
	"backend/internal/service"
	"backend/internal/syntheticseed"
	"backend/internal/telemetry"
)

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

func main() {
	// Load .env file
	if err := godotenv.Load("../.env"); err != nil {
		if err = godotenv.Load(); err != nil {
			log.Println("No .env file found, using system environment variables")
		}
	}

	// Connect to database (AutoMigrate is run inside config.ConnectDB)
	config.ConnectDB()

	app := fiber.New(fiber.Config{
		BodyLimit:    5 * 1024 * 1024, // 5MB limit
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
	})

	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins: []string{"http://localhost:3000", "http://localhost:3001"},
		AllowHeaders: []string{"Origin, Content-Type, Accept, Authorization"},
	}))

	// Initial check endpoint
	app.Get("/api/health", func(c fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"status":  "ok",
			"message": "Aurora Socratic Tutor API is running",
		})
	})
	telemetryKey := os.Getenv("TELEMETRY_HMAC_KEY")
	if telemetryKey == "" {
		telemetryKey = "development-only-telemetry-key"
		log.Println("TELEMETRY_HMAC_KEY is not set; using development telemetry key")
	}
	telemetryPublisher := telemetry.NewPublisher(config.DB, telemetry.SystemClock{}, telemetry.PseudonymConfig{
		Key: []byte(telemetryKey), KeyVersion: "v1",
	})

	// Services
	authSvc := service.NewAuthService(config.DB, os.Getenv("JWT_SECRET"))
	aiSvc := service.NewAIService(config.DB)
	tutorSvc := service.NewTutorService(config.DB, aiSvc, service.WithTelemetryPublisher(telemetryPublisher))
	taggingSvc := service.NewTaggingService(config.DB)
	questionBankSvc := service.NewQuestionBankService(config.DB)
	examSvc := exam.NewServiceWithExporter(
		exam.NewRepository(config.DB),
		exam.NewDOCXExporter(),
		config.ExamExportDir(),
		exam.WithTelemetryPublisher(telemetryPublisher),
	)
	masteryRepo := masteryprofile.NewRepository(config.DB)
	masteryClient := masteryprofile.NewClient(envOrDefault("LEARNING_PATH_URL", "http://127.0.0.1:8000"), nil)
	masterySvc := masteryprofile.NewService(
		config.DB, masteryRepo, masteryClient,
		masteryprofile.WithTelemetryPublisher(telemetryPublisher),
	)

	// Handlers
	authHandler := handler.NewAuthHandler(authSvc)
	tutorHandler := handler.NewTutorHandler(tutorSvc, handler.WithTutorTelemetry(telemetryPublisher))
	adminHandler := handler.NewAdminHandler(config.DB)
	studentMgmtHandler := handler.NewStudentMgmtHandler(config.DB)
	taggingHandler := handler.NewTaggingHandler(taggingSvc)
	questionBankHandler := handler.NewQuestionBankHandler(questionBankSvc)
	examHandler := handler.NewExamHandler(examSvc, os.Getenv("EXAM_INTERNAL_TOKEN"))
	masteryHandler := handler.NewMasteryHandler(masterySvc)
	studentExamHandler := handler.NewStudentExamHandler(config.DB)
	scoringSvc := scoring.NewService(scoring.NewRepository(config.DB), func(db *gorm.DB) exam.ScoringGateway {
		return exam.NewScoringGateway(db)
	})
	scoringHandler := handler.NewScoringHandler(scoringSvc)
	telemetryCollector := telemetry.NewCollector(
		telemetryPublisher,
		[]byte(telemetryKey),
		"v1",
		telemetry.SystemClock{},
	)
	telemetryWorker := telemetry.NewWorker(config.DB, telemetry.SystemClock{})
	workerContext, stopTelemetryWorker := context.WithCancel(context.Background())
	defer stopTelemetryWorker()
	go func() {
		if err := telemetryWorker.Run(workerContext); err != nil && err != context.Canceled {
			log.Printf("telemetry worker stopped: %v", err)
		}
	}()

	// Ensure at least one admin exists.
	var adminCount int64
	config.DB.Model(&model.User{}).Where("role = ?", "admin").Count(&adminCount)
	if adminCount == 0 {
		log.Println("No admin account found. Creating default admin: admin@aurora.edu.vn")
		if _, err := authSvc.Register("admin@aurora.edu.vn", "demo123", "Quản trị viên Hệ thống", "admin"); err != nil {
			log.Printf("Failed to create default admin: %v", err)
		}
	}

	// Reset synthetic fixtures and derive BKT exclusively from generated answer events.
	seedService := syntheticseed.New(config.DB, syntheticseed.DefaultConfig())
	if err := runSyntheticSeed(context.Background(), os.Getenv("ENABLE_SYNTHETIC_DATA"), seedService, masterySvc, log.Default()); err != nil {
		log.Fatalf("synthetic startup failed: %v", err)
	}

	// Public Routes
	app.Post("/api/auth/register", authHandler.Register)
	app.Post("/api/auth/login", authHandler.Login)
	app.Get("/api/internal/graph", tutorHandler.GetInternalGraph)

	// Protected Routes
	api := app.Group("/api", middleware.Protected(config.DB))
	api.Post("/telemetry/events", telemetryCollector)
	teacherExams := api.Group("/teacher", middleware.RequireRole("teacher"))
	studentMastery := api.Group("/student", middleware.RequireRole("student"))
	teacherExams.Post("/exams", examHandler.Create)
	teacherExams.Get("/exams", examHandler.List)
	teacherExams.Get("/exams/:examId", examHandler.Get)
	teacherExams.Patch("/exams/:examId", examHandler.Patch)
	teacherExams.Delete("/exams/:examId", examHandler.Delete)
	teacherExams.Get("/exams/:examId/audit", examHandler.Audit)
	teacherExams.Get("/exam-bank/questions", examHandler.ListBankQuestions)
	teacherExams.Get("/exam-bank/questions/:questionId", examHandler.GetBankQuestion)
	teacherExams.Get("/exam-bank/topics", examHandler.ListTopics)
	teacherExams.Post("/exams/:examId/questions/from-bank", examHandler.AddBankQuestion)
	teacherExams.Post("/exams/:examId/questions/manual", examHandler.AddManualQuestion)
	teacherExams.Patch("/exams/:examId/questions/:questionId", examHandler.PatchQuestion)
	teacherExams.Delete("/exams/:examId/questions/:questionId", examHandler.DeleteQuestion)
	teacherExams.Put("/exams/:examId/questions/reorder", examHandler.ReorderQuestions)
	teacherExams.Post("/exams/:examId/questions/:questionId/rubric-items", examHandler.AddRubricItem)
	teacherExams.Patch("/exams/:examId/questions/:questionId/rubric-items/:rubricId", examHandler.PatchRubricItem)
	teacherExams.Delete("/exams/:examId/questions/:questionId/rubric-items/:rubricId", examHandler.DeleteRubricItem)
	teacherExams.Put("/exams/:examId/questions/:questionId/rubric-items/reorder", examHandler.ReorderRubricItems)
	teacherExams.Post("/exams/:examId/validate", examHandler.Validate)
	teacherExams.Post("/exams/:examId/prepare", examHandler.Prepare)
	teacherExams.Post("/exams/:examId/return-to-draft", examHandler.ReturnToDraft)
	teacherExams.Post("/exams/:examId/exports/docx", examHandler.ExportDOCX)
	teacherExams.Get("/exams/:examId/exports", examHandler.ListExports)
	teacherExams.Get("/exams/:examId/exports/:exportId/download", examHandler.DownloadExport)
	teacherExams.Get("/scoring/students", scoringHandler.ListStudents)
	teacherExams.Post("/grading-batches", scoringHandler.CreateBatch)
	teacherExams.Get("/grading-batches", scoringHandler.ListBatches)
	teacherExams.Get("/grading-batches/:batchId", scoringHandler.GetBatch)
	teacherExams.Get("/scoring-submissions/:submissionId", scoringHandler.GetSubmission)
	teacherExams.Put("/scoring-submissions/:submissionId/questions/:questionId", scoringHandler.UpdateQuestion)
	teacherExams.Put("/scoring-submissions/:submissionId/rubrics/:rubricId", scoringHandler.UpdateRubric)
	teacherExams.Post("/scoring-submissions/:submissionId/approve", scoringHandler.Approve)
	teacherExams.Post("/scoring-submissions/:submissionId/revisions", scoringHandler.StartRevision)
	teacherExams.Get("/scoring-submissions/:submissionId/history", scoringHandler.History)
	teacherExams.Get("/scoring-submissions/:submissionId/audit", scoringHandler.Audit)
	teacherExams.Get("/students/:studentId/mastery", masteryHandler.GetTeacherProfile)
	teacherExams.Get("/students/:studentId/mastery/:topicId/history", masteryHandler.GetTeacherHistory)
	teacherExams.Post("/students/:studentId/mastery/recalculate", masteryHandler.RecalculateTeacherProfile)
	studentMastery.Get("/mastery", masteryHandler.GetStudentProfile)
	studentMastery.Get("/mastery/:topicId/history", masteryHandler.GetStudentHistory)
	studentMastery.Get("/exams", studentExamHandler.GetStudentExams)
	studentMastery.Get("/exams/:examId", studentExamHandler.GetStudentExam)
	studentMastery.Post("/exams/:examId/submit", studentExamHandler.SubmitStudentExam)

	app.Post("/internal/exams/:examId/first-submission", examHandler.FirstSubmission)
	app.Post("/internal/exams/:examId/grading-completed", examHandler.GradingCompleted)
	api.Post("/tutor/sessions", tutorHandler.CreateSession)
	api.Get("/tutor/sessions", tutorHandler.GetSessions)
	api.Get("/tutor/sessions/:id/messages", tutorHandler.GetMessages)
	api.Post("/tutor/sessions/:id/messages", tutorHandler.SendMessage)
	api.Post("/tutor/sessions/:id/axioms", tutorHandler.SaveAxioms)
	api.Get("/tutor/sessions/:id/axioms", tutorHandler.GetAxioms)

	// Subjects & Tree (Public/Student read, Admin/Teacher edit)
	api.Get("/subjects", tutorHandler.GetSubjects)
	api.Get("/subjects/:subject/tree", tutorHandler.GetTree)
	api.Get("/subjects/:subject/questions", tutorHandler.GetSubjectQuestions)
	api.Get("/nodes/:nodeId/questions", tutorHandler.GetQuestions)
	api.Post("/nodes/:nodeId/questions", tutorHandler.CreateQuestion)
	api.Post("/nodes/:nodeId/questions/bulk", tutorHandler.CreateQuestionsBulk)
	api.Put("/questions/:id", tutorHandler.UpdateQuestion)
	api.Delete("/questions/:id", tutorHandler.DeleteQuestion)

	api.Get("/teacher/question-bank/questions", questionBankHandler.ListQuestions)
	api.Post("/teacher/question-bank/questions", questionBankHandler.CreateQuestion)
	api.Get("/teacher/question-bank/questions/:questionId", questionBankHandler.GetQuestion)
	api.Patch("/teacher/question-bank/questions/:questionId", questionBankHandler.UpdateQuestion)
	api.Delete("/teacher/question-bank/questions/:questionId", questionBankHandler.DeleteQuestion)
	api.Post("/teacher/question-bank/questions/:questionId/rubric-items", questionBankHandler.CreateRubricItem)
	api.Patch("/teacher/question-bank/questions/:questionId/rubric-items/:rubricItemId", questionBankHandler.UpdateRubricItem)
	api.Delete("/teacher/question-bank/questions/:questionId/rubric-items/:rubricItemId", questionBankHandler.DeleteRubricItem)
	api.Put("/teacher/question-bank/questions/:questionId/rubric-items/reorder", questionBankHandler.ReorderRubricItems)

	api.Get("/teacher/question-bank/questions/:questionId/tagging-context", taggingHandler.GetContext)
	api.Put("/teacher/question-bank/questions/:questionId/topics", taggingHandler.SetQuestionTopics)
	api.Put("/teacher/question-bank/questions/:questionId/rubric-items/:rubricItemId/topics", taggingHandler.SetRubricItemTopics)
	api.Get("/teacher/question-bank/questions/:questionId/effective-topics", taggingHandler.GetEffectiveTopics)

	api.Post("/nodes/:nodeId/upload-theory", tutorHandler.UploadTheory)
	api.Post("/nodes/:nodeId/chat-theory", tutorHandler.ChatNodeTheory)
	api.Get("/subjects/:subject/state", tutorHandler.GetStudentState)
	api.Post("/subjects/:subject/start", tutorHandler.StartSubjectNode)
	api.Post("/nodes/:nodeId/answer", tutorHandler.SubmitAnswer)
	api.Post("/nodes/:nodeId/cant-do", tutorHandler.SubmitCantDo)
	api.Post("/nodes/:nodeId/adaptive-downgrade", tutorHandler.AdaptiveDowngrade)
	api.Get("/student/learning-path", tutorHandler.GetStudentLearningPath)
	api.Post("/student/hints", tutorHandler.RequestHint)
	api.Post("/nodes/:nodeId/chat-theory", tutorHandler.ChatNodeTheory)

	// Admin Routes (Admin only)
	adminGroup := api.Group("/admin", middleware.RequireRole("admin"))
	adminGroup.Get("/teachers", adminHandler.GetTeachers)
	adminGroup.Post("/teachers", adminHandler.CreateTeacher)
	adminGroup.Put("/teachers/:id", adminHandler.UpdateTeacher)
	adminGroup.Delete("/teachers/:id", adminHandler.DeleteTeacher)
	adminGroup.Get("/classrooms", adminHandler.GetClassrooms)
	adminGroup.Post("/classrooms", adminHandler.CreateClassroom)
	adminGroup.Put("/classrooms/:id", adminHandler.UpdateClassroom)
	adminGroup.Delete("/classrooms/:id", adminHandler.DeleteClassroom)

	// Teacher Routes (Teacher & Admin only)
	teacherGroup := api.Group("/teacher", middleware.RequireRole("teacher", "admin"))
	teacherGroup.Get("/dashboard", tutorHandler.GetDashboard)
	teacherGroup.Post("/topics", tutorHandler.CreateTopic)
	teacherGroup.Get("/topics", tutorHandler.GetTopics)
	teacherGroup.Put("/topics/:id", tutorHandler.UpdateTopic)
	teacherGroup.Delete("/topics/:id", tutorHandler.DeleteTopic)
	teacherGroup.Post("/learning-path", tutorHandler.CreateLearningPath)
	teacherGroup.Post("/learning-path/:threadId/approve", tutorHandler.ApproveLearningPath)
	teacherGroup.Get("/guardrail-events", tutorHandler.GetGuardrailEvents)
	teacherGroup.Put("/guardrail-events/:id/handled", tutorHandler.MarkGuardrailEventHandled)
	teacherGroup.Get("/students-progress", tutorHandler.GetStudentsProgress)
	teacherGroup.Get("/students/:studentId/progress/:subject", tutorHandler.GetStudentSubjectProgress)
	teacherGroup.Get("/monitoring/:subject", tutorHandler.GetMonitoringData)
	teacherGroup.Post("/students/:studentId/re-diagnostic", tutorHandler.RequestReDiagnostic)
	teacherGroup.Get("/classes/intervention-groups/:subject", tutorHandler.GetClassInterventionGroups)

	// New Student & Classroom Management under /teacher
	teacherGroup.Get("/classrooms", studentMgmtHandler.GetTeacherClassrooms)
	teacherGroup.Get("/classrooms/:classId/students", studentMgmtHandler.GetClassroomStudents)
	teacherGroup.Post("/students", studentMgmtHandler.CreateStudent)
	teacherGroup.Post("/students/bulk", studentMgmtHandler.CreateStudentsBulk)
	teacherGroup.Put("/students/:id", studentMgmtHandler.UpdateStudent)
	teacherGroup.Put("/students/:id/reset-password", studentMgmtHandler.ResetStudentPassword)
	teacherGroup.Delete("/students/:id", studentMgmtHandler.DeleteStudent)

	// Curriculum editing routes (Teacher & Admin only)
	api.Delete("/subjects/:subject", middleware.RequireRole("teacher", "admin"), tutorHandler.DeleteSubject)
	api.Put("/subjects/:subject", middleware.RequireRole("teacher", "admin"), tutorHandler.RenameSubject)
	api.Post("/subjects/:subject/parse-tree", middleware.RequireRole("teacher", "admin"), tutorHandler.ParseAndBuildTree)
	api.Post("/subjects/extract-text", middleware.RequireRole("teacher", "admin"), tutorHandler.ExtractText)
	api.Post("/subjects/parse-chunk", middleware.RequireRole("teacher", "admin"), tutorHandler.ParseChunk)
	api.Post("/subjects/:subject/save-tree", middleware.RequireRole("teacher", "admin"), tutorHandler.SaveTree)
	api.Post("/subjects/:subject/nodes", middleware.RequireRole("teacher", "admin"), tutorHandler.CreateNode)
	api.Put("/subjects/nodes/:id", middleware.RequireRole("teacher", "admin"), tutorHandler.UpdateNode)
	api.Delete("/subjects/nodes/:id", middleware.RequireRole("teacher", "admin"), tutorHandler.DeleteNode)
	api.Post("/subjects/:subject/edges", middleware.RequireRole("teacher", "admin"), tutorHandler.CreateEdge)
	api.Delete("/subjects/edges/:id", middleware.RequireRole("teacher", "admin"), tutorHandler.DeleteEdge)
	api.Post("/nodes/:nodeId/questions", middleware.RequireRole("teacher", "admin"), tutorHandler.CreateQuestion)
	api.Post("/nodes/:nodeId/questions/bulk", middleware.RequireRole("teacher", "admin"), tutorHandler.CreateQuestionsBulk)
	api.Put("/questions/:id", middleware.RequireRole("teacher", "admin"), tutorHandler.UpdateQuestion)
	api.Delete("/questions/:id", middleware.RequireRole("teacher", "admin"), tutorHandler.DeleteQuestion)
	api.Post("/nodes/:nodeId/upload-theory", middleware.RequireRole("teacher", "admin"), tutorHandler.UploadTheory)
	api.Post("/import/master-bank", middleware.RequireRole("teacher", "admin"), tutorHandler.ImportMasterBank)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}

	port = strings.TrimPrefix(port, ":")

	// Print all registered routes for debugging
	for _, r := range app.GetRoutes() {
		log.Printf("[DEBUG-ROUTE] %s %s", r.Method, r.Path)
	}

	log.Printf("Aurora Assistant Server starting on port %s", port)
	log.Fatal(app.Listen(":" + port))
}
