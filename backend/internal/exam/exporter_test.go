package exam_test

import (
	"archive/zip"
	"io"
	"path/filepath"
	"testing"

	"backend/internal/exam"
	"backend/internal/model"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDOCXExporterWritesValidOpenXMLPackage(t *testing.T) {
	topicID := uuid.New()
	correct := "choice-0"
	detail := exam.Detail{
		Exam: model.Exam{
			Title: "Fractions & <Algebra>", Subject: "Algebra", GradeLevel: "5",
			DurationMinutes: 45, TotalPoints: model.MustScore("10.00"),
		},
		Questions: []exam.QuestionDetail{
			{
				ExamQuestion: model.ExamQuestion{
					QuestionType: exam.QuestionTypeSingleChoice,
					Content:      "Choose one.", Points: model.MustScore("4.00"), Position: 0,
					CorrectChoiceID: &correct,
				},
				Choices: []exam.Choice{
					{ID: "choice-0", Content: "One half"},
					{ID: "choice-1", Content: "Two thirds"},
				},
				TopicNodeIDs: []uuid.UUID{topicID},
			},
			{
				ExamQuestion: model.ExamQuestion{
					QuestionType: exam.QuestionTypeEssay,
					Content:      "Explain the method.", Points: model.MustScore("6.00"), Position: 1,
				},
				TopicNodeIDs: []uuid.UUID{topicID},
				RubricItems: []exam.RubricItemDetail{{
					ExamRubricItem: model.ExamRubricItem{
						Description: "Complete reasoning", Points: model.MustScore("6.00"),
					},
					TopicNodeIDs: []uuid.UUID{topicID},
				}},
			},
		},
	}
	destination := filepath.Join(t.TempDir(), "exam.docx")
	err := exam.NewDOCXExporter().Export(
		detail,
		exam.ExportOptions{Style: exam.ExportStyleStandard, IncludeAnswerKey: true, IncludeRubric: true},
		destination,
	)
	require.NoError(t, err)

	reader, err := zip.OpenReader(destination)
	require.NoError(t, err)
	defer reader.Close()

	required := map[string]bool{
		"[Content_Types].xml":          false,
		"_rels/.rels":                  false,
		"word/document.xml":            false,
		"word/_rels/document.xml.rels": false,
		"word/styles.xml":              false,
	}
	var document string
	for _, file := range reader.File {
		if _, exists := required[file.Name]; exists {
			required[file.Name] = true
		}
		if file.Name == "word/document.xml" {
			stream, openErr := file.Open()
			require.NoError(t, openErr)
			content, readErr := io.ReadAll(stream)
			require.NoError(t, readErr)
			require.NoError(t, stream.Close())
			document = string(content)
		}
	}
	for name, found := range required {
		require.True(t, found, "missing %s", name)
	}
	require.Contains(t, document, "Fractions &amp; &lt;Algebra&gt;")
	require.Contains(t, document, "Choose one.")
	require.Contains(t, document, "DAP AN VA BAREM")
	require.Contains(t, document, "Complete reasoning")
	require.Contains(t, document, topicID.String())
}

func TestDOCXCompactCanOmitAnswerAndRubricSection(t *testing.T) {
	destination := filepath.Join(t.TempDir(), "compact.docx")
	err := exam.NewDOCXExporter().Export(
		exam.Detail{
			Exam: model.Exam{
				Title: "Compact", Subject: "Math", GradeLevel: "5",
				DurationMinutes: 30, TotalPoints: model.MustScore("1.00"),
			},
			Questions: []exam.QuestionDetail{{
				ExamQuestion: model.ExamQuestion{
					QuestionType: exam.QuestionTypeEssay,
					Content:      "Answer.", Points: model.MustScore("1.00"),
				},
			}},
		},
		exam.ExportOptions{Style: exam.ExportStyleCompact},
		destination,
	)
	require.NoError(t, err)

	reader, err := zip.OpenReader(destination)
	require.NoError(t, err)
	defer reader.Close()
	for _, file := range reader.File {
		if file.Name != "word/document.xml" {
			continue
		}
		stream, openErr := file.Open()
		require.NoError(t, openErr)
		content, readErr := io.ReadAll(stream)
		require.NoError(t, readErr)
		require.NoError(t, stream.Close())
		require.NotContains(t, string(content), "DAP AN VA BAREM")
	}
}
