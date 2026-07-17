package main

import (
	"log"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/logger"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/google/uuid"
	"github.com/joho/godotenv"

	"backend/internal/config"
	"backend/internal/handler"
	"backend/internal/middleware"
	"backend/internal/model"
	"backend/internal/service"
)

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

	// Services
	authSvc := service.NewAuthService(config.DB, os.Getenv("JWT_SECRET"))
	aiSvc := service.NewAIService(config.DB)
	tutorSvc := service.NewTutorService(config.DB, aiSvc)

	// Handlers
	authHandler := handler.NewAuthHandler(authSvc)
	tutorHandler := handler.NewTutorHandler(tutorSvc)

	// Seed Demo Accounts & Mock Statistics natively (clean delete and register fresh with cascade)
	config.DB.Exec("DELETE FROM messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE student_id IN (SELECT id FROM users WHERE email IN (?, ?, ?, ?, ?)))", "student@aurora.edu.vn", "teacher@aurora.edu.vn", "studentA@aurora.edu.vn", "studentB@aurora.edu.vn", "studentC@aurora.edu.vn")
	config.DB.Exec("DELETE FROM chat_sessions WHERE student_id IN (SELECT id FROM users WHERE email IN (?, ?, ?, ?, ?))", "student@aurora.edu.vn", "teacher@aurora.edu.vn", "studentA@aurora.edu.vn", "studentB@aurora.edu.vn", "studentC@aurora.edu.vn")
	config.DB.Exec("DELETE FROM student_states WHERE student_id IN (SELECT id FROM users WHERE email IN (?, ?, ?, ?, ?))", "student@aurora.edu.vn", "teacher@aurora.edu.vn", "studentA@aurora.edu.vn", "studentB@aurora.edu.vn", "studentC@aurora.edu.vn")
	config.DB.Exec("DELETE FROM activity_logs WHERE student_id IN (SELECT id FROM users WHERE email IN (?, ?, ?, ?, ?))", "student@aurora.edu.vn", "teacher@aurora.edu.vn", "studentA@aurora.edu.vn", "studentB@aurora.edu.vn", "studentC@aurora.edu.vn")
	config.DB.Exec("DELETE FROM topics WHERE teacher_id IN (SELECT id FROM users WHERE email IN (?, ?, ?, ?, ?))", "student@aurora.edu.vn", "teacher@aurora.edu.vn", "studentA@aurora.edu.vn", "studentB@aurora.edu.vn", "studentC@aurora.edu.vn")
	config.DB.Exec("DELETE FROM users WHERE email IN (?, ?, ?, ?, ?)", "student@aurora.edu.vn", "teacher@aurora.edu.vn", "studentA@aurora.edu.vn", "studentB@aurora.edu.vn", "studentC@aurora.edu.vn")
	
	
	authSvc.Register("student@aurora.edu.vn", "demo123", "Học sinh Demo", "student")
	authSvc.Register("teacher@aurora.edu.vn", "demo123", "Giáo viên Demo", "teacher")
	authSvc.Register("studentA@aurora.edu.vn", "demo123", "Nguyễn Văn A", "student")
	authSvc.Register("studentB@aurora.edu.vn", "demo123", "Trần Thị B", "student")
	authSvc.Register("studentC@aurora.edu.vn", "demo123", "Phạm Văn C", "student")

	// Get mock student IDs
	var studentAId, studentBId, studentCId string
	config.DB.Table("users").Where("email = ?", "studentA@aurora.edu.vn").Select("id").Row().Scan(&studentAId)
	config.DB.Table("users").Where("email = ?", "studentB@aurora.edu.vn").Select("id").Row().Scan(&studentBId)
	config.DB.Table("users").Where("email = ?", "studentC@aurora.edu.vn").Select("id").Row().Scan(&studentCId)

	// Create mock sessions
	sessionAId := uuid.New().String()
	sessionBId := uuid.New().String()
	sessionCId := uuid.New().String()
	
	config.DB.Exec("INSERT INTO chat_sessions (id, student_id, topic, status, mode, created_at, updated_at) VALUES (?, ?, 'Cộng phân số', 'active', 'feynman', NOW(), NOW())", sessionAId, studentAId)
	config.DB.Exec("INSERT INTO chat_sessions (id, student_id, topic, status, mode, created_at, updated_at) VALUES (?, ?, 'Nhân thập phân', 'active', 'socratic', NOW(), NOW())", sessionBId, studentBId)
	config.DB.Exec("INSERT INTO chat_sessions (id, student_id, topic, status, mode, created_at, updated_at) VALUES (?, ?, 'Chia phân số', 'active', 'feynman', NOW(), NOW())", sessionCId, studentCId)

	// Insert mock messages
	config.DB.Exec("INSERT INTO messages (id, session_id, sender, content, detected_gap, is_correct_step, feynman_score, created_at) VALUES (?, ?, 'student', 'Ta cộng hai tử số và giữ nguyên mẫu số chung.', '', true, 0, NOW())", uuid.New().String(), sessionAId)
	config.DB.Exec("INSERT INTO messages (id, session_id, sender, content, detected_gap, is_correct_step, feynman_score, created_at) VALUES (?, ?, 'ai', 'Tuyệt vời thầy ơi!', '', true, 92, NOW())", uuid.New().String(), sessionAId)
	
	config.DB.Exec("INSERT INTO messages (id, session_id, sender, content, detected_gap, is_correct_step, feynman_score, created_at) VALUES (?, ?, 'student', 'Em nhân hai số rồi bỏ dấu phẩy đi luôn.', '', false, 0, NOW())", uuid.New().String(), sessionBId)
	config.DB.Exec("INSERT INTO messages (id, session_id, sender, content, detected_gap, is_correct_step, feynman_score, created_at) VALUES (?, ?, 'ai', 'Sai rồi em, phải đếm chữ số thập phân chứ.', 'Nhân số thập phân', false, 0, NOW())", uuid.New().String(), sessionBId)
	config.DB.Exec("INSERT INTO messages (id, session_id, sender, content, detected_gap, is_correct_step, feynman_score, created_at) VALUES (?, ?, 'student', 'Em quy đồng mẫu số bằng cách cộng tử với tử mẫu với mẫu.', '', false, 0, NOW())", uuid.New().String(), sessionBId)
	config.DB.Exec("INSERT INTO messages (id, session_id, sender, content, detected_gap, is_correct_step, feynman_score, created_at) VALUES (?, ?, 'ai', 'Không đúng rồi, phải quy đồng mẫu số chứ.', 'Cộng hai phân số khác mẫu', false, 0, NOW())", uuid.New().String(), sessionBId)
	
	config.DB.Exec("INSERT INTO messages (id, session_id, sender, content, detected_gap, is_correct_step, feynman_score, created_at) VALUES (?, ?, 'student', 'Lấy số đó nhân nghịch đảo là xong chứ gì.', '', true, 0, NOW())", uuid.New().String(), sessionCId)
	config.DB.Exec("INSERT INTO messages (id, session_id, sender, content, detected_gap, is_correct_step, feynman_score, created_at) VALUES (?, ?, 'ai', 'Em chưa hiểu lắm thầy ơi, nghịch đảo là gì ạ?', '', false, 58, NOW())", uuid.New().String(), sessionCId)

	// Seed demo topics for teacher
	var teacherID string
	config.DB.Table("users").Where("email = ?", "teacher@aurora.edu.vn").Select("id").Row().Scan(&teacherID)
	config.DB.Exec("DELETE FROM topics WHERE teacher_id = ?", teacherID)

	topic1Id := uuid.New().String()
	topic2Id := uuid.New().String()
	topic3Id := uuid.New().String()
	config.DB.Exec(`INSERT INTO topics (id, teacher_id, name, subject, grade_level, modes, axioms_json, system_prompt, common_mistakes, hint_level, published, created_at, updated_at) VALUES (?, ?, 'Cộng phân số khác mẫu', 'Toán', 'Lớp 4', 'socratic,feynman', ?, '', '', 'medium', true, NOW(), NOW())`,
		topic1Id, teacherID,
		`[{"id":"ax1","text":"Hai phân số chỉ cộng trừ được khi cùng mẫu số.","category":"Axiom Gốc"},{"id":"ax2","text":"Nhân cả tử và mẫu với cùng số khác 0 không đổi giá trị phân số.","category":"Quy tắc"},{"id":"ax3","text":"Cộng hai phân số cùng mẫu: cộng tử giữ nguyên mẫu.","category":"Kết quả"}]`)
	config.DB.Exec(`INSERT INTO topics (id, teacher_id, name, subject, grade_level, modes, axioms_json, system_prompt, common_mistakes, hint_level, published, created_at, updated_at) VALUES (?, ?, 'Nhân số thập phân', 'Toán', 'Lớp 5', 'socratic', ?, '', 'Học sinh hay quên đếm chữ số thập phân sau dấu phẩy.', 'high', true, NOW(), NOW())`,
		topic2Id, teacherID,
		`[{"id":"ax1","text":"Phép nhân là phép cộng lặp lại nhiều lần.","category":"Axiom Gốc"},{"id":"ax2","text":"Đếm tổng số chữ số thập phân ở cả hai thừa số.","category":"Quy tắc"}]`)
	config.DB.Exec(`INSERT INTO topics (id, teacher_id, name, subject, grade_level, modes, axioms_json, system_prompt, common_mistakes, hint_level, published, created_at, updated_at) VALUES (?, ?, 'Chia phân số', 'Toán', 'Lớp 5', 'feynman', ?, 'Hãy luôn hỏi học sinh giải thích tại sao phải nhân nghịch đảo.', '', 'low', false, NOW(), NOW())`,
		topic3Id, teacherID,
		`[{"id":"ax1","text":"Chia cho một phân số bằng nhân với nghịch đảo.","category":"Axiom Gốc"},{"id":"ax2","text":"Nghịch đảo: đổi tử thành mẫu, mẫu thành tử.","category":"Quy tắc"}]`)
	// Seed Tree Nodes and Questions if not exists
	var nodeCount int64
	config.DB.Model(&model.Node{}).Count(&nodeCount)
	if nodeCount == 0 {
		log.Println("Seeding tree nodes and questions...")
		// 1. Math nodes
		mathRootID := uuid.New()
		mathNode1ID := uuid.New()
		mathNode11ID := uuid.New()
		mathNode12ID := uuid.New()
		mathNode2ID := uuid.New()

		// Save math nodes
		config.DB.Create(&model.Node{ID: mathRootID, Subject: "Toán Lớp 5", Name: "Toán Lớp 5", Theory: "Chào mừng bạn đến với chương trình Toán Lớp 5! Chúng ta sẽ đi từ các phép tính phân số, số thập phân cho đến hình học nâng cao.", PosX: 400, PosY: 50, IsRoot: true, CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Node{ID: mathNode1ID, Subject: "Toán Lớp 5", Name: "Phép cộng phân số", Theory: "Hai phân số chỉ cộng hoặc trừ được khi chúng có cùng mẫu số. Nếu khác mẫu, ta quy đồng mẫu số rồi thực hiện cộng tử và giữ nguyên mẫu.", PosX: 250, PosY: 180, IsRoot: false, CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Node{ID: mathNode11ID, Subject: "Toán Lớp 5", Name: "Cộng phân số cùng mẫu", Theory: "Quy tắc: Muốn cộng hai phân số có cùng mẫu số, ta cộng hai tử số với nhau và giữ nguyên mẫu số. Ví dụ: 1/5 + 2/5 = (1+2)/5 = 3/5.", PosX: 150, PosY: 310, IsRoot: false, CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Node{ID: mathNode12ID, Subject: "Toán Lớp 5", Name: "Cộng phân số khác mẫu", Theory: "Quy tắc: Muốn cộng hai phân số khác mẫu số, ta quy đồng mẫu số của hai phân số đó, rồi cộng hai phân số cùng mẫu vừa quy đồng. Ví dụ: 1/2 + 1/3 = 3/6 + 2/6 = 5/6.", PosX: 350, PosY: 310, IsRoot: false, CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Node{ID: mathNode2ID, Subject: "Toán Lớp 5", Name: "Phép nhân số thập phân", Theory: "Muốn nhân một số thập phân với một số tự nhiên, ta nhân như nhân các số tự nhiên, sau đó đếm xem phần thập phân có bao nhiêu chữ số rồi dùng dấu phẩy tách ở tích bấy nhiêu chữ số.", PosX: 550, PosY: 180, IsRoot: false, CreatedAt: time.Now(), UpdatedAt: time.Now()})

		// Save math edges
		config.DB.Create(&model.Edge{ID: uuid.New(), Subject: "Toán Lớp 5", SourceID: mathRootID, TargetID: mathNode1ID, CreatedAt: time.Now()})
		config.DB.Create(&model.Edge{ID: uuid.New(), Subject: "Toán Lớp 5", SourceID: mathNode1ID, TargetID: mathNode11ID, CreatedAt: time.Now()})
		config.DB.Create(&model.Edge{ID: uuid.New(), Subject: "Toán Lớp 5", SourceID: mathNode1ID, TargetID: mathNode12ID, CreatedAt: time.Now()})
		config.DB.Create(&model.Edge{ID: uuid.New(), Subject: "Toán Lớp 5", SourceID: mathRootID, TargetID: mathNode2ID, CreatedAt: time.Now()})

		// Save questions for mathNode11ID (Cộng cùng mẫu)
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode11ID, Content: "Tính phép tính sau: 1/5 + 2/5 = ?", OptionsJSON: `["3/5", "3/10", "1/5", "2/5"]`, CorrectOption: 0, Difficulty: "easy", CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode11ID, Content: "Tính phép tính sau: 2/7 + 3/7 = ?", OptionsJSON: `["5/7", "5/14", "6/7", "1/7"]`, CorrectOption: 0, Difficulty: "easy", CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode11ID, Content: "Tính phép tính sau và rút gọn: 3/8 + 1/8 = ?", OptionsJSON: `["4/8", "1/2", "4/16", "1/4"]`, CorrectOption: 1, Difficulty: "medium", CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode11ID, Content: "Tính phép tính sau và rút gọn: 5/12 + 1/12 = ?", OptionsJSON: `["6/12", "1/2", "1/4", "5/12"]`, CorrectOption: 1, Difficulty: "medium", CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode11ID, Content: "Một bình nước có 2/9 lít nước, người ta đổ thêm vào 4/9 lít nước nữa. Hỏi trong bình có bao nhiêu lít nước? (Rút gọn kết quả)", OptionsJSON: `["6/18 lít", "2/3 lít", "1/3 lít", "8/9 lít"]`, CorrectOption: 1, Difficulty: "hard", CreatedAt: time.Now(), UpdatedAt: time.Now()})

		// Save questions for mathNode12ID (Cộng khác mẫu)
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode12ID, Content: "Hãy quy đồng mẫu số và cộng: 1/2 + 1/4 = ?", OptionsJSON: `["2/6", "3/4", "1/2", "3/8"]`, CorrectOption: 1, Difficulty: "easy", CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode12ID, Content: "Quy đồng và tính: 1/3 + 1/6 = ?", OptionsJSON: `["2/9", "1/2", "3/6", "2/6"]`, CorrectOption: 1, Difficulty: "easy", CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode12ID, Content: "Tìm kết quả đúng: 1/3 + 2/5 = ?", OptionsJSON: `["3/8", "11/15", "7/15", "3/15"]`, CorrectOption: 1, Difficulty: "medium", CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode12ID, Content: "Tính kết quả sau: 2/3 + 1/4 = ?", OptionsJSON: `["3/7", "11/12", "3/12", "7/12"]`, CorrectOption: 1, Difficulty: "medium", CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode12ID, Content: "Mẹ mua 1/2 kg táo và 3/5 kg cam. Hỏi tổng số kg hoa quả mẹ đã mua là bao nhiêu?", OptionsJSON: `["4/7 kg", "11/10 kg", "9/10 kg", "4/10 kg"]`, CorrectOption: 1, Difficulty: "hard", CreatedAt: time.Now(), UpdatedAt: time.Now()})

		// Save questions for mathNode2ID (Nhân số thập phân)
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode2ID, Content: "Tính phép nhân: 2.5 * 3 = ?", OptionsJSON: `["7.5", "75", "0.75", "12"]`, CorrectOption: 0, Difficulty: "easy", CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode2ID, Content: "Tính phép nhân: 1.2 * 4 = ?", OptionsJSON: `["4.8", "48", "0.48", "1.6"]`, CorrectOption: 0, Difficulty: "medium", CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: mathNode2ID, Content: "Một mảnh vườn hình chữ nhật có chiều rộng là 3.6m, chiều dài gấp 3 lần chiều rộng. Tính chiều dài mảnh vườn.", OptionsJSON: `["10.8m", "9.8m", "6.6m", "10.6m"]`, CorrectOption: 0, Difficulty: "hard", CreatedAt: time.Now(), UpdatedAt: time.Now()})

		// 2. Science nodes
		sciRootID := uuid.New()
		sciNode1ID := uuid.New()
		sciNode2ID := uuid.New()

		config.DB.Create(&model.Node{ID: sciRootID, Subject: "Khoa học Lớp 4", Name: "Khoa học Lớp 4", Theory: "Chào mừng các em học sinh Lớp 4 đến với thế giới Khoa học kỳ thú! Chúng ta sẽ tìm hiểu về nước, không khí và sự sống quanh ta.", PosX: 400, PosY: 50, IsRoot: true, CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Node{ID: sciNode1ID, Subject: "Khoa học Lớp 4", Name: "Vòng tuần hoàn của nước", Theory: "Nước ở ao, hồ, sông, biển bốc hơi thành hơi nước bay lên cao. Hơi nước gặp lạnh ngưng tụ thành những hạt nước nhỏ li ti tạo thành mây. Các đám mây nặng dần rơi xuống thành mưa, chảy về ao hồ sông biển tạo nên vòng tuần hoàn.", PosX: 250, PosY: 200, IsRoot: false, CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Node{ID: sciNode2ID, Subject: "Khoa học Lớp 4", Name: "Vai trò của không khí", Theory: "Không khí có xung quanh ta. Sinh vật (con người, động vật, thực vật) cần không khí để hô hấp. Không khí có khí ô-xy duy trì sự sống và khí ni-tơ, các-bô-níc cùng nhiều khí khác.", PosX: 550, PosY: 200, IsRoot: false, CreatedAt: time.Now(), UpdatedAt: time.Now()})

		config.DB.Create(&model.Edge{ID: uuid.New(), Subject: "Khoa học Lớp 4", SourceID: sciRootID, TargetID: sciNode1ID, CreatedAt: time.Now()})
		config.DB.Create(&model.Edge{ID: uuid.New(), Subject: "Khoa học Lớp 4", SourceID: sciRootID, TargetID: sciNode2ID, CreatedAt: time.Now()})

		// Questions for sciNode1ID
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: sciNode1ID, Content: "Nước từ ao hồ bốc hơi bay lên không trung gặp lạnh ngưng tụ thành gì?", OptionsJSON: `["Mây", "Mưa", "Tuyết", "Sương mù"]`, CorrectOption: 0, Difficulty: "easy", CreatedAt: time.Now(), UpdatedAt: time.Now()})
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: sciNode1ID, Content: "Hiện tượng nước rơi từ mây xuống đất gọi là gì?", OptionsJSON: `["Hơi nước", "Sấm sét", "Mưa", "Bão"]`, CorrectOption: 2, Difficulty: "medium", CreatedAt: time.Now(), UpdatedAt: time.Now()})

		// Questions for sciNode2ID
		config.DB.Create(&model.Question{ID: uuid.New(), NodeID: sciNode2ID, Content: "Khí nào trong không khí là cần thiết nhất cho quá trình hô hấp của con người?", OptionsJSON: `["Các-bô-níc", "Ô-xy", "Ni-tơ", "Khói bụi"]`, CorrectOption: 1, Difficulty: "easy", CreatedAt: time.Now(), UpdatedAt: time.Now()})

		log.Println("Seeding tree completed successfully!")
	}

	// Public Routes
	app.Post("/api/auth/register", authHandler.Register)
	app.Post("/api/auth/login", authHandler.Login)
	app.Get("/api/internal/graph", tutorHandler.GetInternalGraph)

	// Protected Routes
	api := app.Group("/api", middleware.Protected(config.DB))
	
	api.Post("/tutor/sessions", tutorHandler.CreateSession)
	api.Get("/tutor/sessions", tutorHandler.GetSessions)
	api.Get("/tutor/sessions/:id/messages", tutorHandler.GetMessages)
	api.Post("/tutor/sessions/:id/messages", tutorHandler.SendMessage)
	api.Post("/tutor/sessions/:id/axioms", tutorHandler.SaveAxioms)
	api.Get("/tutor/sessions/:id/axioms", tutorHandler.GetAxioms)
	
	api.Get("/teacher/dashboard", tutorHandler.GetDashboard)
	api.Post("/teacher/topics", tutorHandler.CreateTopic)
	api.Get("/teacher/topics", tutorHandler.GetTopics)
	api.Put("/teacher/topics/:id", tutorHandler.UpdateTopic)
	api.Delete("/teacher/topics/:id", tutorHandler.DeleteTopic)

	// New Knowledge Graph & Prerequisite Tree Routes
	api.Get("/subjects", tutorHandler.GetSubjects)
	api.Delete("/subjects/:subject", tutorHandler.DeleteSubject)
	api.Put("/subjects/:subject", tutorHandler.RenameSubject)
	api.Get("/subjects/:subject/tree", tutorHandler.GetTree)
	api.Post("/subjects/:subject/parse-tree", tutorHandler.ParseAndBuildTree)
	api.Post("/subjects/extract-text", tutorHandler.ExtractText)
	api.Post("/subjects/parse-chunk", tutorHandler.ParseChunk)
	api.Post("/subjects/:subject/save-tree", tutorHandler.SaveTree)
	api.Post("/subjects/:subject/nodes", tutorHandler.CreateNode)
	api.Put("/subjects/nodes/:id", tutorHandler.UpdateNode)
	api.Delete("/subjects/nodes/:id", tutorHandler.DeleteNode)
	api.Post("/subjects/:subject/edges", tutorHandler.CreateEdge)
	api.Delete("/subjects/edges/:id", tutorHandler.DeleteEdge)

	api.Get("/subjects/:subject/questions", tutorHandler.GetSubjectQuestions)
	api.Get("/nodes/:nodeId/questions", tutorHandler.GetQuestions)
	api.Post("/nodes/:nodeId/questions", tutorHandler.CreateQuestion)
	api.Post("/nodes/:nodeId/questions/bulk", tutorHandler.CreateQuestionsBulk)
	api.Put("/questions/:id", tutorHandler.UpdateQuestion)
	api.Delete("/questions/:id", tutorHandler.DeleteQuestion)

	api.Post("/nodes/:nodeId/upload-theory", tutorHandler.UploadTheory)
	api.Post("/nodes/:nodeId/chat-theory", tutorHandler.ChatNodeTheory)

	api.Get("/subjects/:subject/state", tutorHandler.GetStudentState)
	api.Post("/subjects/:subject/start", tutorHandler.StartSubjectNode)
	api.Post("/nodes/:nodeId/answer", tutorHandler.SubmitAnswer)
	api.Post("/nodes/:nodeId/cant-do", tutorHandler.SubmitCantDo)
	api.Post("/nodes/:nodeId/adaptive-downgrade", tutorHandler.AdaptiveDowngrade)

	// Personalized Learning Path & Hint Routes
	api.Post("/teacher/learning-path", tutorHandler.CreateLearningPath)
	api.Post("/teacher/learning-path/:threadId/approve", tutorHandler.ApproveLearningPath)
	api.Get("/student/learning-path", tutorHandler.GetStudentLearningPath)
	api.Post("/student/hints", tutorHandler.RequestHint)

	api.Get("/teacher/students-progress", tutorHandler.GetStudentsProgress)
	api.Get("/teacher/monitoring/:subject", tutorHandler.GetMonitoringData)
	api.Get("/teacher/students/:studentId/progress/:subject", tutorHandler.GetStudentSubjectProgress)
	api.Post("/teacher/students/:studentId/re-diagnostic", tutorHandler.RequestReDiagnostic)

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

