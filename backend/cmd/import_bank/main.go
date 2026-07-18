package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"backend/internal/config"
	"backend/internal/model"

	"github.com/google/uuid"
)

type BankQuestion struct {
	ID            string            `json:"id"`
	DeNguon       string            `json:"deNguon"`
	LoaiCau       string            `json:"loaiCau"`
	MucDo         string            `json:"mucDo"`
	MucDoSo       int               `json:"mucDoSo"`
	MucDoTen      string            `json:"mucDoTen"`
	Diem          float64           `json:"diem"`
	ChuDe         string            `json:"chuDe"`
	NodeGraph     string            `json:"nodeGraph"`
	DeBai         string            `json:"deBai"`
	HinhAnh       *string           `json:"hinhAnh"`
	PhuongAn      map[string]string `json:"phuongAn"`
	DapAn         string            `json:"dapAn"`
	LoiGiai       string            `json:"loiGiai"`
	PhanTichSai   map[string]string `json:"phanTichSai"`
	GoiYSocratic  []string          `json:"goiYSocratic"`
}

type BankExam struct {
	De          string         `json:"de"`
	MonHoc      string         `json:"monHoc"`
	Lop         int            `json:"lop"`
	KyThi       string         `json:"kyThi"`
	ThoiGian    int            `json:"thoiGian"`
	TongDiem    float64        `json:"tongDiem"`
	SoCau       int            `json:"soCau"`
	CauHoi      []BankQuestion `json:"cauHoi"`
}

func main() {
	config.ConnectDB()

	// Read de1_bank.json
	data, err := os.ReadFile("../de1_bank.json")
	if err != nil {
		log.Fatalf("Failed to read de1_bank.json: %v", err)
	}

	var bank BankExam
	if err := json.Unmarshal(data, &bank); err != nil {
		log.Fatalf("Failed to parse de1_bank.json: %v", err)
	}

	subjectName := fmt.Sprintf("%s Lớp %d - %s", bank.MonHoc, bank.Lop, bank.KyThi)
	fmt.Printf("Importing %d questions for exam: %s (Subject: %s)...\n", len(bank.CauHoi), bank.De, subjectName)

	// Ensure Subject Nodes exist or map to existing Nodes
	nodeMap := make(map[string]model.Node)

	for _, q := range bank.CauHoi {
		topic := q.ChuDe
		if topic == "" {
			topic = "Tổng hợp"
		}

		// Find or create Node for this topic
		var node model.Node
		err := config.DB.Where("subject = ? AND name = ?", subjectName, topic).First(&node).Error
		if err != nil {
			node = model.Node{
				ID:         uuid.New(),
				Subject:    subjectName,
				Name:       topic,
				Theory:     fmt.Sprintf("Lý thuyết về %s dành cho học sinh lớp %d.", topic, bank.Lop),
				TopicGroup: topic,
				PosX:       100 + float64(len(nodeMap)*150),
				PosY:       100,
				IsRoot:     len(nodeMap) == 0,
				Status:     "active",
				CreatedAt:  time.Now(),
				UpdatedAt:  time.Now(),
			}
			config.DB.Create(&node)
			fmt.Printf("  -> Created Node: %s (ID: %s)\n", topic, node.ID)
		}
		nodeMap[topic] = node

		// Convert Options Map {"A": "val", "B": "val"} to Ordered JSON Slice
		optionsSlice := []string{
			q.PhuongAn["A"],
			q.PhuongAn["B"],
			q.PhuongAn["C"],
			q.PhuongAn["D"],
		}
		optionsBytes, _ := json.Marshal(optionsSlice)

		correctOpt := 0
		switch q.DapAn {
		case "A":
			correctOpt = 0
		case "B":
			correctOpt = 1
		case "C":
			correctOpt = 2
		case "D":
			correctOpt = 3
		}

		diff := "easy"
		if q.MucDo == "TH" {
			diff = "medium"
		} else if q.MucDo == "VD" || q.MucDo == "VDC" {
			diff = "hard"
		}

		// Save Socratic & wrong analysis into DistractorMappings JSON
		metaMap := map[string]interface{}{
			"loiGiai":       q.LoiGiai,
			"phanTichSai":   q.PhanTichSai,
			"goiYSocratic":  q.GoiYSocratic,
			"mucDoTen":      q.MucDoTen,
			"diem":          q.Diem,
			"deNguon":       q.DeNguon,
		}
		metaBytes, _ := json.Marshal(metaMap)

		dbQuestion := model.Question{
			ID:                 uuid.New(),
			NodeID:             node.ID,
			Content:            q.DeBai,
			OptionsJSON:        string(optionsBytes),
			CorrectOption:      correctOpt,
			Difficulty:         diff,
			DistractorMappings: string(metaBytes),
			CreatedAt:          time.Now(),
			UpdatedAt:          time.Now(),
		}

		config.DB.Create(&dbQuestion)
	}

	fmt.Printf("SUCCESS: Fully imported %d questions into DB under subject '%s'!\n", len(bank.CauHoi), subjectName)
}
