package service

import (
	_ "embed"
	"encoding/json"
	"regexp"
	"strings"
	"unicode"
)

// ─── Guardrail Layer ─────────────────────────────────────────────────────────
// Lớp kiểm duyệt kép cho chat học sinh tiểu học:
//   1. CheckStudentInput: regex/blocklist tiếng Việt (có dấu + không dấu) chạy
//      TRƯỚC khi gọi LLM — chặn nội dung không phù hợp, phát hiện tín hiệu
//      nguy hiểm (tự hại, bạo hành) và nỗ lực prompt-injection.
//   2. safety_flag: LLM tự gắn cờ trong JSON response (xem ai_service.go) —
//      bắt các trường hợp lách luật mà regex bỏ sót.
// Sự kiện bị gắn cờ được lưu vào bảng guardrail_events (xem tutor_service.go).
//
// Danh sách rule nằm ở guardrail_rules.json (không phải Go source) để có thể
// bổ sung từ/biến thể mới (teencode, viết tắt) mà không phải sửa logic Go —
// chỉ cần sửa JSON rồi rebuild.

type GuardrailVerdict struct {
	Category string // "self_harm" | "abuse" | "sexual" | "violence" | "profanity" | "jailbreak" | "personal_info"
	Severity string // "high" | "medium" | "low"
	Matched  string // pattern khớp — phục vụ debug/tinh chỉnh, không hiển thị cho học sinh
}

type guardrailRule struct {
	category string
	severity string
	// pattern chạy trên văn bản đã chuẩn hóa (lowercase). folded=true nghĩa là
	// chạy trên bản đã bỏ dấu tiếng Việt (bắt cả trường hợp gõ không dấu);
	// folded=false chạy trên bản còn nguyên dấu — dùng cho từ khóa mà bản bỏ
	// dấu trùng với từ vô hại (vd "tự tử" vs "từ từ").
	re     *regexp.Regexp
	folded bool
}

var diacriticFolder = strings.NewReplacer(
	"à", "a", "á", "a", "ạ", "a", "ả", "a", "ã", "a",
	"â", "a", "ầ", "a", "ấ", "a", "ậ", "a", "ẩ", "a", "ẫ", "a",
	"ă", "a", "ằ", "a", "ắ", "a", "ặ", "a", "ẳ", "a", "ẵ", "a",
	"è", "e", "é", "e", "ẹ", "e", "ẻ", "e", "ẽ", "e",
	"ê", "e", "ề", "e", "ế", "e", "ệ", "e", "ể", "e", "ễ", "e",
	"ì", "i", "í", "i", "ị", "i", "ỉ", "i", "ĩ", "i",
	"ò", "o", "ó", "o", "ọ", "o", "ỏ", "o", "õ", "o",
	"ô", "o", "ồ", "o", "ố", "o", "ộ", "o", "ổ", "o", "ỗ", "o",
	"ơ", "o", "ờ", "o", "ớ", "o", "ợ", "o", "ở", "o", "ỡ", "o",
	"ù", "u", "ú", "u", "ụ", "u", "ủ", "u", "ũ", "u",
	"ư", "u", "ừ", "u", "ứ", "u", "ự", "u", "ử", "u", "ữ", "u",
	"ỳ", "y", "ý", "y", "ỵ", "y", "ỷ", "y", "ỹ", "y",
	"đ", "d",
)

func foldVietnamese(s string) string {
	return diacriticFolder.Replace(s)
}

// mustRule biên dịch pattern với ranh giới từ mềm (không dùng \b vì tiếng Việt
// có dấu nằm ngoài lớp \w của regexp Go trên bản folded thì \b hoạt động đúng).
func mustRule(category, severity, pattern string, folded bool) guardrailRule {
	return guardrailRule{
		category: category,
		severity: severity,
		re:       regexp.MustCompile(pattern),
		folded:   folded,
	}
}

//go:embed guardrail_rules.json
var guardrailRulesJSON []byte

type guardrailRuleDef struct {
	Category string `json:"category"`
	Severity string `json:"severity"`
	Folded   bool   `json:"folded"`
	Pattern  string `json:"pattern"`
}

// guardrailRules nạp từ guardrail_rules.json lúc khởi động (nhúng vào binary
// qua go:embed). Thêm/sửa từ khoá, biến thể teencode chỉ cần sửa file JSON đó
// rồi build lại — không phải đụng vào logic Go.
var guardrailRules = loadGuardrailRules()

func loadGuardrailRules() []guardrailRule {
	var defs []guardrailRuleDef
	if err := json.Unmarshal(guardrailRulesJSON, &defs); err != nil {
		panic("guardrail_rules.json không hợp lệ: " + err.Error())
	}
	rules := make([]guardrailRule, 0, len(defs))
	for _, d := range defs {
		rules = append(rules, mustRule(d.Category, d.Severity, d.Pattern, d.Folded))
	}
	return rules
}

// noiseChars là ký tự đệm học sinh hay chèn giữa các chữ để né blocklist,
// vd "d.m", "d-m", "d_m". Xoá hẳn (không thay bằng khoảng trắng) để "d.m"
// gộp lại thành "dm" — khoảng trắng thật giữa 2 từ không đổi.
var noiseChars = regexp.MustCompile(`[.\-_*~']+`)

// collapseRepeatLetters gộp ký tự chữ cái (mọi ngôn ngữ) lặp liên tiếp từ 3
// lần trở lên xuống còn ĐÚNG 1 lần, vd "ngungungu"... "nguuu" -> "ngu",
// "ngốccc" -> "ngốc". Giữ nguyên cặp đôi hợp lệ trong tiếng Việt (vd "xoong",
// "soóc") vì tiếng Việt không có từ nào lặp 3 ký tự identical liên tiếp một
// cách tự nhiên — chỉ chuỗi lặp từ 3 trở lên mới coi là học sinh cố tình kéo
// dài để né blocklist. RE2 không hỗ trợ backreference nên phải viết tay bằng
// duyệt rune thay vì regex. Chỉ áp dụng cho unicode.IsLetter — KHÔNG áp dụng
// cho chữ số để không phá vỡ rule số điện thoại lặp số (vd 0888888888).
func collapseRepeatLetters(s string) string {
	runes := []rune(s)
	out := make([]rune, 0, len(runes))
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		if unicode.IsLetter(r) {
			j := i
			for j < len(runes) && runes[j] == r {
				j++
			}
			if run := j - i; run >= 3 {
				out = append(out, r)
				i = j - 1
				continue
			}
		}
		out = append(out, r)
	}
	return string(out)
}

// normalizeForGuardrail chuẩn hoá noise-char và ký tự lặp trước khi match,
// nhằm bắt các biến thể chính tả né kiểm duyệt (xem guardrail_rules.json).
func normalizeForGuardrail(s string) string {
	s = noiseChars.ReplaceAllString(s, "")
	s = collapseRepeatLetters(s)
	return s
}

// CheckStudentInput trả về verdict đầu tiên khớp, hoặc nil nếu nội dung sạch.
// Stateless — an toàn khi gọi đồng thời.
func CheckStudentInput(text string) *GuardrailVerdict {
	lower := strings.ToLower(strings.TrimSpace(text))
	if lower == "" {
		return nil
	}
	// clean loại noise-char + gộp ký tự lặp, vẫn giữ dấu tiếng Việt — dùng cho
	// rule folded=false (nơi dấu quyết định nghĩa, vd "tự tử" khác "từ từ").
	clean := normalizeForGuardrail(lower)
	// foldedClean chuẩn hoá thêm bước bỏ dấu — dùng cho rule folded=true, bắt
	// cả biến thể gõ không dấu lẫn biến thể chèn ký tự/lặp ký tự.
	foldedClean := foldVietnamese(clean)

	for _, r := range guardrailRules {
		target := clean
		if r.folded {
			target = foldedClean
		}
		if m := r.re.FindString(target); m != "" {
			return &GuardrailVerdict{Category: r.category, Severity: r.severity, Matched: m}
		}
	}
	return nil
}

// MapSafetyFlag chuyển safety_flag do LLM trả về thành verdict cùng hệ quy chiếu.
// Trả về nil nếu flag rỗng/không hợp lệ.
func MapSafetyFlag(flag string) *GuardrailVerdict {
	switch strings.ToLower(strings.TrimSpace(flag)) {
	case "distress":
		return &GuardrailVerdict{Category: "self_harm", Severity: "high", Matched: "llm:safety_flag"}
	case "inappropriate":
		return &GuardrailVerdict{Category: "profanity", Severity: "medium", Matched: "llm:safety_flag"}
	case "jailbreak":
		return &GuardrailVerdict{Category: "jailbreak", Severity: "low", Matched: "llm:safety_flag"}
	}
	return nil
}

// SafeResponse trả về câu trả lời kịch bản phù hợp lứa tuổi thay cho LLM khi
// nội dung bị chặn. mode ("socratic"/"feynman") chỉ đổi giọng nhân vật.
func SafeResponse(category, mode string) string {
	bi := mode == "feynman"
	switch category {
	case "self_harm", "abuse":
		if bi {
			return "Em Bi nghe thấy thầy/cô đang buồn lắm ạ. Chuyện này quan trọng hơn bài học nhiều — thầy/cô hãy kể ngay cho bố mẹ hoặc thầy cô giáo ở trường nghe nhé. Mọi người thương và sẽ lắng nghe thầy/cô ạ."
		}
		return "Thầy nghe thấy em đang gặp chuyện không vui, và điều đó quan trọng hơn bài toán rất nhiều. Em hãy kể ngay cho bố mẹ, thầy cô ở trường hoặc một người lớn mà em tin tưởng nhé — mọi người luôn sẵn sàng lắng nghe và giúp em."
	case "sexual", "violence":
		if bi {
			return "Hơ, chuyện này em Bi không được học đâu ạ! Mình quay lại bài học nhé, thầy/cô giảng tiếp phần nãy cho em đi ạ!"
		}
		return "Chủ đề này không phù hợp với lớp học của chúng ta em nhé. Mình quay lại bài học — em đang làm đến bước nào rồi?"
	case "profanity":
		if bi {
			return "Ơ, em Bi không thích nghe từ đó đâu ạ. Thầy/cô nói nhẹ nhàng với em thôi nhé, rồi mình học tiếp ạ!"
		}
		return "Thầy biết đôi lúc học khó làm em bực bội, nhưng mình cùng dùng lời hay ý đẹp nhé. Nào, cho thầy biết em đang vướng ở bước nào?"
	case "jailbreak":
		if bi {
			return "Hì hì, em Bi chỉ biết học theo cách thầy/cô giảng từng bước thôi ạ. Thầy/cô giảng tiếp cho em đi ạ, đừng bắt em làm việc khác nhé!"
		}
		return "Thầy ở đây để cùng em suy nghĩ chứ không làm thay em được — vì em tự tìm ra thì kiến thức mới là của em. Nào, thử nói cho thầy nghe: theo em bước đầu tiên mình nên làm gì?"
	case "personal_info":
		if bi {
			return "Ấy, thầy/cô đừng chia sẻ số điện thoại hay địa chỉ ở đây nhé, cô giáo em dặn phải giữ bí mật thông tin cá nhân ạ! Mình học tiếp nha thầy/cô!"
		}
		return "Em nhớ nhé: không chia sẻ số điện thoại, địa chỉ hay thông tin cá nhân trong phòng học này. Giờ mình quay lại bài toán nào!"
	}
	return "Mình cùng quay lại bài học nhé em!"
}

// ExcerptForLog cắt nội dung lưu vào guardrail_events — đủ để giáo viên nắm
// bối cảnh, không lưu nguyên văn dài.
func ExcerptForLog(text string) string {
	runes := []rune(strings.TrimSpace(text))
	if len(runes) > 300 {
		return string(runes[:300]) + "…"
	}
	return string(runes)
}
