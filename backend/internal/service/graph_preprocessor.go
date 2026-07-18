package service

import (
	"encoding/json"
	"errors"
	"strings"
)

type PDFRecord struct {
	StableKey   string   `json:"stableKey"`
	Grade       int      `json:"grade"`
	Branch      string   `json:"branch"` // e.g. "Số và Đại số"
	RawContent  string   `json:"rawContent"`
	PageNumber  int      `json:"pageNumber"`
	IsSupplementary bool `json:"isSupplementary"`
}

type PDFPreprocessor struct {
	AllowedBranches []string
	SupplementaryKeywords []string
}

func NewPDFPreprocessor() *PDFPreprocessor {
	return &PDFPreprocessor{
		AllowedBranches: []string{"Số và Đại số", "Số", "Đại số"},
		SupplementaryKeywords: []string{"biểu đồ", "tỉ lệ phần trăm", "thống kê"},
	}
}

// PreprocessPDFText parses raw PDF text and filters records.
// In a real system, PDF text is pre-chunked by layout boundaries (anchors) or page structures.
func (pp *PDFPreprocessor) PreprocessPDFText(rawText string) ([]PDFRecord, error) {
	if len(rawText) == 0 {
		return nil, errors.New("văn bản PDF trống")
	}

	var rawRecords []struct {
		Text       string `json:"text"`
		Page       int    `json:"page"`
		Grade      int    `json:"grade"`
		Branch     string `json:"branch"`
	}

	// Try reading structured json mock if input starts with JSON, otherwise split by pages/anchors
	if strings.HasPrefix(strings.TrimSpace(rawText), "[") {
		if err := json.Unmarshal([]byte(rawText), &rawRecords); err != nil {
			return nil, err
		}
	} else {
		// Fallback simple line parser for raw OCR text
		lines := strings.Split(rawText, "\n")
		currentPage := 1
		currentGrade := 5
		currentBranch := "Số và Đại số"

		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}

			// Simple anchor detection
			if strings.Contains(line, "LỚP 4") || strings.Contains(line, "Lớp 4") {
				currentGrade = 4
				continue
			}
			if strings.Contains(line, "LỚP 5") || strings.Contains(line, "Lớp 5") {
				currentGrade = 5
				continue
			}
			if strings.Contains(line, "LỚP 6") || strings.Contains(line, "Lớp 6") {
				currentGrade = 6
				continue
			}
			if strings.Contains(line, "LỚP 7") || strings.Contains(line, "Lớp 7") {
				currentGrade = 7
				continue
			}
			if strings.Contains(line, "LỚP 8") || strings.Contains(line, "Lớp 8") {
				currentGrade = 8
				continue
			}

			// Branch selector
			if strings.Contains(line, "Hình học") || strings.Contains(line, "Đo lường") {
				currentBranch = "Hình học và Đo lường"
				continue
			}
			if strings.Contains(line, "Số và Đại số") || strings.Contains(line, "Đại số") {
				currentBranch = "Số và Đại số"
				continue
			}
			if strings.Contains(line, "Thống kê") || strings.Contains(line, "Xác suất") {
				currentBranch = "Thống kê và Xác suất"
				continue
			}

			// Accumulate records if starting with list-item bullet
			if strings.HasPrefix(line, "-") || strings.HasPrefix(line, "*") {
				rawRecords = append(rawRecords, struct {
					Text   string `json:"text"`
					Page   int    `json:"page"`
					Grade  int    `json:"grade"`
					Branch string `json:"branch"`
				}{
					Text:   strings.TrimSpace(line[1:]),
					Page:   currentPage,
					Grade:  currentGrade,
					Branch: currentBranch,
				})
			}
		}
	}

	processed := []PDFRecord{}
	for _, r := range rawRecords {
		rawContent := strings.TrimSpace(r.Text)
		if rawContent == "" {
			continue
		}

		// Filter branches
		isAllowed := false
		for _, b := range pp.AllowedBranches {
			if strings.Contains(r.Branch, b) {
				isAllowed = true
				break
			}
		}

		isSupplementary := false
		if !isAllowed {
			// Check supplementary keywords
			for _, kw := range pp.SupplementaryKeywords {
				if strings.Contains(strings.ToLower(rawContent), kw) {
					isSupplementary = true
					break
				}
			}
		}

		if !isAllowed && !isSupplementary {
			// Exclude non-algebra/non-supplementary topics
			continue
		}

		// Generate stable key: e.g. "l5-algebra-hash"
		stableKey := pp.GenerateStableKey(r.Grade, r.Branch, rawContent)

		processed = append(processed, PDFRecord{
			StableKey:       stableKey,
			Grade:           r.Grade,
			Branch:          r.Branch,
			RawContent:      rawContent,
			PageNumber:      r.Page,
			IsSupplementary: isSupplementary,
		})
	}

	return processed, nil
}

// GenerateStableKey makes a stable unique key based on normalized name/grade
func (pp *PDFPreprocessor) GenerateStableKey(grade int, branch, rawContent string) string {
	// Normalize content by taking first 15 alphanumeric characters
	normalized := ""
	for _, char := range strings.ToLower(rawContent) {
		if (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') {
			normalized += string(char)
		}
		if len(normalized) >= 20 {
			break
		}
	}
	
	// E.g., l5-sovadai-congphanso
	branchCode := "num"
	if strings.Contains(branch, "Đại số") || strings.Contains(branch, "dai-so") {
		branchCode = "alg"
	}
	return "l" + string(rune(48+grade)) + "-" + branchCode + "-" + normalized
}
