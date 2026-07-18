package exam_test

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"backend/internal/exam"
	"backend/internal/model"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestExportDOCXStoresVersionedRecordAndProtectsOwnership(t *testing.T) {
	fixture, prepared := preparedExamFixture(t)
	require.NoError(t, fixture.db.AutoMigrate(
		&model.ExamExport{},
	))
	exportDir := t.TempDir()
	service := exam.NewServiceWithExporter(
		exam.NewRepository(fixture.db), exam.NewDOCXExporter(), exportDir,
	)

	record, err := service.ExportDOCX(
		fixture.teacher.ID, prepared.ID,
		exam.ExportDOCXInput{
			Style: exam.ExportStyleStandard, IncludeAnswerKey: true,
			IncludeRubric: true, ExpectedVersion: prepared.Version,
		},
	)
	require.NoError(t, err)
	require.Equal(t, prepared.Version, record.ExamVersion)
	require.Equal(t, ".docx", filepath.Ext(record.FileName))
	require.FileExists(t, record.FilePath)

	encoded, err := json.Marshal(record)
	require.NoError(t, err)
	require.NotContains(t, string(encoded), "filePath")
	require.NotContains(t, string(encoded), exportDir)

	records, err := service.ListExports(fixture.teacher.ID, prepared.ID)
	require.NoError(t, err)
	require.Len(t, records, 1)

	path, name, err := service.ExportFile(fixture.teacher.ID, prepared.ID, record.ID)
	require.NoError(t, err)
	require.Equal(t, record.FilePath, path)
	require.Equal(t, record.FileName, name)

	other := fixture.teacher
	other.ID = uuid.New()
	_, err = service.ListExports(other.ID, prepared.ID)
	questionDomainCode(t, err, exam.ErrorCodeExamNotFound)
}

func TestExportRejectsInvalidExamAndStaleVersion(t *testing.T) {
	fixture := newQuestionFixture(t)
	require.NoError(t, fixture.db.AutoMigrate(
		&model.ExamSnapshot{}, &model.ExamExport{},
	))
	service := exam.NewServiceWithExporter(
		exam.NewRepository(fixture.db), exam.NewDOCXExporter(), t.TempDir(),
	)

	_, err := service.ExportDOCX(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ExportDOCXInput{Style: exam.ExportStyleStandard, ExpectedVersion: 1},
	)
	questionDomainCode(t, err, exam.ErrorCodeExamInvalid)

	_, err = service.ExportDOCX(
		fixture.teacher.ID, fixture.exam.ID,
		exam.ExportDOCXInput{Style: exam.ExportStyleStandard, ExpectedVersion: 2},
	)
	questionDomainCode(t, err, exam.ErrorCodeVersionConflict)
}
