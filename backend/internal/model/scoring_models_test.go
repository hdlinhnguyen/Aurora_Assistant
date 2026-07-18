package model_test

import (
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/stretchr/testify/require"
)

func TestScoringModelsMigrateWithExpectedConstraints(t *testing.T) {
	db := testutil.OpenPostgres(t)
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.Exam{},
		&model.ExamQuestion{},
		&model.ExamRubricItem{},
		&model.ExamSnapshot{},
		&model.GradingBatch{},
		&model.ScoringSubmission{},
		&model.ScoringQuestionResult{},
		&model.ScoringRubricResult{},
		&model.ScoringApprovalSnapshot{},
		&model.ScoringAuditLog{},
		&model.ScoringInternalEvent{},
	))

	for _, table := range []string{
		"grading_batches",
		"scoring_submissions",
		"scoring_question_results",
		"scoring_rubric_results",
		"scoring_approval_snapshots",
		"scoring_audit_logs",
		"scoring_internal_events",
	} {
		require.Truef(t, db.Migrator().HasTable(table), "missing table %s", table)
	}

	require.True(t, db.Migrator().HasConstraint(&model.GradingBatch{}, "chk_batch_total"))
	require.True(t, db.Migrator().HasConstraint(&model.GradingBatch{}, "chk_batch_approved"))
	require.True(t, db.Migrator().HasIndex(&model.GradingBatch{}, "idx_grading_batch_owner_status"))
	require.True(t, db.Migrator().HasIndex(&model.ScoringSubmission{}, "idx_batch_student"))
	require.True(t, db.Migrator().HasIndex(&model.ScoringApprovalSnapshot{}, "idx_submission_approval_version"))
	require.True(t, db.Migrator().HasIndex(&model.ScoringInternalEvent{}, "idx_scoring_event_key"))
}
