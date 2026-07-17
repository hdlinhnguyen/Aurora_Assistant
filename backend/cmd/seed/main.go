package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"backend/internal/config"
	"backend/internal/model"
	"backend/internal/service"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
)

func main() {
	log.Println("=== STARTING DB SEEDING SCRIPT ===")

	// Load env
	if err := godotenv.Load("../.env"); err != nil {
		if err = godotenv.Load(); err != nil {
			log.Println("No .env file found, using system environment variables")
		}
	}

	config.ConnectDB()

	authSvc := service.NewAuthService(config.DB, os.Getenv("JWT_SECRET"))

	// 1. Seed 20 Mock Student Accounts
	log.Println("1. Seeding 20 mock student accounts...")
	for i := 1; i <= 20; i++ {
		email := fmt.Sprintf("student%02d@aurora.edu.vn", i)
		name := fmt.Sprintf("Học sinh Mock %02d", i)
		password := "demo123"

		// Clear if exists
		config.DB.Exec("DELETE FROM messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE student_id IN (SELECT id FROM users WHERE email = ?))", email)
		config.DB.Exec("DELETE FROM chat_sessions WHERE student_id IN (SELECT id FROM users WHERE email = ?)", email)
		config.DB.Exec("DELETE FROM student_states WHERE student_id IN (SELECT id FROM users WHERE email = ?)", email)
		config.DB.Exec("DELETE FROM activity_logs WHERE student_id IN (SELECT id FROM users WHERE email = ?)", email)
		config.DB.Exec("DELETE FROM users WHERE email = ?", email)

		// Register
		_, err := authSvc.Register(email, password, name, "student")
		if err != nil {
			log.Printf("Failed to register %s: %v", email, err)
		} else {
			log.Printf("Registered student: %s", email)
		}
	}

	// 2. Seed 10 Questions for the 3 Math Nodes
	log.Println("2. Seeding 10 questions for each of the 3 math nodes...")

	node1ID := uuid.MustParse("e59bc53a-e05e-4aff-bf5d-187e4d750ab4") // Cộng phân số cùng mẫu
	node2ID := uuid.MustParse("08c5c8f0-912f-4bc1-adb7-61e1b2e3aae1") // Cộng phân số khác mẫu
	node3ID := uuid.MustParse("9a8b312c-4b90-41a3-97ff-ed800c054d81") // Phép nhân số thập phân

	// Clear existing questions for these 3 nodes
	config.DB.Where("node_id IN (?)", []uuid.UUID{node1ID, node2ID, node3ID}).Delete(&model.Question{})

	// Seed Node 1 (Cộng cùng mẫu)
	node1Qs := []model.Question{
		{Content: "Tính phép tính sau: 1/5 + 2/5 = ?", OptionsJSON: `["3/5", "3/10", "1/5", "2/5"]`, CorrectOption: 0, Difficulty: "easy"},
		{Content: "Tính phép tính sau: 2/7 + 3/7 = ?", OptionsJSON: `["5/7", "5/14", "6/7", "1/7"]`, CorrectOption: 0, Difficulty: "easy"},
		{Content: "Tính phép tính sau và rút gọn: 3/8 + 1/8 = ?", OptionsJSON: `["4/8", "1/2", "4/16", "1/4"]`, CorrectOption: 1, Difficulty: "medium"},
		{Content: "Tính phép tính sau và rút gọn: 5/12 + 1/12 = ?", OptionsJSON: `["6/12", "1/2", "1/4", "5/12"]`, CorrectOption: 1, Difficulty: "medium"},
		{Content: "Một bình nước có 2/9 lít nước, đổ thêm vào 4/9 lít nước nữa. Hỏi trong bình có bao nhiêu lít nước? (Rút gọn kết quả)", OptionsJSON: `["6/18 lít", "2/3 lít", "1/3 lít", "8/9 lít"]`, CorrectOption: 1, Difficulty: "hard"},
		{Content: "Tính phép tính sau: 4/11 + 5/11 = ?", OptionsJSON: `["9/11", "9/22", "1/11", "2/11"]`, CorrectOption: 0, Difficulty: "easy"},
		{Content: "Tính phép tính sau và rút gọn: 7/15 + 3/15 = ?", OptionsJSON: `["10/30", "10/15", "2/3", "1/3"]`, CorrectOption: 2, Difficulty: "medium"},
		{Content: "Tính kết quả sau: 3/10 + 7/10 = ?", OptionsJSON: `["1", "10/20", "2", "0.5"]`, CorrectOption: 0, Difficulty: "easy"},
		{Content: "Tính phép tính sau: 5/13 + 6/13 = ?", OptionsJSON: `["11/13", "11/26", "1/13", "12/13"]`, CorrectOption: 0, Difficulty: "medium"},
		{Content: "Tính kết quả phép cộng sau: 1/6 + 5/6 = ?", OptionsJSON: `["1", "6/12", "5/6", "2/6"]`, CorrectOption: 0, Difficulty: "hard"},
	}

	// Seed Node 2 (Cộng khác mẫu)
	node2Qs := []model.Question{
		{Content: "Hãy quy đồng mẫu số và cộng: 1/2 + 1/4 = ?", OptionsJSON: `["3/4", "2/6", "1/2", "3/8"]`, CorrectOption: 0, Difficulty: "easy"},
		{Content: "Quy đồng và tính: 1/3 + 1/6 = ?", OptionsJSON: `["1/2", "2/9", "3/6", "2/6"]`, CorrectOption: 0, Difficulty: "easy"},
		{Content: "Tìm kết quả đúng: 1/3 + 2/5 = ?", OptionsJSON: `["11/15", "3/8", "7/15", "3/15"]`, CorrectOption: 0, Difficulty: "medium"},
		{Content: "Tính kết quả sau: 2/3 + 1/4 = ?", OptionsJSON: `["11/12", "3/7", "3/12", "7/12"]`, CorrectOption: 0, Difficulty: "medium"},
		{Content: "Mẹ mua 1/2 kg táo và 3/5 kg cam. Hỏi tổng số kg hoa quả mẹ đã mua là bao nhiêu?", OptionsJSON: `["11/10 kg", "4/7 kg", "9/10 kg", "4/10 kg"]`, CorrectOption: 0, Difficulty: "hard"},
		{Content: "Tính kết quả sau: 2/5 + 3/10 = ?", OptionsJSON: `["7/10", "5/15", "1/2", "3/10"]`, CorrectOption: 0, Difficulty: "easy"},
		{Content: "Tính kết quả sau: 3/4 + 1/8 = ?", OptionsJSON: `["7/8", "4/12", "1/2", "3/8"]`, CorrectOption: 0, Difficulty: "medium"},
		{Content: "Tính kết quả sau: 1/6 + 2/3 = ?", OptionsJSON: `["5/6", "3/9", "1/2", "2/3"]`, CorrectOption: 0, Difficulty: "medium"},
		{Content: "Tính kết quả sau: 2/7 + 1/3 = ?", OptionsJSON: `["13/21", "3/10", "3/21", "1/7"]`, CorrectOption: 0, Difficulty: "hard"},
		{Content: "Tính kết quả sau: 4/5 + 1/2 = ?", OptionsJSON: `["13/10", "5/7", "5/10", "3/5"]`, CorrectOption: 0, Difficulty: "hard"},
	}

	// Seed Node 3 (Nhân số thập phân)
	node3Qs := []model.Question{
		{Content: "Tính phép nhân: 2.5 * 3 = ?", OptionsJSON: `["7.5", "75", "0.75", "12"]`, CorrectOption: 0, Difficulty: "easy"},
		{Content: "Tính phép nhân: 1.2 * 4 = ?", OptionsJSON: `["4.8", "48", "0.48", "1.6"]`, CorrectOption: 0, Difficulty: "medium"},
		{Content: "Một mảnh vườn hình chữ nhật có chiều rộng là 3.6m, chiều dài gấp 3 lần chiều rộng. Tính chiều dài mảnh vườn.", OptionsJSON: `["10.8m", "9.8m", "6.6m", "10.6m"]`, CorrectOption: 0, Difficulty: "hard"},
		{Content: "Tính phép nhân: 0.15 * 5 = ?", OptionsJSON: `["0.75", "7.5", "75", "0.15"]`, CorrectOption: 0, Difficulty: "easy"},
		{Content: "Tính phép nhân: 3.6 * 2 = ?", OptionsJSON: `["7.2", "72", "0.72", "1.8"]`, CorrectOption: 0, Difficulty: "easy"},
		{Content: "Tính phép nhân: 0.25 * 4 = ?", OptionsJSON: `["1", "10", "0.1", "0.01"]`, CorrectOption: 0, Difficulty: "medium"},
		{Content: "Tính phép nhân: 1.5 * 6 = ?", OptionsJSON: `["9", "90", "0.9", "1.5"]`, CorrectOption: 0, Difficulty: "medium"},
		{Content: "Tính phép nhân: 0.8 * 7 = ?", OptionsJSON: `["5.6", "56", "0.56", "1.5"]`, CorrectOption: 0, Difficulty: "hard"},
		{Content: "Tính phép nhân: 2.4 * 5 = ?", OptionsJSON: `["12", "120", "1.2", "0.12"]`, CorrectOption: 0, Difficulty: "medium"},
		{Content: "Tính phép nhân: 4.5 * 2 = ?", OptionsJSON: `["9", "90", "0.9", "4.5"]`, CorrectOption: 0, Difficulty: "hard"},
	}

	// Save all questions
	saveQs := func(nodeID uuid.UUID, qs []model.Question) {
		for _, q := range qs {
			q.ID = uuid.New()
			q.NodeID = nodeID
			q.CreatedAt = time.Now()
			q.UpdatedAt = time.Now()
			if err := config.DB.Create(&q).Error; err != nil {
				log.Printf("Failed to create question: %v", err)
			}
		}
	}

	saveQs(node1ID, node1Qs)
	saveQs(node2ID, node2Qs)
	saveQs(node3ID, node3Qs)

	log.Println("Seeded successfully!")
	log.Println("=== SEEDING COMPLETED ===")
}
