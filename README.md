# Aurora Assistant: Học thật, hiểu thật 🎓🚀

Dự án **Aurora Assistant** là một trợ lý giáo dục cá nhân hóa thông minh áp dụng triết lý phản biện và tư duy sâu để giúp học sinh tiểu học làm chủ kiến thức bền vững, đồng thời cung cấp công cụ chẩn đoán đắc lực cho giáo viên.

---

## 💡 Đề tài & Bài toán gốc (Core Thesis)

> **"Học thật, hiểu thật"** — AI được lập trình để đặt các câu hỏi phản biện, dẫn dắt từng bước giúp người học tự tư duy để tìm ra câu trả lời cuối cùng.

Hệ thống kiên quyết nói **KHÔNG** với phương pháp học thụ động (cho sẵn lời giải). Thay vào đó, nó chia nhỏ vấn đề và dẫn dắt tư duy thông qua hai phương pháp sư phạm nổi tiếng:
1. **Phương pháp Socratic (Socratic Questioning)**: Gợi mở từng bước nhỏ, chẩn đoán lỗi sai ở đâu để đặt câu hỏi bù đắp kiến thức nền trước khi đi tiếp.
2. **Kỹ thuật Feynman (Feynman Technique)**: Bắt học sinh đóng vai người dạy giảng lại kiến thức cho bạn nhỏ AI bằng ngôn ngữ đơn giản nhất để kiểm tra mức độ thấu hiểu bản chất.
3. **Tư duy từ Nguyên lý gốc (First Principles Thinking)**: Bóc tách bài toán phức tạp về các chân lý toán học/tự nhiên cơ sở nhất (Axioms) và lập luận logic đi lên.

---

## 👥 Đối tượng Hướng đến & Trải nghiệm Người dùng

### 🦄 1. Đối tượng Học sinh (Cấp 1)
* **Phòng Chat Phản Biện Socratic**: Chatbot tương tác nhẹ nhàng, nhận diện lỗi sai và hướng dẫn từng bước nhỏ.
* **Tập Vở Feynman (Dạy lại cho AI)**: Học sinh đóng vai thầy cô dạy cho bé Bi (AI). Hệ thống tích hợp **Vocabulary Analyzer** bóc tách từ ngữ dễ hiểu vs. thuật ngữ phức tạp kèm theo **Thanh đo năng lượng Feynman Clarity Score** sinh động.
* **Bản đồ Nguyên lý (First Principles Canvas)**: Giao diện kéo chọn hạt nhân kiến thức giúp các em tự tay lắp ráp các chân lý gốc để chứng minh bài toán.
* **Chế độ Học Ngoại tuyến (Offline Mode & Batch Sync)**: Tự động lưu tin nhắn vào bộ nhớ trình duyệt khi mất mạng và đồng bộ hàng loạt lên máy chủ ngay khi phát hiện có mạng trở lại.

### 📊 2. Đối tượng Giáo viên
* **Biểu đồ Lỗ hổng (Concept Gaps)**: Tự động thống kê các chủ đề học sinh trong lớp hay làm sai nhất.
* **Cảnh báo Hỗ trợ Gấp (Danger List)**: Đưa lên đầu danh sách những học sinh liên tục trả lời sai để giáo viên can thiệp kịp thời.
* **Chỉ số Feynman Clarity**: Thống kê điểm giải thích trung bình của từng em để phát hiện những học sinh học vẹt (nhớ công thức nhưng không biết cách giải thích đơn giản).
* **Ngăn Kéo Kiểm Duyệt Học Sinh (Student Inspect Drawer)**: Giáo viên nhấp chuột vào học sinh để xem trích lục hội thoại chat thực tế và sơ đồ Nguyên lý gốc mà học sinh đó đã thiết lập.

---

## 🛠️ Công nghệ Sử dụng & Kiến trúc Hệ thống

* **Backend**: Go (Fiber v3)
* **Database**: PostgreSQL (chạy Docker độc lập trên cổng `5436`) + GORM AutoMigration
* **Frontend**: Next.js (App Router, Tailwind CSS, Turbopack)
* **AI Engine**: Google Gemini API (giao thức tương thích OpenAI adapter)

### Hồ sơ năng lực theo topic

Hệ thống lưu trạng thái BKT hiện tại và lịch sử theo từng cặp học sinh-topic.
Giảng viên chọn một học sinh trong danh sách lớp để xem badge `BKT %` trên cây
kiến thức, bấm topic để xem confidence và biến động 30 ngày/90 ngày/toàn bộ.
Học sinh chỉ đọc được hồ sơ của chính mình tại dashboard cá nhân.

- Python: `POST /mastery/calculate` tính trạng thái BKT.
- Go teacher: `GET /api/teacher/students/:studentId/mastery` và endpoint history.
- Go student: `GET /api/student/mastery` và endpoint history tự lấy ID từ token.
- PostgreSQL: `student_topic_masteries` lưu trạng thái mới nhất;
  `student_topic_mastery_histories` lưu snapshot bất biến.

---

## 🚀 Hướng dẫn Cài đặt & Khởi chạy Nhanh

### Yêu cầu trước khi cài đặt:
* Máy tính đã cài đặt **Docker Desktop** và **Node.js** (phiên bản mới nhất).
* Có cấu hình biến môi trường `OPENAI_API_KEY` (chứa khóa Gemini) tại `backend/.env`.

### Các bước khởi chạy:

1. Mở PowerShell tại thư mục gốc dự án: `c:\Users\Admin\Documents\Aivial\Aurora_Assistant`.
2. Chạy tệp script khởi động tự động:
   ```powershell
   ./run.ps1
   ```
   Script sẽ tự động:
   * Bật cơ sở dữ liệu PostgreSQL qua Docker Compose.
   * Biên dịch và chạy Backend Go trên cổng `8081`.
   * Khởi động Frontend Next.js trên cổng mặc định `3000`.

3. Mở trình duyệt truy cập: **[http://localhost:3000](http://localhost:3000)**.
4. Đăng nhập cực nhanh bằng thẻ One-Click Login có sẵn ở giao diện:
   * **Tài khoản Học sinh Demo**: `student@aurora.edu.vn` / Mật khẩu: `demo123`
   * **Tài khoản Giáo viên Demo**: `teacher@aurora.edu.vn` / Mật khẩu: `demo123`
