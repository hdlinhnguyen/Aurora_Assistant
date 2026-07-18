package service

import (
	"backend/internal/model"
	"testing"

	"github.com/google/uuid"
)

func TestGraphValidator_DetectCycles(t *testing.T) {
	gv := NewGraphValidator()

	u1 := uuid.New()
	u2 := uuid.New()
	u3 := uuid.New()

	nodes := []model.Node{
		{ID: u1, Name: "Node A"},
		{ID: u2, Name: "Node B"},
		{ID: u3, Name: "Node C"},
	}

	// 1. Clean graph: A -> B -> C (no cycle)
	edgesClean := []model.Edge{
		{SourceID: u1, TargetID: u2},
		{SourceID: u2, TargetID: u3},
	}
	hasCycle, _ := gv.DetectCycles(nodes, edgesClean)
	if hasCycle {
		t.Error("Expected clean graph to have NO cycle, but found one")
	}

	// 2. Cycle graph: A -> B -> C -> A
	edgesCycle := []model.Edge{
		{SourceID: u1, TargetID: u2},
		{SourceID: u2, TargetID: u3},
		{SourceID: u3, TargetID: u1},
	}
	hasCycle2, msg := gv.DetectCycles(nodes, edgesCycle)
	if !hasCycle2 {
		t.Error("Expected cycle graph to have a cycle, but none detected")
	}
	if msg == "" {
		t.Error("Expected detailed cycle path explanation, got empty string")
	}
}

func TestGraphValidator_DetectBackwardGrades(t *testing.T) {
	gv := NewGraphValidator()

	u1 := uuid.New()
	u2 := uuid.New()

	// Node A is Lớp 8, Node B is Lớp 7
	nodes := []model.Node{
		{ID: u1, Name: "Toán Lớp 8 - Đa thức"},
		{ID: u2, Name: "Toán Lớp 7 - Biểu thức"},
	}

	// 1. Backward edge: Lớp 8 -> Lớp 7 (Invalid)
	edgesBackward := []model.Edge{
		{SourceID: u1, TargetID: u2},
	}
	hasBackward, _ := gv.DetectBackwardGrades(nodes, edgesBackward)
	if !hasBackward {
		t.Error("Expected backward grade violation to be detected, but it was missed")
	}

	// 2. Forward edge: Lớp 7 -> Lớp 8 (Valid)
	edgesForward := []model.Edge{
		{SourceID: u2, TargetID: u1},
	}
	hasBackward2, _ := gv.DetectBackwardGrades(nodes, edgesForward)
	if hasBackward2 {
		t.Error("Expected forward grade edge to be valid, but got violation error")
	}
}

func TestGraphValidator_PerformTransitiveReduction(t *testing.T) {
	gv := NewGraphValidator()

	u1 := uuid.New()
	u2 := uuid.New()
	u3 := uuid.New()

	nodes := []model.Node{
		{ID: u1, Name: "Node A"},
		{ID: u2, Name: "Node B"},
		{ID: u3, Name: "Node C"},
	}

	// A -> B, B -> C, and redundant A -> C
	edges := []model.Edge{
		{SourceID: u1, TargetID: u2},
		{SourceID: u2, TargetID: u3},
		{SourceID: u1, TargetID: u3}, // Redundant
	}

	reduced := gv.PerformTransitiveReduction(nodes, edges)
	if len(reduced) != 2 {
		t.Errorf("Expected reduced edges count to be 2, but got %d", len(reduced))
	}

	// Verify that the redundant edge A -> C (u1 -> u3) was removed
	for _, e := range reduced {
		if e.SourceID == u1 && e.TargetID == u3 {
			t.Error("Redundant edge A -> C should have been removed by Transitive Reduction")
		}
	}
}
