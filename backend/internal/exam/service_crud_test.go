package exam_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"backend/internal/exam"
	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type crudFixture struct {
	db       *gorm.DB
	service  *exam.Service
	teacherA model.User
	teacherB model.User
}

func newCRUDFixture(t *testing.T) crudFixture {
	t.Helper()

	db := testutil.OpenPostgres(t).Session(&gorm.Session{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, db.AutoMigrate(
		&model.User{},
		&model.Exam{},
		&model.ExamQuestion{},
		&model.ExamRubricItem{},
		&model.ExamAuditLog{},
	))

	teacherA := model.User{
		ID:       uuid.New(),
		Email:    uuid.NewString() + "@example.test",
		Password: "test-only",
		Name:     "Teacher A",
		Role:     "teacher",
	}
	teacherB := model.User{
		ID:       uuid.New(),
		Email:    uuid.NewString() + "@example.test",
		Password: "test-only",
		Name:     "Teacher B",
		Role:     "teacher",
	}
	require.NoError(t, db.Create(&teacherA).Error)
	require.NoError(t, db.Create(&teacherB).Error)

	return crudFixture{
		db:       db,
		service:  exam.NewService(exam.NewRepository(db)),
		teacherA: teacherA,
		teacherB: teacherB,
	}
}

func validCreateInput(title string) exam.CreateInput {
	return exam.CreateInput{
		Title:           title,
		Subject:         "Toán đại số",
		GradeLevel:      "Lớp 5",
		DurationMinutes: 45,
		Instructions:    "Không sử dụng tài liệu.",
		TotalPoints:     model.MustScore("10.00"),
	}
}

func createExam(t *testing.T, fixture crudFixture, actor uuid.UUID, title string) *exam.Detail {
	t.Helper()
	created, err := fixture.service.Create(actor, validCreateInput(title))
	require.NoError(t, err)
	return created
}

func requireDomainCode(t *testing.T, err error, code string) *exam.DomainError {
	t.Helper()
	require.Error(t, err)
	var domainErr *exam.DomainError
	require.True(t, errors.As(err, &domainErr), "expected DomainError, got %T: %v", err, err)
	require.Equal(t, code, domainErr.Code)
	return domainErr
}

func ptr[T any](value T) *T {
	return &value
}

func TestExamCRUDAndOwnership(t *testing.T) {
	fixture := newCRUDFixture(t)

	created := createExam(t, fixture, fixture.teacherA.ID, "Kiểm tra phân số")
	require.Equal(t, 1, created.Version)
	require.Equal(t, model.ExamStatusDrafting, created.Status)
	require.Equal(t, "10.00", created.TotalPoints.String())

	loaded, err := fixture.service.Get(fixture.teacherA.ID, created.ID)
	require.NoError(t, err)
	require.Equal(t, created.ID, loaded.ID)

	_, err = fixture.service.Get(fixture.teacherB.ID, created.ID)
	requireDomainCode(t, err, exam.ErrorCodeExamNotFound)

	patched, err := fixture.service.Patch(fixture.teacherA.ID, created.ID, exam.PatchInput{
		Title:           ptr("Kiểm tra phân số nâng cao"),
		TotalPoints:     ptr(model.MustScore("12.50")),
		ExpectedVersion: 1,
	})
	require.NoError(t, err)
	require.Equal(t, 2, patched.Version)
	require.Equal(t, "Kiểm tra phân số nâng cao", patched.Title)
	require.Equal(t, "12.50", patched.TotalPoints.String())

	_, err = fixture.service.Patch(fixture.teacherB.ID, created.ID, exam.PatchInput{
		Title:           ptr("Không được phép"),
		ExpectedVersion: 2,
	})
	requireDomainCode(t, err, exam.ErrorCodeExamNotFound)
}

func TestExamVersionConflict(t *testing.T) {
	fixture := newCRUDFixture(t)
	created := createExam(t, fixture, fixture.teacherA.ID, "Kiểm tra phiên bản")

	_, err := fixture.service.Patch(fixture.teacherA.ID, created.ID, exam.PatchInput{
		Title:           ptr("Phiên bản mới"),
		ExpectedVersion: 1,
	})
	require.NoError(t, err)

	_, err = fixture.service.Patch(fixture.teacherA.ID, created.ID, exam.PatchInput{
		Title:           ptr("Ghi đè cũ"),
		ExpectedVersion: 1,
	})
	domainErr := requireDomainCode(t, err, exam.ErrorCodeVersionConflict)
	require.Equal(t, 1, domainErr.Meta["expectedVersion"])
	require.Equal(t, 2, domainErr.Meta["currentVersion"])
}

func TestExamPatchMutationState(t *testing.T) {
	fixture := newCRUDFixture(t)

	t.Run("allows unlocked preparing exam", func(t *testing.T) {
		created := createExam(t, fixture, fixture.teacherA.ID, "Đề đang chuẩn bị")
		require.NoError(t, fixture.db.Model(&model.Exam{}).
			Where("id = ?", created.ID).
			Update("status", exam.ExamStatusPreparing).Error)

		patched, err := fixture.service.Patch(fixture.teacherA.ID, created.ID, exam.PatchInput{
			Title:           ptr("Đề đang chuẩn bị đã sửa"),
			ExpectedVersion: 1,
		})
		require.NoError(t, err)
		require.Equal(t, 2, patched.Version)
	})

	t.Run("rejects exam with a first submission", func(t *testing.T) {
		created := createExam(t, fixture, fixture.teacherA.ID, "Đề đã nhận bài")
		receivedAt := time.Now().UTC()
		require.NoError(t, fixture.db.Model(&model.Exam{}).
			Where("id = ?", created.ID).
			Update("first_submission_received_at", receivedAt).Error)

		_, err := fixture.service.Patch(fixture.teacherA.ID, created.ID, exam.PatchInput{
			Title:           ptr("Không được sửa"),
			ExpectedVersion: 1,
		})
		requireDomainCode(t, err, exam.ErrorCodeExamLocked)
	})

	t.Run("rejects done exam", func(t *testing.T) {
		created := createExam(t, fixture, fixture.teacherA.ID, "Đề đã hoàn tất")
		require.NoError(t, fixture.db.Model(&model.Exam{}).
			Where("id = ?", created.ID).
			Update("status", exam.ExamStatusDone).Error)

		_, err := fixture.service.Patch(fixture.teacherA.ID, created.ID, exam.PatchInput{
			Title:           ptr("Không được sửa"),
			ExpectedVersion: 1,
		})
		requireDomainCode(t, err, exam.ErrorCodeExamLocked)
	})
}

func TestExamListOwnershipStatusAndSearch(t *testing.T) {
	fixture := newCRUDFixture(t)
	algebra := createExam(t, fixture, fixture.teacherA.ID, "Phân số nâng cao")
	geometry := createExam(t, fixture, fixture.teacherA.ID, "Hình học cơ bản")
	_ = createExam(t, fixture, fixture.teacherB.ID, "Phân số của giáo viên khác")

	require.NoError(t, fixture.db.Model(&model.Exam{}).
		Where("id = ?", algebra.ID).
		Update("status", exam.ExamStatusPreparing).Error)
	require.NoError(t, fixture.db.Model(&model.Exam{}).
		Where("id = ?", geometry.ID).
		Update("subject", "Hình học").Error)

	list, err := fixture.service.List(fixture.teacherA.ID, exam.ListFilter{
		Subject: "  Toán đại số  ",
		Status:  exam.ExamStatusPreparing,
		Search:  "  PHÂN SỐ ",
	})
	require.NoError(t, err)
	require.Len(t, list, 1)
	require.Equal(t, algebra.ID, list[0].ID)

	algebraOnly, err := fixture.service.List(fixture.teacherA.ID, exam.ListFilter{
		Subject: "Toán đại số",
	})
	require.NoError(t, err)
	require.Len(t, algebraOnly, 1)
	require.Equal(t, algebra.ID, algebraOnly[0].ID)

	allOwned, err := fixture.service.List(fixture.teacherA.ID, exam.ListFilter{})
	require.NoError(t, err)
	require.Len(t, allOwned, 2)
}

func TestExamDeleteRequiresDraftUnlockedAndExpectedVersion(t *testing.T) {
	fixture := newCRUDFixture(t)

	t.Run("deletes owned unlocked draft", func(t *testing.T) {
		created := createExam(t, fixture, fixture.teacherA.ID, "Bản nháp để xóa")
		require.NoError(t, fixture.service.Delete(fixture.teacherA.ID, created.ID, 1))

		_, err := fixture.service.Get(fixture.teacherA.ID, created.ID)
		requireDomainCode(t, err, exam.ErrorCodeExamNotFound)
	})

	t.Run("rejects stale version", func(t *testing.T) {
		created := createExam(t, fixture, fixture.teacherA.ID, "Bản nháp phiên bản cũ")
		err := fixture.service.Delete(fixture.teacherA.ID, created.ID, 2)
		requireDomainCode(t, err, exam.ErrorCodeVersionConflict)
	})

	t.Run("hides ownership", func(t *testing.T) {
		created := createExam(t, fixture, fixture.teacherA.ID, "Bản nháp riêng")
		err := fixture.service.Delete(fixture.teacherB.ID, created.ID, 1)
		requireDomainCode(t, err, exam.ErrorCodeExamNotFound)
	})

	t.Run("rejects non-draft", func(t *testing.T) {
		created := createExam(t, fixture, fixture.teacherA.ID, "Đề đang chuẩn bị")
		require.NoError(t, fixture.db.Model(&model.Exam{}).
			Where("id = ?", created.ID).
			Update("status", exam.ExamStatusPreparing).Error)
		err := fixture.service.Delete(fixture.teacherA.ID, created.ID, 1)
		requireDomainCode(t, err, exam.ErrorCodeInvalidTransition)
	})

	t.Run("rejects locked draft", func(t *testing.T) {
		created := createExam(t, fixture, fixture.teacherA.ID, "Đề đã khóa")
		receivedAt := time.Now().UTC()
		require.NoError(t, fixture.db.Model(&model.Exam{}).
			Where("id = ?", created.ID).
			Update("first_submission_received_at", receivedAt).Error)
		err := fixture.service.Delete(fixture.teacherA.ID, created.ID, 1)
		requireDomainCode(t, err, exam.ErrorCodeExamLocked)
	})
}

func TestExamAuditRecordsCreatePatchAndDelete(t *testing.T) {
	fixture := newCRUDFixture(t)
	created := createExam(t, fixture, fixture.teacherA.ID, "Đề có nhật ký")

	_, err := fixture.service.Patch(fixture.teacherA.ID, created.ID, exam.PatchInput{
		Instructions:    ptr("Hướng dẫn mới"),
		ExpectedVersion: 1,
	})
	require.NoError(t, err)
	require.NoError(t, fixture.service.Delete(fixture.teacherA.ID, created.ID, 2))

	var deleted model.Exam
	require.NoError(t, fixture.db.Unscoped().First(&deleted, "id = ?", created.ID).Error)
	require.Equal(t, 3, deleted.Version, "delete must increment version exactly once")

	entries, err := fixture.service.Audit(fixture.teacherA.ID, created.ID)
	require.NoError(t, err)
	require.Len(t, entries, 3)
	require.Equal(t, []string{
		exam.AuditActionCreated,
		exam.AuditActionUpdated,
		exam.AuditActionDeleted,
	}, []string{entries[0].Action, entries[1].Action, entries[2].Action})
	for _, entry := range entries {
		require.Equal(t, fixture.teacherA.ID, entry.ActorID)
		require.NotEmpty(t, entry.NewValueJSON)
	}

	_, err = fixture.service.Audit(fixture.teacherB.ID, created.ID)
	requireDomainCode(t, err, exam.ErrorCodeExamNotFound)
}

func TestExamCRUDValidation(t *testing.T) {
	fixture := newCRUDFixture(t)

	createCases := []struct {
		name  string
		input exam.CreateInput
		field string
	}{
		{"empty title", func() exam.CreateInput {
			input := validCreateInput(" \t ")
			return input
		}(), "title"},
		{"long title", func() exam.CreateInput {
			input := validCreateInput(strings.Repeat("a", 301))
			return input
		}(), "title"},
		{"empty subject", func() exam.CreateInput {
			input := validCreateInput("Đề")
			input.Subject = " "
			return input
		}(), "subject"},
		{"long grade", func() exam.CreateInput {
			input := validCreateInput("Đề")
			input.GradeLevel = strings.Repeat("ă", 51)
			return input
		}(), "gradeLevel"},
		{"zero duration", func() exam.CreateInput {
			input := validCreateInput("Đề")
			input.DurationMinutes = 0
			return input
		}(), "durationMinutes"},
		{"excess duration", func() exam.CreateInput {
			input := validCreateInput("Đề")
			input.DurationMinutes = 601
			return input
		}(), "durationMinutes"},
		{"long instructions", func() exam.CreateInput {
			input := validCreateInput("Đề")
			input.Instructions = strings.Repeat("ữ", 10001)
			return input
		}(), "instructions"},
		{"non-positive points", func() exam.CreateInput {
			input := validCreateInput("Đề")
			input.TotalPoints = model.MustScore("0.00")
			return input
		}(), "totalPoints"},
		{"invalid point precision", func() exam.CreateInput {
			input := validCreateInput("Đề")
			input.TotalPoints = model.Score{Decimal: decimal.RequireFromString("1.239")}
			return input
		}(), "totalPoints"},
	}

	for _, testCase := range createCases {
		t.Run("create "+testCase.name, func(t *testing.T) {
			_, err := fixture.service.Create(fixture.teacherA.ID, testCase.input)
			domainErr := requireDomainCode(t, err, exam.ErrorCodeInvalidRequest)
			require.Equal(t, testCase.field, domainErr.Field)
		})
	}

	created := createExam(t, fixture, fixture.teacherA.ID, "Đề hợp lệ")
	patchCases := []struct {
		name  string
		input exam.PatchInput
		field string
	}{
		{"blank title", exam.PatchInput{
			Title: ptr(" "), ExpectedVersion: 1,
		}, "title"},
		{"duration too large", exam.PatchInput{
			DurationMinutes: ptr(601), ExpectedVersion: 1,
		}, "durationMinutes"},
		{"negative points", exam.PatchInput{
			TotalPoints: ptr(model.MustScore("-1.00")), ExpectedVersion: 1,
		}, "totalPoints"},
		{"missing expected version", exam.PatchInput{
			Title: ptr("Tên mới"),
		}, "expectedVersion"},
	}
	for _, testCase := range patchCases {
		t.Run("patch "+testCase.name, func(t *testing.T) {
			_, err := fixture.service.Patch(fixture.teacherA.ID, created.ID, testCase.input)
			domainErr := requireDomainCode(t, err, exam.ErrorCodeInvalidRequest)
			require.Equal(t, testCase.field, domainErr.Field)
		})
	}
}
