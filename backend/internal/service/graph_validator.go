package service

import (
	"backend/internal/model"
	"github.com/google/uuid"
)

// GraphValidator holds the verification rules for the knowledge graph
type GraphValidator struct{}

func NewGraphValidator() *GraphValidator {
	return &GraphValidator{}
}

// ValidateGraph runs all invariant validation checks on the graph nodes and edges.
// Returns success boolean and a detailed error message string if any validation fails.
func (gv *GraphValidator) ValidateGraph(nodes []model.Node, edges []model.Edge) (bool, string) {
	// 1. Check for self-loops and cycle detection
	if hasCycle, msg := gv.DetectCycles(nodes, edges); hasCycle {
		return false, "Phát hiện chu trình vòng lặp: " + msg
	}

	// 2. Check for backward-grade prerequisites
	if hasBackward, msg := gv.DetectBackwardGrades(nodes, edges); hasBackward {
		return false, "Vi phạm thứ tự lớp: " + msg
	}

	// 3. Check for isolated nodes (except root node)
	if hasIsolated, msg := gv.DetectIsolatedNodes(nodes, edges); hasIsolated {
		return false, "Phát hiện node mồ côi (không có liên kết): " + msg
	}

	return true, ""
}

// DetectCycles returns true if a cycle is found in the graph. Uses DFS with coloring.
func (gv *GraphValidator) DetectCycles(nodes []model.Node, edges []model.Edge) (bool, string) {
	nodeMap := make(map[uuid.UUID]model.Node)
	for _, n := range nodes {
		nodeMap[n.ID] = n
	}

	adj := make(map[uuid.UUID][]uuid.UUID)
	for _, e := range edges {
		adj[e.SourceID] = append(adj[e.SourceID], e.TargetID)
	}

	// State map: 0 = unvisited, 1 = visiting (gray), 2 = visited (black)
	state := make(map[uuid.UUID]int)

	var dfs func(u uuid.UUID) (bool, string)
	dfs = func(u uuid.UUID) (bool, string) {
		state[u] = 1 // Mark as visiting

		for _, v := range adj[u] {
			if state[v] == 1 {
				// Cycle detected
				nodeU := nodeMap[u].Name
				nodeV := nodeMap[v].Name
				return true, nodeU + " -> " + nodeV + " (Vòng lặp quay lại)"
			}
			if state[v] == 0 {
				if hasCycle, path := dfs(v); hasCycle {
					return true, nodeMap[u].Name + " -> " + path
				}
			}
		}

		state[u] = 2 // Mark as fully visited
		return false, ""
	}

	for _, n := range nodes {
		if state[n.ID] == 0 {
			if hasCycle, path := dfs(n.ID); hasCycle {
				return true, path
			}
		}
	}

	return false, ""
}

// DetectBackwardGrades verifies that no edge goes from a higher grade to a lower grade.
func (gv *GraphValidator) DetectBackwardGrades(nodes []model.Node, edges []model.Edge) (bool, string) {
	nodeMap := make(map[uuid.UUID]model.Node)
	for _, n := range nodes {
		nodeMap[n.ID] = n
	}

	// Helper to extract grade from node subject/group or name
	getGradeValue := func(n model.Node) int {
		// Grade is stored in the node's name or metadata, but usually we can match class level.
		// For our math program, we check naming conventions or defaults.
		// Let's check node attributes. Let's fallback to search inside node name or group.
		// E.g., "Lớp 5" or "Lớp 6"
		// If name contains "Lớp 4" -> 4, etc.
		if containsString(n.Name, "Lớp 4") { return 4 }
		if containsString(n.Name, "Lớp 5") { return 5 }
		if containsString(n.Name, "Lớp 6") { return 6 }
		if containsString(n.Name, "Lớp 7") { return 7 }
		if containsString(n.Name, "Lớp 8") { return 8 }
		if containsString(n.Name, "Lớp 9") { return 9 }
		if containsString(n.Name, "Lớp 10") { return 10 }
		
		if containsString(n.TopicGroup, "Lớp 4") { return 4 }
		if containsString(n.TopicGroup, "Lớp 5") { return 5 }
		if containsString(n.TopicGroup, "Lớp 6") { return 6 }
		if containsString(n.TopicGroup, "Lớp 7") { return 7 }
		if containsString(n.TopicGroup, "Lớp 8") { return 8 }
		
		return 0 // default fallback
	}

	for _, e := range edges {
		src, hasSrc := nodeMap[e.SourceID]
		tgt, hasTgt := nodeMap[e.TargetID]
		if !hasSrc || !hasTgt {
			continue
		}

		srcGrade := getGradeValue(src)
		tgtGrade := getGradeValue(tgt)

		if srcGrade > 0 && tgtGrade > 0 && srcGrade > tgtGrade {
			return true, src.Name + " (Lớp " + string(rune(48+srcGrade)) + ") không thể làm tiên quyết cho " + tgt.Name + " (Lớp " + string(rune(48+tgtGrade)) + ")"
		}
	}

	return false, ""
}

// DetectIsolatedNodes returns true if any node (except the root node) has no prerequisites pointing to it.
func (gv *GraphValidator) DetectIsolatedNodes(nodes []model.Node, edges []model.Edge) (bool, string) {
	if len(nodes) <= 1 {
		return false, ""
	}

	hasInDegree := make(map[uuid.UUID]bool)
	for _, e := range edges {
		hasInDegree[e.TargetID] = true
	}

	for _, n := range nodes {
		if n.IsRoot {
			continue
		}
		if !hasInDegree[n.ID] {
			return true, "Chủ đề '" + n.Name + "' bị mồ côi (chưa có chủ đề tiên quyết dẫn tới nó)"
		}
	}

	return false, ""
}

// PerformTransitiveReduction removes transitive edges (e.g. if A->B, B->C, and A->C exist, remove A->C).
func (gv *GraphValidator) PerformTransitiveReduction(nodes []model.Node, edges []model.Edge) []model.Edge {
	adj := make(map[uuid.UUID][]uuid.UUID)
	for _, e := range edges {
		adj[e.SourceID] = append(adj[e.SourceID], e.TargetID)
	}

	// Helper function to check if there is a path from u to v of length >= 2
	hasPathLengthAtLeastTwo := func(u, v uuid.UUID) bool {
		visited := make(map[uuid.UUID]bool)
		queue := []uuid.UUID{}

		// Add immediate neighbors except the direct edge to v
		for _, neighbor := range adj[u] {
			if neighbor != v {
				queue = append(queue, neighbor)
				visited[neighbor] = true
			}
		}

		for len(queue) > 0 {
			curr := queue[0]
			queue = queue[1:]

			if curr == v {
				return true
			}

			for _, neighbor := range adj[curr] {
				if !visited[neighbor] {
					visited[neighbor] = true
					queue = append(queue, neighbor)
				}
			}
		}

		return false
	}

	reduced := []model.Edge{}
	for _, e := range edges {
		if hasPathLengthAtLeastTwo(e.SourceID, e.TargetID) {
			// Skip/Remove this redundant direct edge
			continue
		}
		reduced = append(reduced, e)
	}

	return reduced
}

func containsString(s, substr string) bool {
	// Simple helper matching strings
	for i := 0; i < len(s)-len(substr)+1; i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
