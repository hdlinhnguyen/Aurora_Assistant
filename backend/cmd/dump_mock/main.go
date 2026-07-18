package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	"backend/internal/config"
	"backend/internal/model"
)

type MockNode struct {
	Name       string  `json:"name"`
	Theory     string  `json:"theory"`
	TopicGroup string  `json:"topicGroup"`
	PosX       float64 `json:"posX"`
	PosY       float64 `json:"posY"`
	IsRoot     bool    `json:"isRoot"`
}

type MockEdge struct {
	SourceNodeName string `json:"sourceNodeName"`
	TargetNodeName string `json:"targetNodeName"`
	Reason         string `json:"reason,omitempty"`
}

type MockGraph struct {
	Subject string     `json:"subject"`
	Nodes   []MockNode `json:"nodes"`
	Edges   []MockEdge `json:"edges"`
}

func main() {
	config.ConnectDB()

	// Find available subjects
	var subjects []string
	config.DB.Model(&model.Node{}).Distinct("subject").Pluck("subject", &subjects)
	fmt.Printf("Found subjects in DB: %v\n", subjects)

	targetSubject := "Toán đại số"
	if len(subjects) > 0 {
		targetSubject = subjects[0]
		for _, s := range subjects {
			if s == "Toán đại số" || s == "Toán đại test" {
				targetSubject = s
				break
			}
		}
	}

	fmt.Printf("Dumping tree for subject: %s\n", targetSubject)

	var dbNodes []model.Node
	if err := config.DB.Where("subject = ?", targetSubject).Find(&dbNodes).Error; err != nil {
		log.Fatalf("Failed to query nodes: %v", err)
	}

	nodeMap := make(map[string]string) // ID string -> Name
	mockNodes := make([]MockNode, 0, len(dbNodes))

	for _, n := range dbNodes {
		nodeMap[n.ID.String()] = n.Name
		mockNodes = append(mockNodes, MockNode{
			Name:       n.Name,
			Theory:     n.Theory,
			TopicGroup: n.TopicGroup,
			PosX:       n.PosX,
			PosY:       n.PosY,
			IsRoot:     n.IsRoot,
		})
	}

	var dbEdges []model.Edge
	if err := config.DB.Where("subject = ?", targetSubject).Find(&dbEdges).Error; err != nil {
		log.Fatalf("Failed to query edges: %v", err)
	}

	mockEdges := make([]MockEdge, 0, len(dbEdges))
	for _, e := range dbEdges {
		srcName := nodeMap[e.SourceID.String()]
		tgtName := nodeMap[e.TargetID.String()]
		if srcName != "" && tgtName != "" {
			mockEdges = append(mockEdges, MockEdge{
				SourceNodeName: srcName,
				TargetNodeName: tgtName,
			})
		}
	}

	result := MockGraph{
		Subject: "Toán đại số (Mẫu)",
		Nodes:   mockNodes,
		Edges:   mockEdges,
	}

	outPath := "../frontend/public/mock_knowledge_tree.json"
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		log.Fatalf("Failed to marshal JSON: %v", err)
	}

	if err := os.WriteFile(outPath, data, 0644); err != nil {
		log.Fatalf("Failed to write mock_knowledge_tree.json: %v", err)
	}

	fmt.Printf("SUCCESS: Dumped %d nodes and %d edges of '%s' into %s\n", len(mockNodes), len(mockEdges), targetSubject, outPath)
}
