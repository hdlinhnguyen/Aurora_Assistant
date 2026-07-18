# Aurora Assistant: Học thật, hiểu thật 🎓🚀

> Tóm tắt 1 câu: Hệ thống gia sư AI thích ứng giải quyết khoảng cách năng lực trong lớp học đông học sinh, giúp chẩn đoán lỗ hổng kiến thức và hỗ trợ giáo viên thông qua phương pháp Socratic và kỹ thuật Feynman.

## Vấn đề (Problem)

Khoảng cách năng lực trong các lớp học đông học sinh ở Việt Nam:
- **Giáo viên và học sinh ở vùng khó khăn/lớp học đông:** Một giáo viên phải quản lý lớp ~40 học sinh với nền tảng kiến thức rất khác nhau.
- **Hệ quả:** Học sinh yếu bị bỏ lại phía sau, trong khi học sinh giỏi bị kìm hãm sự phát triển.
- **Hạn chế của giải pháp hiện tại:** Các ứng dụng học tập hiện tại chỉ đẩy bài giảng theo thứ tự cố định, thiếu tính thích ứng cho từng cá nhân học sinh và bỏ qua vai trò quan trọng của giáo viên trên lớp.

## Giải pháp (Solution)

Hệ thống gia sư thích ứng (Adaptive Tutoring System) kiên quyết nói **KHÔNG** với phương pháp học thụ động (cho sẵn lời giải), thay vào đó chia nhỏ vấn đề và dẫn dắt tư duy:
- **Phương pháp Socratic (Socratic Questioning):** Gợi mở từng bước nhỏ, chẩn đoán lỗi sai ở đâu để đặt câu hỏi bù đắp kiến thức nền trước khi đi tiếp.
- **Kỹ thuật Feynman (Feynman Technique):** Bắt học sinh đóng vai người dạy giảng lại kiến thức cho bạn nhỏ AI bằng ngôn ngữ đơn giản nhất để kiểm tra mức độ thấu hiểu bản chất.
- **Tư duy từ Nguyên lý gốc (First Principles Thinking):** Bóc tách bài toán phức tạp về các chân lý toán học/tự nhiên cơ sở nhất (Axioms) và lập luận logic đi lên.
- **Teacher Dashboard (Bắt buộc):** Tự động phân nhóm học sinh theo nhu cầu, gợi ý giáo viên ai cần giúp đỡ trước, và phát hiện các lỗ hổng kiến thức chung của cả lớp để giáo viên giảng lại.
- **Tính năng đặc thù:** Hoạt động offline hoặc ở điều kiện băng thông thấp, nội dung bám sát Chương trình Giáo dục phổ thông theo Văn bản của Bộ Giáo dục công bố năm 2018.

## Target User

**1. Đối tượng Học sinh (Primary):** Học sinh phổ thông tại Việt Nam.
- **Phòng Chat Phản Biện Socratic**: Chatbot tương tác nhẹ nhàng, nhận diện lỗi sai và hướng dẫn từng bước.
- **Tập Vở Feynman**: Dạy lại cho AI, được chấm điểm Clarity Score.
- **Bản đồ Nguyên lý**: Lắp ráp chân lý gốc để chứng minh bài toán.
- **Chế độ Học Ngoại tuyến (Offline Mode & Batch Sync)**: Lưu tin nhắn tự động khi mất mạng và đồng bộ khi có mạng.

**2. Đối tượng Giáo viên (Secondary):** Cần công cụ hỗ trợ theo dõi, quản lý và phân hóa năng lực học sinh.
- **Biểu đồ Lỗ hổng (Concept Gaps)**: Thống kê các chủ đề học sinh hay làm sai nhất.
- **Cảnh báo Hỗ trợ Gấp (Danger List)**: Đưa lên đầu danh sách học sinh liên tục trả lời sai.
- **Chỉ số Feynman Clarity**: Phát hiện học sinh học vẹt qua điểm giải thích.
- **Ngăn Kéo Kiểm Duyệt Học Sinh**: Trích lục hội thoại chat và sơ đồ tư duy của từng em.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Go (Fiber v3) |
| Python API | FastAPI + LangGraph (Python 3.11+) |
| Frontend | Next.js (App Router, Tailwind CSS, Turbopack) |
| Database | PostgreSQL (chạy Docker độc lập cổng `5436`) + GORM AutoMigration |
| AI Engine | Google Gemini API (giao thức tương thích OpenAI adapter) |
| DevOps | Docker + GitHub Actions (Script tự động `run.ps1` / `run.sh`) |

### Hồ sơ năng lực theo topic (BKT Mastery Profile)

Hệ thống lưu trạng thái BKT hiện tại và lịch sử theo từng cặp học sinh-topic.
Giảng viên chọn một học sinh trong danh sách lớp để xem badge `BKT %` trên cây
kiến thức, bấm topic để xem confidence và biến động 30 ngày/90 ngày/toàn bộ.
Học sinh chỉ đọc được hồ sơ của chính mình tại dashboard cá nhân.

- Python: `POST /mastery/calculate` tính trạng thái BKT.
- Go teacher: `GET /api/teacher/students/:studentId/mastery` và endpoint history.
- Go student: `GET /api/student/mastery` và endpoint history tự lấy ID từ token.
- PostgreSQL: `student_topic_masteries` lưu trạng thái mới nhất;
  `student_topic_mastery_histories` lưu snapshot bất biến.

## Quick Start

### Yêu cầu trước khi cài đặt:
- Máy tính đã cài đặt **Docker Desktop** và **Node.js** (phiên bản mới nhất).
- Có cấu hình biến môi trường `OPENAI_API_KEY` (chứa khóa Gemini) tại `backend/.env`.

### Các bước khởi chạy:

```bash
# 1. Clone repo
git clone https://github.com/hdlinhnguyen/Aurora_Assistant
cd Aurora_Assistant

# 2. Khởi chạy bằng script tự động (Bật DB, Backend Go, Python API và Frontend Next.js)
./run.ps1   # Trên Windows (PowerShell)
./run.sh    # Trên Mac/Linux (Terminal)

# 3. Trải nghiệm
# Mở trình duyệt truy cập: http://localhost:3000
# Đăng nhập nhanh bằng thẻ One-Click Login (tài khoản synthetic, seed khi backend khởi động):
# - Giáo viên:   synthetic.teacher@aurora.local   / demo123
# - Học sinh A:  synthetic.student.a@aurora.local / demo123
# - Học sinh B:  synthetic.student.b@aurora.local / demo123
# - Học sinh C:  synthetic.student.c@aurora.local / demo123
```

> Synthetic data được reset về trạng thái mẫu mỗi lần backend khởi động; backend tạo answer events rồi gọi BKT service để tính mastery (frontend không chứa phần trăm mastery hardcode). Đặt `ENABLE_SYNTHETIC_DATA=false` để giữ nguyên database và bỏ qua bước reset/seed.

## Project Structure

```
├── src/
│   ├── agents/          # LangGraph agent definitions
│   │   ├── graph.py     # Main graph (nodes + edges)
│   │   ├── state.py     # State schema
│   │   ├── nodes/       # Individual nodes
│   │   └── tools/       # Agent tools
│   ├── api/             # FastAPI routes
│   ├── models/          # Pydantic schemas
│   ├── services/        # Business logic
│   ├── config.py        # Settings
│   └── main.py          # App entry point
├── tests/               # Test suite
├── docs/                # Documentation
├── eval/                # Evaluation results
├── presentation/        # Demo materials
├── Dockerfile           # Multi-stage build
├── docker-compose.yml   # Full stack
└── .github/workflows/   # CI/CD pipelines
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| POST | /api/v1/chat | Chat with agent |
| POST | /api/v1/analyze | Analyze input |

## Deliverables Checklist

- [x] Source Code (GitHub)
- [x] README.md
- [x] Architecture Diagram (`docs/architecture.md`)
- [ ] AI Logs (LangSmith or application traces)
- [ ] Live URL / Deploy
- [ ] Video Demo
- [ ] Pitch Deck (`presentation/`)
- [x] Weekly Journal (`JOURNAL.md`)
- [x] Worklog (`WORKLOG.md`)
- [ ] Evaluation Evidence (`eval/results/`)

## Team

| Member | Role |
|--------|------|
| Linh | [Role] |
| Khang | [Role] |
| Dương | [Role] |
| Nghiệp | [Role] |
| Thái | [Role] |

## License

MIT
