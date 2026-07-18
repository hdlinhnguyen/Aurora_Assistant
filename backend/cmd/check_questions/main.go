package main

import (
	"fmt"

	"backend/internal/config"
	"backend/internal/model"
)

func main() {
	config.ConnectDB()

	var subjects []string
	config.DB.Model(&model.Node{}).Distinct("subject").Pluck("subject", &subjects)
	fmt.Printf("=== SUBJECTS IN DB (%d) ===\n", len(subjects))
	for i, s := range subjects {
		var nodeCount int64
		config.DB.Model(&model.Node{}).Where("subject = ?", s).Count(&nodeCount)

		var qCount int64
		config.DB.Table("questions").Joins("join nodes on questions.node_id = nodes.id").Where("nodes.subject = ? AND questions.deleted_at IS NULL", s).Count(&qCount)

		fmt.Printf("[%d] Môn: '%s' | %d Nodes | %d Questions\n", i+1, s, nodeCount, qCount)
	}

	var totalQ int64
	config.DB.Model(&model.Question{}).Count(&totalQ)
	fmt.Printf("\nTOTAL QUESTIONS IN DB: %d\n", totalQ)

	var questions []model.Question
	config.DB.Limit(10).Find(&questions)
	fmt.Printf("\n=== SAMPLE QUESTIONS IN DB (%d) ===\n", len(questions))
	for _, q := range questions {
		var node model.Node
		config.DB.Where("id = ?", q.NodeID).First(&node)
		fmt.Printf("- Q-ID: %s | Node: '%s' (Subject: '%s') | Content: %.40s...\n", q.ID, node.Name, node.Subject, q.Content)
	}
}
