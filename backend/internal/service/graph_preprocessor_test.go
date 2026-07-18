package service

import (
	"testing"
)

func TestPDFPreprocessor_PreprocessPDFText(t *testing.T) {
	pp := NewPDFPreprocessor()

	// 1. Text containing math curriculum items
	rawText := `
LỚP 5
Số và Đại số
- Thực hiện phép nhân số thập phân tr. 12
- Tính tỉ số phần trăm học sinh tr. 14
Hình học
- Tính diện tích hình tròn tr. 15
`

	records, err := pp.PreprocessPDFText(rawText)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	// Should contain:
	// - "Thực hiện phép nhân số thập phân tr. 12" (Branch: Số và Đại số - allowed)
	// - "Tính tỉ số phần trăm học sinh tr. 14" (Branch: Số và Đại số - allowed)
	// Should NOT contain:
	// - "Tính diện tích hình tròn tr. 15" (Branch: Hình học - not allowed and not supplementary)

	var hasMultiplication, hasPercentage, hasCircle bool
	for _, r := range records {
		if containsString(r.RawContent, "nhân số thập phân") {
			hasMultiplication = true
		}
		if containsString(r.RawContent, "tỉ số phần trăm") {
			hasPercentage = true
		}
		if containsString(r.RawContent, "hình tròn") {
			hasCircle = true
		}
	}

	if !hasMultiplication {
		t.Error("Expected to find decimal multiplication record, but it was missing")
	}
	if !hasPercentage {
		t.Error("Expected to find percentage record, but it was missing")
	}
	if hasCircle {
		t.Error("Expected geometry circle area record to be filtered out, but it was present")
	}
}

func TestPDFPreprocessor_SupplementaryTagging(t *testing.T) {
	pp := NewPDFPreprocessor()

	// Text containing statistical items that contain supplementary keywords e.g. "biểu đồ"
	rawText := `
LỚP 6
Thống kê và Xác suất
- Vẽ biểu đồ phân số biểu diễn số liệu tr. 25
- Chọn ngẫu nhiên quả bóng tr. 27
`

	records, err := pp.PreprocessPDFText(rawText)
	if err != nil {
		t.Fatalf("Expected no error, got %v", err)
	}

	// "Vẽ biểu đồ phân số..." has "biểu đồ" (supplementary) -> should be included
	// "Chọn ngẫu nhiên..." does not match allowed branch or keywords -> should be skipped

	var hasChart, hasBall bool
	for _, r := range records {
		if containsString(r.RawContent, "biểu đồ") {
			hasChart = true
			if !r.IsSupplementary {
				t.Error("Expected chart record to be tagged as supplementary")
			}
		}
		if containsString(r.RawContent, "quả bóng") {
			hasBall = true
		}
	}

	if !hasChart {
		t.Error("Expected chart record to be included as supplementary")
	}
	if hasBall {
		t.Error("Expected random ball selection to be excluded")
	}
}
