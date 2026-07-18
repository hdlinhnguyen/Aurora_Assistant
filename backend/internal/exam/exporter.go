package exam

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
	"golang.org/x/text/unicode/norm"
)

const (
	ExportStyleStandard = "standard"
	ExportStyleCompact  = "compact"
)

type ExportOptions struct {
	Style            string `json:"style"`
	IncludeAnswerKey bool   `json:"includeAnswerKey"`
	IncludeRubric    bool   `json:"includeRubric"`
}

type ExportDOCXInput struct {
	Style            string
	IncludeAnswerKey bool
	IncludeRubric    bool
	ExpectedVersion  int
}

type Exporter interface {
	Export(snapshot Detail, options ExportOptions, destination string) error
}

type DOCXExporter struct{}

func NewDOCXExporter() DOCXExporter {
	return DOCXExporter{}
}

func (DOCXExporter) Export(
	snapshot Detail,
	options ExportOptions,
	destination string,
) error {
	if options.Style != ExportStyleStandard && options.Style != ExportStyleCompact {
		return fmt.Errorf("unsupported DOCX style %q", options.Style)
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o700); err != nil {
		return err
	}
	file, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	writer := zip.NewWriter(file)
	writeErr := writeDOCXPackage(writer, snapshot, options)
	closeZipErr := writer.Close()
	closeFileErr := file.Close()
	if writeErr != nil {
		return writeErr
	}
	if closeZipErr != nil {
		return closeZipErr
	}
	return closeFileErr
}

func writeDOCXPackage(writer *zip.Writer, detail Detail, options ExportOptions) error {
	parts := map[string]string{
		"[Content_Types].xml":          contentTypesXML,
		"_rels/.rels":                  packageRelationshipsXML,
		"word/_rels/document.xml.rels": documentRelationshipsXML,
		"word/styles.xml":              stylesXML(options.Style),
		"word/document.xml":            documentXML(detail, options),
	}
	for _, name := range []string{
		"[Content_Types].xml",
		"_rels/.rels",
		"word/document.xml",
		"word/_rels/document.xml.rels",
		"word/styles.xml",
	} {
		entry, err := writer.Create(name)
		if err != nil {
			return err
		}
		if _, err := io.WriteString(entry, parts[name]); err != nil {
			return err
		}
	}
	return nil
}

func documentXML(detail Detail, options ExportOptions) string {
	var body strings.Builder
	writeParagraph(&body, detail.Title, true, true)
	writeParagraph(
		&body,
		fmt.Sprintf(
			"Subject: %s | Grade: %s | Duration: %d minutes | Total: %s points",
			detail.Subject, detail.GradeLevel, detail.DurationMinutes, detail.TotalPoints.String(),
		),
		false,
		true,
	)
	if strings.TrimSpace(detail.Instructions) != "" {
		writeParagraph(&body, detail.Instructions, false, false)
	}
	for index, question := range detail.Questions {
		writeParagraph(
			&body,
			fmt.Sprintf("Cau %d (%s points). %s", index+1, question.Points.String(), question.Content),
			true,
			false,
		)
		for choiceIndex, choice := range question.Choices {
			writeParagraph(
				&body,
				fmt.Sprintf("%c. %s", rune('A'+choiceIndex), choice.Content),
				false,
				false,
			)
		}
		if question.QuestionType == QuestionTypeEssay {
			lines := 5
			if options.Style == ExportStyleCompact {
				lines = 2
			}
			for range lines {
				writeParagraph(&body, "................................................................................", false, false)
			}
		}
	}
	if options.IncludeAnswerKey || options.IncludeRubric {
		body.WriteString(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`)
		writeParagraph(&body, "DAP AN VA BAREM", true, true)
		for index, question := range detail.Questions {
			if options.IncludeAnswerKey && question.CorrectChoiceID != nil {
				writeParagraph(
					&body,
					fmt.Sprintf("Cau %d: %s", index+1, *question.CorrectChoiceID),
					false,
					false,
				)
			}
			if options.IncludeRubric && question.QuestionType == QuestionTypeEssay {
				for _, rubric := range question.RubricItems {
					topicIDs := make([]string, 0, len(rubric.TopicNodeIDs))
					for _, topicID := range rubric.TopicNodeIDs {
						topicIDs = append(topicIDs, topicID.String())
					}
					writeParagraph(
						&body,
						fmt.Sprintf(
							"Cau %d - %s (%s points) [%s]",
							index+1, rubric.Description, rubric.Points.String(),
							strings.Join(topicIDs, ", "),
						),
						false,
						false,
					)
				}
			}
		}
	}

	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
		`<w:body>` + body.String() +
		`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
		`<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>` +
		`</w:body></w:document>`
}

func writeParagraph(builder *strings.Builder, text string, bold, centered bool) {
	builder.WriteString(`<w:p>`)
	if centered {
		builder.WriteString(`<w:pPr><w:jc w:val="center"/></w:pPr>`)
	}
	builder.WriteString(`<w:r>`)
	if bold {
		builder.WriteString(`<w:rPr><w:b/></w:rPr>`)
	}
	builder.WriteString(`<w:t xml:space="preserve">`)
	var escaped bytes.Buffer
	_ = xml.EscapeText(&escaped, []byte(text))
	builder.Write(escaped.Bytes())
	builder.WriteString(`</w:t></w:r></w:p>`)
}

var nonSlugCharacters = regexp.MustCompile(`[^a-z0-9]+`)

func SafeDOCXName(title string, version int) string {
	normalized := norm.NFKD.String(strings.ToLower(strings.TrimSpace(title)))
	var ascii strings.Builder
	for _, character := range normalized {
		if character <= 127 {
			ascii.WriteRune(character)
		}
	}
	slug := strings.Trim(nonSlugCharacters.ReplaceAllString(ascii.String(), "-"), "-")
	if slug == "" {
		slug = "exam"
	}
	if len(slug) > 80 {
		slug = strings.TrimRight(slug[:80], "-")
	}
	return fmt.Sprintf("%s-v%d.docx", slug, version)
}

func (s *Service) ExportDOCX(
	actor, examID uuid.UUID,
	input ExportDOCXInput,
) (*model.ExamExport, error) {
	if err := validateExpectedVersion(input.ExpectedVersion); err != nil {
		return nil, err
	}
	if input.Style != ExportStyleStandard && input.Style != ExportStyleCompact {
		return nil, invalidField("style", "Style must be standard or compact.")
	}
	if s.exporter == nil {
		return nil, fmt.Errorf("exam exporter is not configured")
	}

	exportID := uuid.New()
	var record *model.ExamExport
	var generatedPath string
	err := s.repository.Transaction(func(tx *Repository) error {
		current, err := tx.LockOwnedExam(examID, actor)
		if err != nil {
			return err
		}
		if current.Version != input.ExpectedVersion {
			return versionConflict(input.ExpectedVersion, current.Version)
		}
		detail, err := tx.ExamDetail(current.ID, actor)
		if err != nil {
			return err
		}
		topics, err := tx.topicLookup(detailTopicIDs(*detail))
		if err != nil {
			return err
		}
		validationErrors := ValidateDetail(*detail, topics)
		if len(validationErrors) != 0 {
			return &DomainError{
				Code: ErrorCodeExamInvalid, Message: "Cannot export an invalid exam.",
				Status: 422, Meta: map[string]any{"errors": validationErrors},
			}
		}
		snapshotJSON, err := canonicalJSON(detail)
		if err != nil {
			return err
		}
		fileName := SafeDOCXName(detail.Title, current.Version)
		generatedPath = filepath.Join(s.exportDir, exportID.String(), fileName)
		options := ExportOptions{
			Style: input.Style, IncludeAnswerKey: input.IncludeAnswerKey,
			IncludeRubric: input.IncludeRubric,
		}
		if err := s.exporter.Export(*detail, options, generatedPath); err != nil {
			return err
		}
		if err := tx.db.Create(&model.ExamSnapshot{
			ExamID: current.ID, ExamVersion: current.Version,
			Purpose: "export", SnapshotJSON: snapshotJSON,
		}).Error; err != nil {
			return err
		}
		export := &model.ExamExport{
			ID: exportID, ExamID: current.ID, ExamVersion: current.Version,
			Style: input.Style, FileName: fileName, FilePath: generatedPath,
			CreatedBy: actor, CreatedAt: time.Now().UTC(),
		}
		if err := tx.db.Create(export).Error; err != nil {
			return err
		}
		record = export
		return nil
	})
	if err != nil && generatedPath != "" {
		_ = os.Remove(generatedPath)
		_ = os.Remove(filepath.Dir(generatedPath))
	}
	return record, err
}

func (s *Service) ListExports(actor, examID uuid.UUID) ([]model.ExamExport, error) {
	if _, err := s.repository.OwnedExam(examID, actor); err != nil {
		return nil, err
	}
	records := make([]model.ExamExport, 0)
	err := s.repository.db.
		Where("exam_id = ? AND created_by = ?", examID, actor).
		Order("created_at DESC, id DESC").
		Find(&records).Error
	return records, err
}

func (s *Service) ExportFile(
	actor, examID, exportID uuid.UUID,
) (string, string, error) {
	if _, err := s.repository.OwnedExam(examID, actor); err != nil {
		return "", "", err
	}
	var record model.ExamExport
	err := s.repository.db.
		Where("id = ? AND exam_id = ? AND created_by = ?", exportID, examID, actor).
		Take(&record).Error
	if err != nil {
		return "", "", questionError(
			"export_not_found", "", "Export does not exist.", 404,
		)
	}
	return record.FilePath, record.FileName, nil
}

const contentTypesXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`

const packageRelationshipsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const documentRelationshipsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

func stylesXML(style string) string {
	size := "24"
	if style == ExportStyleCompact {
		size = "21"
	}
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
		`<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
		`<w:style w:type="paragraph" w:default="1" w:styleId="Normal">` +
		`<w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/>` +
		`<w:sz w:val="` + size + `"/><w:szCs w:val="` + size + `"/></w:rPr>` +
		`</w:style></w:styles>`
}
