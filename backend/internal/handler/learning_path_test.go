package handler

import "testing"

func TestValidateLearningPathStudentsRejectsOutsideClass(t *testing.T) {
	if err := validateLearningPathStudents([]string{"s1", "s9"}, []string{"s1", "s2"}); err == nil {
		t.Fatal("expected student outside classroom to be rejected")
	}
}

func TestValidateLearningPathStudentsAcceptsSelectedClassStudents(t *testing.T) {
	if err := validateLearningPathStudents([]string{"s2", "s1"}, []string{"s1", "s2"}); err != nil {
		t.Fatalf("expected classroom students to be accepted: %v", err)
	}
}
