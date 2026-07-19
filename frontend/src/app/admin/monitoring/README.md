# Admin Matrix Dashboard — Prototype

Trang `/admin/monitoring` (menu sidebar admin: **Giám sát Hệ thống**). Dựng theo wireframe 3 tầng do team gửi (Tầng 1: User Metrics, Tầng 2: FastAPI & LangGraph, Tầng 3: AI Cost Control).

## Trạng thái hiện tại

**Đây là prototype tĩnh — toàn bộ số liệu là mock, không gọi API thật.** Trang có banner cảnh báo màu vàng ở đầu để không ai nhầm là dữ liệu production.

Đã làm:
- Layout khớp 3 tầng theo ảnh wireframe: cụm thẻ số liệu Tầng 1 (Student/Teacher/Session/Adaptive Strategy) + biểu đồ HAU 24h dạng cột, Tầng 2 (LangGraph node latency dạng thanh ngang + bảng HTTP status 2xx/4xx/5xx), Tầng 3 (gauge chi phí Gemini + quota toggle + billing circuit breaker indicator).
- Dùng design token sẵn có của app (`var(--mint)`, `var(--purple)`, `bg-card`, `shadow-[var(--shadow-card)]`...) thay vì hardcode màu riêng, để khớp theme sáng/tối và không lặp lại lỗi phân mảnh design token đã gặp ở trang `/tutor`.
- Thêm mục nav "Giám sát Hệ thống" vào sidebar admin ([layout.tsx](../layout.tsx)).
- Các nút "Clear Cache & Force Sync" / "System Logs" ở Tầng 2 để `disabled` có chú thích — chưa có hành vi vì chưa có API đứng sau.

Chưa làm (để prototype, không đụng backend theo yêu cầu ban đầu):
- Không có route/handler backend mới nào được tạo.
- Không sửa `run.ps1`, `.env`, hay bất kỳ service Go/Python nào.

## Việc cần làm để lên dữ liệu thật

Sắp xếp theo độ dễ (đã có phần backend gần giống) → khó (cần đo lường hạ tầng mới):

1. **Tầng 1 — dễ nhất, đã có API gần đủ:**
   - Student/Teacher count: có thể lấy từ `/api/admin/teachers`, `/api/admin/classrooms/:id/students` (đã dùng ở trang `/admin` hiện tại — xem [page.tsx](../page.tsx)).
   - Session/HAU: chưa có endpoint đếm phiên theo giờ — cần thêm bảng/aggregate ở backend Go (`internal/handler`), hoặc tính từ bảng session/telemetry hiện có nếu đã ghi timestamp login.
   - Adaptive Strategy Metrics (`remediation_group_count`, `advanced_group_count`): chưa rõ nguồn — cần xác nhận với team backend đây là nhóm học sinh theo `intervention-groups` (`GET /api/teacher/classes/intervention-groups/:subject` đã tồn tại) hay khái niệm mới.

2. **Tầng 2 — cần instrument mới, chưa có ở đâu trong repo:**
   - LangGraph node latency: cần đo thời gian thực thi từng node trong graph (`learning-path/src`, dùng LangGraph) và export ra một endpoint hoặc đẩy vào hệ thống metrics (Prometheus/OpenTelemetry). Hiện repo Python chưa có middleware đo latency per-node.
   - HTTP status tracker: cần middleware đếm status code ở tầng Go backend (Fiber) hoặc FastAPI, gom theo 2xx/4xx/5xx. Chưa có middleware này trong `backend/internal`.

3. **Tầng 3 — cần tích hợp billing/usage của Gemini API:**
   - Google Gemini (qua adapter OpenAI-compatible, xem `backend/.env` → `OPENAI_API_BASE`) không tự trả về chi phí — cần tự đếm token mỗi request (input/output) và nhân đơn giá, lưu vào DB, rồi aggregate cho gauge này.
   - "Billing Circuit Breaker" là tính năng nghiệp vụ chưa tồn tại — cần quyết định ngưỡng chi phí/quota và nơi enforce (chặn request khi vượt ngưỡng).

## Quyết định thiết kế đáng chú ý

- Đặt trang mới thay vì sửa trang `/admin` (Tổng quan) hiện có — tránh phá vỡ luồng thống kê cơ bản + bảng telemetry học tập ([TelemetryDashboard.tsx](../components/TelemetryDashboard.tsx)) đang hoạt động tốt. Hai trang phục vụ mục đích khác nhau: `/admin` là tổng quan quản trị (CRUD giáo viên/lớp + phân tích học tập), `/admin/monitoring` là giám sát vận hành hệ thống (infra + chi phí AI) — giống việc tách bảng "business metrics" khỏi "ops dashboard".
- Model Gemini hiển thị trong Tầng 3 (`gemini-2.5-flash`) lấy đúng theo giá trị đang cấu hình ở `backend/.env` (`OPENAI_MODEL`), dù các số liệu chi phí khác là mock — tránh gây hiểu lầm sai model đang chạy.
