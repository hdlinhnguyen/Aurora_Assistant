# Aurora Assistant: Học thật, hiểu thật 🎓🚀

> Tóm tắt 1 câu: Hệ thống gia sư AI thích ứng giải quyết khoảng cách năng lực trong lớp học đông học sinh, giúp chẩn đoán lỗ hổng kiến thức và hỗ trợ giáo viên thông qua phương pháp Socratic cùng các giải thích minh hoạ bằng hình ảnh và học từ nguyên lý gốc (First Principle).

## Vấn đề (Problem)

Khoảng cách năng lực trong các lớp học đông học sinh ở Việt Nam:
- **Giáo viên và học sinh ở vùng khó khăn/lớp học đông:** Một giáo viên phải quản lý lớp ~40 học sinh với nền tảng kiến thức rất khác nhau.
- **Hệ quả:** Học sinh yếu bị bỏ lại phía sau, trong khi học sinh giỏi bị kìm hãm sự phát triển.
- **Hạn chế của giải pháp hiện tại:** Các ứng dụng học tập hiện tại chỉ đẩy bài giảng theo thứ tự cố định, thiếu tính thích ứng cho từng cá nhân học sinh và bỏ qua vai trò quan trọng của giáo viên trên lớp.

## Giải pháp (Solution)

Hệ thống gia sư thích ứng (Adaptive Tutoring System) kiên quyết nói **KHÔNG** với phương pháp học thụ động (cho sẵn lời giải), thay vào đó chia nhỏ vấn đề và dẫn dắt tư duy:
- **Phương pháp Socratic (Socratic Questioning):** Gợi mở từng bước nhỏ, chẩn đoán lỗi sai ở đâu để đặt câu hỏi bù đắp kiến thức nền trước khi đi tiếp.
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
# - Tài khoản Học sinh Demo:  student@aurora.edu.vn / demo123
# - Tài khoản Giáo viên Demo: teacher@aurora.edu.vn / demo123
# - Tài khoản Quản trị Demo:  admin@aurora.edu.vn   / demo123
```

Các cổng dịch vụ khi chạy local:

| Dịch vụ | URL |
|---------|-----|
| Frontend (Next.js) | http://localhost:3000 |
| Go Backend | http://localhost:8081/api/health |
| Python AI API (Swagger) | http://localhost:8000/docs |
| PostgreSQL (Docker) | localhost:5436 |

## Project Structure

Aurora là một **monorepo** gồm 3 phân hệ chạy song song (Go backend, Next.js frontend, Python AI service) cùng dữ liệu chương trình và tài liệu. Xem bản đồ tài liệu đầy đủ tại [`docs/INDEX.md`](docs/INDEX.md) và hướng dẫn cho người mới tại [`docs/ONBOARDING.md`](docs/ONBOARDING.md).

```
Aurora_Assistant/
├── backend/                    # Go API server (Fiber v3) — cổng :8081
│   ├── cmd/
│   │   ├── server/             # main.go: khởi tạo app + đăng ký route
│   │   ├── seed/               # seed dữ liệu DB
│   │   ├── import_bank/        # nạp ngân hàng câu hỏi
│   │   └── ...                 # check_questions, dump_mock, telemetry_rebuild, ...
│   ├── internal/
│   │   ├── handler/            # HTTP handlers (auth, exam, admin, mastery, tutor, scoring...)
│   │   ├── service/            # Business logic (ai_service, tutor_service, guardrail, tagging...)
│   │   ├── exam/ scoring/ mastery/ telemetry/ gamification/ adminmetrics/   # domain packages
│   │   ├── model/              # GORM models
│   │   ├── middleware/         # JWT auth + phân quyền theo role
│   │   ├── syntheticseed/      # dữ liệu demo tổng hợp (synthetic)
│   │   └── config/ runtime/    # cấu hình DB & runtime
│   └── docker/                 # docker-compose (PostgreSQL cổng 5436)
├── frontend/                   # Next.js (App Router + Tailwind) — cổng :3000
│   └── src/app/
│       ├── login/  tutor/  teacher/  admin/   # route theo vai trò
│       └── api/                # Next.js route handler (proxy hint)
├── learning-path/              # Python FastAPI + LangGraph — cổng :8000
│   └── src/learning_path/      # BKT mastery, planner, diagnosis, hints, ranking...
├── knowledge-graph/            # Sơ đồ kiến thức chương trình (JSON) + công cụ review
├── evals/                      # Bộ đánh giá (pytest) — bằng chứng chất lượng AI
├── data/                       # Ngân hàng câu hỏi & nguồn chương trình (exam_bank.json, master_bank.json)
├── design/                     # Design handoff & asset nhân vật (animation)
├── docs/                       # Tài liệu — bắt đầu ở docs/INDEX.md
├── presentation/               # Ghi chú pitch deck & bằng chứng nghiên cứu
├── ai-log/                     # Log prompt AI theo từng thành viên (deliverable)
├── tests/                      # Test tích hợp/smoke liên phân hệ (Python)
├── artifacts/                  # Ảnh chụp E2E (desktop/mobile)
├── architecture.md             # Tài liệu kiến trúc hệ thống
├── run.sh / run.ps1            # Khởi chạy toàn bộ stack bằng 1 lệnh
└── README.md
```

## API Endpoints

Toàn bộ API nghiệp vụ do **Go backend** (`:8081`, tiền tố `/api`) phục vụ, bảo vệ bằng JWT và phân quyền theo vai trò. Dưới đây là các nhóm chính (danh sách đầy đủ xem `backend/cmd/server/main.go`):

**Công khai (Public)**

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/health` | Health check |
| POST | `/api/auth/register` | Đăng ký tài khoản |
| POST | `/api/auth/login` | Đăng nhập, trả JWT |

**Học sinh (role: `student`)**

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/student/mastery` · `/review-path` · `/badges` | Hồ sơ thành thạo (BKT), lộ trình ôn, huy hiệu |
| GET · POST | `/api/student/exams` · `/exams/:examId/submit` | Danh sách & nộp bài thi |
| GET | `/api/student/learning-path` · `/learning-path/live` | Lộ trình học cá nhân hoá |

**Giáo viên (role: `teacher` / `admin`)**

| Method | Path | Mô tả |
|--------|------|-------|
| CRUD | `/api/teacher/exams/**` | Soạn/sửa đề thi, câu hỏi, rubric, export DOCX |
| CRUD | `/api/teacher/question-bank/**` | Ngân hàng câu hỏi + gán chủ đề (tagging) |
| CRUD | `/api/teacher/students` · `/classrooms` | Quản lý học sinh & lớp |
| GET | `/api/teacher/dashboard` · `/students-progress` · `/monitoring/:subject` | Bảng theo dõi & phân hoá lớp |
| CRUD | `/api/teacher/grading-batches/**` · `/scoring-submissions/**` | Chấm điểm thủ công theo rubric |

**Gia sư AI (mọi tài khoản đã đăng nhập)**

| Method | Path | Mô tả |
|--------|------|-------|
| POST · GET | `/api/tutor/sessions/**` | Phiên chat Socratic + lưu axiom (Bản đồ Nguyên lý) |
| GET | `/api/subjects/:subject/tree` · `/nodes/:nodeId/questions` | Cây kiến thức & câu hỏi theo node |
| POST | `/api/feynman/score` · `/api/student/hints` | Chấm Clarity Score (Feynman) & thang gợi ý |

**Quản trị (role: `admin`)**

| Method | Path | Mô tả |
|--------|------|-------|
| CRUD | `/api/admin/teachers` · `/classrooms` | Quản lý giáo viên & lớp |
| GET | `/api/admin/telemetry-dashboard` | Bảng đo lường hệ thống |

**Nội bộ (service-to-service, token riêng) & Telemetry**

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/api/internal/graph` | Cấp graph kiến thức cho Python service |
| POST | `/internal/exams/:examId/first-submission` · `/grading-completed` | Callback chấm bài |
| POST | `/api/telemetry/events` | Thu thập sự kiện học tập (ẩn danh) |

### AI Service (Python FastAPI + LangGraph) — `:8000`, xem `/docs`

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/health` | Health check |
| POST | `/learning-path` · `/learning-path/live` | Sinh/cập nhật lộ trình học (LangGraph) |
| POST | `/learning-path/{thread_id}/approve` · `/evidence` | Giáo viên duyệt lộ trình & nạp bằng chứng |
| POST | `/hints` | Sinh thang gợi ý (hint ladder) |
| POST | `/mastery/calculate` | Tính mức thành thạo bằng BKT |

## Deliverables Checklist

- [x] Source Code (GitHub)
- [x] README.md
- [x] Architecture Diagram (`architecture.md`)
- [x] AI Logs (LangSmith or application traces)
- [x] Live URL / Deploy
- [x] Video Demo
- [x] Pitch Deck 
- [x] Evaluation Evidence (`evals`)

## Team

| Member | Role |
|--------|------|
| Linh | Team Leader |
| Khang | Tech Lead |
| Dương | Backend engineer |
| Nghiệp | Frontend engineer |
| Thái | AI Engineer |

## License

MIT
