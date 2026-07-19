package syntheticseed

import (
	"encoding/json"
	"fmt"

	"backend/internal/model"

	"github.com/google/uuid"
)

// Nội dung học thật cho mạch "Số và Đại số" (bám Chương trình GDPT 2018).
// Thay các placeholder "Lớp X · <tên>" và câu hỏi "Câu hỏi X.Y" bằng lý thuyết +
// câu luyện tập có thật, để học sinh mở khóa nút là có bài học và bài tập ngay.

// realTheory: stableKey -> đoạn lý thuyết ngắn, dễ hiểu cho học sinh.
var realTheory = map[string]string{
	"l4-nhan-chia-so-tu-nhien": "Nhân là cộng nhiều lần cùng một số: 4 × 3 nghĩa là lấy 4 cộng với chính nó 3 lần (4+4+4=12). Chia là chia đều thành các phần bằng nhau: 12 : 3 = 4 nghĩa là chia 12 thành 3 phần, mỗi phần 4.",
	"l4-khai-niem-phan-so":     "Phân số cho biết ta lấy mấy phần của một cái được chia đều. Trong phân số 3/4: mẫu số 4 là chia thành 4 phần bằng nhau, tử số 3 là lấy 3 phần. Ví dụ chiếc bánh cắt 4 miếng, ăn 3 miếng là ăn 3/4 cái bánh.",
	"l4-tinh-chat-phan-so":     "Nhân (hoặc chia) cả tử và mẫu cho cùng một số khác 0 thì được phân số bằng nó: 1/2 = 2/4 = 3/6. Rút gọn là chia cho ước chung để phân số đơn giản hơn; quy đồng là nhân lên để hai phân số có cùng mẫu số.",
	"l4-phep-tinh-phan-so":     "Muốn cộng/trừ phân số cùng mẫu, ta cộng/trừ tử số và giữ nguyên mẫu: 1/5 + 2/5 = 3/5. Muốn nhân hai phân số, nhân tử với tử và mẫu với mẫu: 2/3 × 4/5 = 8/15.",
	"l4-so-sanh-phan-so":       "Hai phân số cùng mẫu: phân số nào tử lớn hơn thì lớn hơn (3/7 > 2/7). Khác mẫu thì quy đồng về cùng mẫu số rồi so sánh tử số. So sánh với 1: tử nhỏ hơn mẫu thì phân số bé hơn 1.",
	"l4-bieu-thuc-chu":         "Biểu thức số chỉ gồm số và phép tính (ví dụ 3 + 5 × 2). Biểu thức chữ có thêm chữ thay cho số chưa biết (ví dụ a + 5). Muốn tính giá trị biểu thức chữ, ta thay chữ bằng số cụ thể rồi tính.",
	"l5-quy-dong-phan-so":      "Muốn cộng hoặc trừ hai phân số KHÁC mẫu, trước hết phải quy đồng: đưa chúng về cùng một mẫu số chung (thường là mẫu số chung nhỏ nhất), rồi mới cộng/trừ tử số. Ví dụ 1/2 + 1/3 = 3/6 + 2/6 = 5/6.",
	"l5-so-thap-phan":          "Số thập phân là cách viết khác của phân số có mẫu là 10, 100, 1000... Phần trước dấu phẩy là phần nguyên, phần sau là phần thập phân: 3,25 = 3 + 2/10 + 5/100. 0,5 chính là 1/2.",
	"l5-phep-tinh-so-thap-phan": "Cộng/trừ số thập phân: đặt thẳng cột theo dấu phẩy rồi tính như số tự nhiên. Nhân: nhân như số tự nhiên rồi đếm tổng số chữ số ở phần thập phân của các thừa số để đặt dấu phẩy.",
	"l5-ti-so-phan-tram":       "Tỉ số so sánh hai đại lượng bằng phép chia (a : b hay a/b). Tỉ số phần trăm là tỉ số viết dưới dạng phần trăm: 1/4 = 25%. Muốn tìm phần trăm của một số, ta nhân số đó với tỉ số phần trăm.",
	"l6-khai-niem-so-nguyen":   "Số nguyên gồm số nguyên dương (1, 2, 3...), số 0 và số nguyên âm (-1, -2, -3...). Số âm dùng để chỉ đại lượng dưới mốc 0 như nhiệt độ dưới 0°C hay nợ tiền. Trên trục số, số càng bên trái càng nhỏ.",
	"l6-luy-thua":              "Luỹ thừa là phép nhân lặp cùng một số: 2³ = 2 × 2 × 2 = 8. Số 2 là cơ số, số 3 là số mũ (số lần nhân). Nhân hai luỹ thừa cùng cơ số thì cộng số mũ: 2² × 2³ = 2⁵.",
	"l6-phan-so-tinh-chat":     "Ở lớp 6, phân số mở rộng cho cả tử và mẫu là số nguyên (mẫu khác 0): -3/4, 5/-2. Vẫn dùng tính chất cơ bản để rút gọn và quy đồng; khi so sánh cần chú ý dấu của phân số.",
	"l6-phep-tinh-phan-so":     "Cộng, trừ, nhân, chia phân số với tử/mẫu là số nguyên: quy tắc như phân số thường nhưng phải cẩn thận dấu âm/dương. Chia cho một phân số bằng nhân với phân số nghịch đảo của nó.",
	"l6-phep-tinh-so-nguyen":   "Cộng hai số cùng dấu: cộng phần số rồi giữ dấu. Khác dấu: lấy số lớn trừ số nhỏ, giữ dấu của số lớn hơn. Trừ một số bằng cộng với số đối. Nhân/chia: cùng dấu ra dương, khác dấu ra âm.",
	"l6-uoc-boi":               "Số a chia hết cho b khi phép chia không dư. Số nguyên tố là số chỉ có 2 ước là 1 và chính nó (2, 3, 5, 7...). ƯCLN dùng để rút gọn phân số, BCNN dùng để tìm mẫu số chung khi quy đồng.",
	"l7-so-huu-ti-khai-niem":   "Số hữu tỉ là số viết được dưới dạng phân số a/b với a, b là số nguyên và b khác 0. Mọi số nguyên, phân số, số thập phân hữu hạn đều là số hữu tỉ. Trên trục số, số hữu tỉ cũng so sánh theo vị trí.",
	"l7-phep-tinh-so-huu-ti":   "Cộng, trừ, nhân, chia số hữu tỉ được đưa về phép tính với phân số: quy đồng khi cộng/trừ, nhân tử-mẫu khi nhân, nhân nghịch đảo khi chia — luôn để ý dấu. Đây là nền tảng cho mọi tính toán đại số sau này.",
	"l7-can-bac-hai":           "Căn bậc hai số học của số a không âm là số x không âm sao cho x² = a. Ví dụ √25 = 5 vì 5² = 25. Không phải số nào cũng có căn là số hữu tỉ: √2 là số vô tỉ.",
	"l7-so-thuc":               "Số thực gồm cả số hữu tỉ và số vô tỉ (như √2, π — số thập phân vô hạn không tuần hoàn). Mỗi điểm trên trục số ứng với đúng một số thực. Làm tròn giúp ước lượng số thực về số thập phân gọn hơn.",
	"l7-ti-le-thuc":            "Tỉ lệ thức là đẳng thức của hai tỉ số: a/b = c/d. Tính chất quan trọng: tích chéo bằng nhau, a×d = b×c. Từ đó suy ra dãy tỉ số bằng nhau, dùng để chia một đại lượng theo tỉ lệ cho trước.",
	"l7-dai-luong-ti-le":       "Hai đại lượng tỉ lệ THUẬN: đại lượng này gấp bao nhiêu lần thì đại lượng kia cũng gấp bấy nhiêu (y = k·x). Tỉ lệ NGHỊCH: cái này tăng bao nhiêu lần thì cái kia giảm bấy nhiêu lần (x·y = k không đổi).",
	"l7-bieu-thuc-dai-so":      "Biểu thức đại số gồm số, chữ (biến) và các phép tính. Muốn tính giá trị, ta thay biến bằng số rồi thực hiện phép tính theo đúng thứ tự. Ví dụ 2x + 3 tại x = 4 cho 2×4 + 3 = 11.",
	"l7-da-thuc-mot-bien":      "Đa thức một biến là tổng của các đơn thức cùng một biến, ví dụ P(x) = 2x³ - 5x + 1. Bậc của đa thức là số mũ lớn nhất của biến. Nghiệm của đa thức là giá trị của biến làm đa thức bằng 0.",
}

// authoredQuestion: một câu luyện tập thật.
type authoredQuestion struct {
	Content    string
	Options    []string // đúng 4 phương án
	Correct    int      // chỉ số phương án đúng (0..3)
	Difficulty string   // "easy" | "medium" | "hard"
	// DistractorPrereq: chỉ số phương án SAI -> stableKey nút tiên quyết bị chẩn đoán
	// (dùng cho truy vết gốc rễ khi học sinh chọn sai đúng "bẫy" đó).
	DistractorPrereq map[int]string
}

// authoredQuestions: stableKey -> danh sách câu luyện tập thật.
// Tập trung mạch phân số/số học lớp 4-6 mà học sinh đi qua (các nút đang trống).
var authoredQuestions = map[string][]authoredQuestion{
	"l4-nhan-chia-so-tu-nhien": {
		{Content: "Kết quả của 6 × 7 là bao nhiêu?", Options: []string{"42", "36", "48", "13"}, Correct: 0, Difficulty: "easy"},
		{Content: "Có 24 cái kẹo chia đều cho 4 bạn. Mỗi bạn được mấy cái?", Options: []string{"5", "6", "8", "4"}, Correct: 1, Difficulty: "easy"},
		{Content: "Kết quả của 15 × 4 là bao nhiêu?", Options: []string{"45", "19", "60", "54"}, Correct: 2, Difficulty: "medium"},
	},
	"l4-khai-niem-phan-so": {
		{Content: "Chiếc bánh cắt thành 8 phần bằng nhau, ăn 3 phần. Đã ăn bao nhiêu phần cái bánh?", Options: []string{"3/8", "8/3", "3/5", "5/8"}, Correct: 0, Difficulty: "easy"},
		{Content: "Trong phân số 5/9, số 9 gọi là gì?", Options: []string{"Tử số", "Mẫu số", "Thương", "Số dư"}, Correct: 1, Difficulty: "easy"},
		{Content: "Phân số nào chỉ 'một nửa'?", Options: []string{"1/3", "2/3", "1/2", "1/4"}, Correct: 2, Difficulty: "easy"},
	},
	"l4-tinh-chat-phan-so": {
		{Content: "Rút gọn phân số 6/8 về tối giản được kết quả nào?", Options: []string{"3/4", "2/3", "6/8", "1/2"}, Correct: 0, Difficulty: "medium"},
		{Content: "Phân số nào BẰNG 1/2?", Options: []string{"2/3", "3/6", "2/5", "1/3"}, Correct: 1, Difficulty: "medium"},
		{Content: "Nhân cả tử và mẫu của 2/3 với 4 được phân số nào?", Options: []string{"6/7", "2/12", "8/12", "8/3"}, Correct: 2, Difficulty: "medium"},
	},
	"l4-phep-tinh-phan-so": {
		{Content: "Tính 2/7 + 3/7.", Options: []string{"5/7", "5/14", "6/7", "5/49"}, Correct: 0, Difficulty: "easy"},
		{Content: "Tính 2/3 × 3/4.", Options: []string{"5/7", "6/12", "1/2", "6/7"}, Correct: 2, Difficulty: "medium",
			DistractorPrereq: map[int]string{0: "l4-khai-niem-phan-so"}},
		{Content: "Tính 4/5 - 1/5.", Options: []string{"3/5", "3/0", "5/5", "3/10"}, Correct: 0, Difficulty: "easy"},
	},
	"l4-so-sanh-phan-so": {
		{Content: "So sánh: 3/7 và 5/7. Phân số nào lớn hơn?", Options: []string{"5/7", "3/7", "Bằng nhau", "Không so sánh được"}, Correct: 0, Difficulty: "easy"},
		{Content: "Phân số nào BÉ hơn 1?", Options: []string{"5/4", "7/7", "3/8", "9/2"}, Correct: 2, Difficulty: "medium"},
	},
	"l4-bieu-thuc-chu": {
		{Content: "Tính giá trị của biểu thức a + 7 khi a = 5.", Options: []string{"12", "57", "2", "35"}, Correct: 0, Difficulty: "easy"},
		{Content: "Tính 3 + 4 × 2 (đúng thứ tự phép tính).", Options: []string{"14", "11", "10", "24"}, Correct: 1, Difficulty: "medium"},
	},
	"l5-quy-dong-phan-so": {
		{Content: "Mẫu số chung nhỏ nhất của 1/2 và 1/3 là bao nhiêu?", Options: []string{"6", "5", "2", "3"}, Correct: 0, Difficulty: "medium"},
		{Content: "Tính 1/2 + 1/3.", Options: []string{"2/5", "5/6", "1/6", "2/6"}, Correct: 1, Difficulty: "medium",
			DistractorPrereq: map[int]string{0: "l4-tinh-chat-phan-so", 3: "l4-tinh-chat-phan-so"}},
		{Content: "Muốn cộng 1/4 và 2/5 ta phải làm gì TRƯỚC?", Options: []string{"Cộng luôn tử với tử", "Quy đồng về cùng mẫu số", "Nhân hai mẫu vào tử", "Rút gọn kết quả"}, Correct: 1, Difficulty: "medium"},
	},
	"l5-so-thap-phan": {
		{Content: "Số thập phân 0,5 bằng phân số nào?", Options: []string{"1/2", "5/10 chưa rút gọn nhưng khác 1/2", "1/5", "5/1"}, Correct: 0, Difficulty: "easy"},
		{Content: "Trong số 3,27 thì chữ số 2 chỉ hàng nào?", Options: []string{"Phần mười", "Phần trăm", "Đơn vị", "Chục"}, Correct: 0, Difficulty: "medium"},
	},
	"l5-phep-tinh-so-thap-phan": {
		{Content: "Tính 1,5 + 2,3.", Options: []string{"3,8", "38", "3,08", "4,8"}, Correct: 0, Difficulty: "easy"},
		{Content: "Tính 0,2 × 3.", Options: []string{"0,6", "6", "0,06", "0,5"}, Correct: 0, Difficulty: "medium"},
	},
	"l5-ti-so-phan-tram": {
		{Content: "Phân số 1/4 bằng bao nhiêu phần trăm?", Options: []string{"25%", "14%", "40%", "4%"}, Correct: 0, Difficulty: "medium"},
		{Content: "25% của 200 là bao nhiêu?", Options: []string{"50", "25", "75", "100"}, Correct: 0, Difficulty: "medium"},
	},
	"l6-khai-niem-so-nguyen": {
		{Content: "Số nào sau đây là số nguyên âm?", Options: []string{"-4", "0", "3", "1/2"}, Correct: 0, Difficulty: "easy"},
		{Content: "Trên trục số, số nào NHỎ nhất?", Options: []string{"-5", "-2", "0", "3"}, Correct: 0, Difficulty: "medium"},
	},
	"l6-luy-thua": {
		{Content: "Giá trị của 2³ là bao nhiêu?", Options: []string{"8", "6", "9", "5"}, Correct: 0, Difficulty: "easy"},
		{Content: "Tính 3².", Options: []string{"9", "6", "5", "8"}, Correct: 0, Difficulty: "easy"},
	},
	"l6-phep-tinh-so-nguyen": {
		{Content: "Tính (-3) + 5.", Options: []string{"2", "-2", "8", "-8"}, Correct: 0, Difficulty: "medium"},
		{Content: "Tính (-4) × (-2).", Options: []string{"8", "-8", "6", "-6"}, Correct: 0, Difficulty: "medium"},
	},
	"l6-uoc-boi": {
		{Content: "Số nào sau đây là số nguyên tố?", Options: []string{"7", "9", "1", "15"}, Correct: 0, Difficulty: "medium"},
		{Content: "ƯCLN của 12 và 18 là bao nhiêu?", Options: []string{"6", "3", "2", "36"}, Correct: 0, Difficulty: "hard"},
	},
	"l6-phan-so-tinh-chat": {
		{Content: "Rút gọn phân số -4/8 được kết quả nào?", Options: []string{"-1/2", "1/2", "-4/8", "-2/4"}, Correct: 0, Difficulty: "medium"},
	},
	"l6-phep-tinh-phan-so": {
		{Content: "Tính 1/2 : 1/4 (chia cho phân số).", Options: []string{"2", "1/8", "1/2", "4"}, Correct: 0, Difficulty: "hard",
			DistractorPrereq: map[int]string{1: "l4-phep-tinh-phan-so"}},
	},
	// Lớp 7 — câu hỏi thật; distractor bẫy trỏ về nút nền tảng lớp dưới (phục vụ truy vết gốc rễ).
	"l7-so-huu-ti-khai-niem": {
		{Content: "Số nào sau đây là số hữu tỉ?", Options: []string{"-3/5", "√2", "π", "√7"}, Correct: 0, Difficulty: "easy"},
		{Content: "Số lớn nhất trong các số -0,5; -1/3; -0,75; -1 là số nào?", Options: []string{"-0,5", "-1/3", "-0,75", "-1"}, Correct: 1, Difficulty: "medium"},
	},
	"l7-phep-tinh-so-huu-ti": {
		{Content: "Tính -1/3 + 5/6.", Options: []string{"-1/2", "1/2", "2/3", "7/6"}, Correct: 1, Difficulty: "medium",
			DistractorPrereq: map[int]string{0: "l5-quy-dong-phan-so", 3: "l5-quy-dong-phan-so"}},
		{Content: "Tính (-3/4) × (8/9).", Options: []string{"-2/3", "2/3", "-3/2", "3/2"}, Correct: 0, Difficulty: "hard",
			DistractorPrereq: map[int]string{1: "l4-phep-tinh-phan-so"}},
	},
	"l7-can-bac-hai": {
		{Content: "Căn bậc hai số học của 81 là bao nhiêu?", Options: []string{"-9", "9", "±9", "8"}, Correct: 1, Difficulty: "medium"},
		{Content: "√50 nằm giữa hai số nguyên liên tiếp nào?", Options: []string{"5 và 6", "6 và 7", "8 và 9", "7 và 8"}, Correct: 3, Difficulty: "hard"},
	},
	"l7-so-thuc": {
		{Content: "Số nào là số vô tỉ?", Options: []string{"0,25", "7/11", "√3", "-2"}, Correct: 2, Difficulty: "medium"},
		{Content: "Làm tròn 3,14159 đến hàng phần trăm.", Options: []string{"3,14", "3,15", "3,1", "3,142"}, Correct: 0, Difficulty: "easy"},
	},
	"l7-ti-le-thuc": {
		{Content: "Tìm x biết x/6 = 4/3.", Options: []string{"6", "8", "9", "12"}, Correct: 1, Difficulty: "medium"},
		{Content: "Từ a/b = c/d suy ra đẳng thức nào?", Options: []string{"a+b=c+d", "a-c=b-d", "ad=bc", "ac=bd"}, Correct: 2, Difficulty: "hard"},
	},
	"l7-dai-luong-ti-le": {
		{Content: "3 kg gạo giá 54 nghìn đồng. 5 kg cùng loại giá bao nhiêu?", Options: []string{"90 nghìn", "72 nghìn", "108 nghìn", "81 nghìn"}, Correct: 0, Difficulty: "medium"},
		{Content: "6 người làm xong việc trong 8 ngày. 12 người cùng năng suất cần bao nhiêu ngày?", Options: []string{"2", "4", "6", "16"}, Correct: 1, Difficulty: "hard"},
	},
	"l7-bieu-thuc-dai-so": {
		{Content: "Giá trị của 2x + 3 tại x = 4 là bao nhiêu?", Options: []string{"11", "10", "8", "14"}, Correct: 0, Difficulty: "easy"},
		{Content: "Biểu thức nào là biểu thức đại số?", Options: []string{"3+5", "2x-7", "12:4", "√16"}, Correct: 1, Difficulty: "medium"},
		{Content: "Thu gọn 3x + 2x - x.", Options: []string{"6x", "5x", "3x", "4x"}, Correct: 3, Difficulty: "medium"},
	},
	"l7-da-thuc-mot-bien": {
		{Content: "Bậc của đa thức 3x⁴ - 2x + 1 là bao nhiêu?", Options: []string{"4", "3", "2", "1"}, Correct: 0, Difficulty: "easy"},
		{Content: "Nghiệm của đa thức P(x) = x - 5 là số nào?", Options: []string{"-5", "0", "5", "1"}, Correct: 2, Difficulty: "medium"},
	},
}

// buildNodeQuestions trả về câu hỏi thật cho một nút theo stableKey; trả nil nếu
// nút đó chưa được soạn (để caller dùng phương án dự phòng).
func buildNodeQuestions(nodeID uuid.UUID, stableKey, gradeLevel string) []model.Question {
	authored, ok := authoredQuestions[stableKey]
	if !ok || len(authored) == 0 {
		return nil
	}
	questions := make([]model.Question, 0, len(authored))
	for _, a := range authored {
		optionsBytes, _ := json.Marshal(a.Options)
		distractor := ""
		if len(a.DistractorPrereq) > 0 {
			m := make(map[string]string, len(a.DistractorPrereq))
			for optIdx, prereqKey := range a.DistractorPrereq {
				m[fmt.Sprintf("%d", optIdx)] = stableSyntheticUUID("curriculum", prereqKey).String()
			}
			b, _ := json.Marshal(m)
			distractor = string(b)
		}
		questions = append(questions, model.Question{
			ID: uuid.New(), NodeID: nodeID, Content: a.Content,
			OptionsJSON: string(optionsBytes), CorrectOption: a.Correct,
			Difficulty: a.Difficulty, QuestionType: "multiple_choice", GradeLevel: gradeLevel,
			DistractorMappings: distractor,
		})
	}
	return questions
}
