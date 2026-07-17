package service

import (
	"regexp"
	"strings"
)

// ─── Guardrail Layer ─────────────────────────────────────────────────────────
// Lớp kiểm duyệt kép cho chat học sinh tiểu học:
//   1. CheckStudentInput: regex/blocklist tiếng Việt (có dấu + không dấu) chạy
//      TRƯỚC khi gọi LLM — chặn nội dung không phù hợp, phát hiện tín hiệu
//      nguy hiểm (tự hại, bạo hành) và nỗ lực prompt-injection.
//   2. safety_flag: LLM tự gắn cờ trong JSON response (xem ai_service.go) —
//      bắt các trường hợp lách luật mà regex bỏ sót.
// Sự kiện bị gắn cờ được lưu vào bảng guardrail_events (xem tutor_service.go).

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

var guardrailRules = []guardrailRule{
	// ── Tự hại / khủng hoảng (ưu tiên cao nhất — kiểm tra trước) ──
	mustRule("self_harm", "high", `tự tử|tự sát|tự hại`, false),
	mustRule("self_harm", "high", `\bmuon chet\b|khong muon song|ket thuc cuoc doi|chan song lam|\btu sat\b|cat tay minh|tu lam dau ban than`, true),
	// ── Bạo hành / bắt nạt (học sinh kể bị hại — cần giáo viên can thiệp) ──
	mustRule("abuse", "high", `bị đánh|bạo hành|xâm hại|bị bắt nạt`, false),
	mustRule("abuse", "high", `bat nat em|danh em o|bao hanh|xam hai`, true),
	// ── Nội dung người lớn ──
	mustRule("sexual", "medium", `\bsex\b|khoa than|lam tinh|phim nguoi lon|coi truong|bo phan sinh duc`, true),
	// ── Bạo lực / vũ khí ──
	mustRule("violence", "medium", `giet nguoi|giet ban|dam chem|che tao bom|lam bom|mua sung|vu khi`, true),
	// ── Chửi bậy / xúc phạm ──
	mustRule("profanity", "medium", `dit me|du ma|deo me|con cac|cai lon|\boc cho\b|mat day|do ngu ngoc|thang cho|con cho nay|cut di|im mom`, true),
	// ── Prompt injection / thao túng vai trò AI ──
	// Lưu ý: regexp Go là RE2, KHÔNG hỗ trợ lookahead — chỉ dùng alternation thuần.
	mustRule("jailbreak", "low", `bo qua (moi |cac )?(huong dan|quy tac|chi dan)|quen (het )?vai tro|ignore (all |previous )?instructions?|system prompt|bay gio ban la|gia vo la|pretend you are|jailbreak`, true),
	// ── Xin đáp án trực tiếp (vi phạm triết lý "học thật") ──
	mustRule("jailbreak", "low", `cho (em |minh |tui |to )?(xin )?dap an|noi dap an|dap an luon|giai ho (em |minh )?(luon|het)|lam ho em (het |ca )?bai`, true),
	// ── Lộ thông tin cá nhân (số điện thoại VN 9-11 số) ──
	mustRule("personal_info", "low", `(so dien thoai|sdt|dia chi nha) (cua )?(em|minh|to) (la|o)`, true),
	mustRule("personal_info", "low", `\b0\d{9,10}\b`, true),
}

// CheckStudentInput trả về verdict đầu tiên khớp, hoặc nil nếu nội dung sạch.
// Stateless — an toàn khi gọi đồng thời.
func CheckStudentInput(text string) *GuardrailVerdict {
	lower := strings.ToLower(strings.TrimSpace(text))
	if lower == "" {
		return nil
	}
	folded := foldVietnamese(lower)

	for _, r := range guardrailRules {
		target := lower
		if r.folded {
			target = folded
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
