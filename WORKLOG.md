# Worklog — nhánh `cong-admin`

Ghi lại những gì đã làm trong phiên làm việc này, theo yêu cầu của bạn Thái (UX/UI). Mục tiêu chính: review + sửa UX các trang chính, và dựng 2 trang admin mới theo wireframe.

## 1. Landing page (`frontend/src/app/page.tsx`)

Review UX/UI rồi sửa trực tiếp:
- **Phân cấp CTA rõ ràng** — "Bắt đầu Học ngay" là nút chính (solid mint), "Tour Hướng Dẫn" chuyển thành nút phụ (outline purple), không còn cạnh tranh thị giác.
- **Tour không còn đăng nhập ngầm** — thêm trạng thái loading + báo lỗi bằng toast nếu login demo thất bại, thay vì âm thầm đẩy vào `/tutor` không có auth.
- **Sửa nhãn sai** — nút "Hướng dẫn sử dụng" (trỏ tới `/login?role=teacher`) đổi thành "Dành cho Giáo viên" cho đúng ý nghĩa.
- **Focus-visible ring** cho toàn bộ nút/link tương tác — hỗ trợ điều hướng bàn phím.
- **Tôn trọng `prefers-reduced-motion`** — các hiệu ứng `animate-pulse`/`animate-bounce` chuyển sang `motion-safe:`.
- **Fix layout shift** khi Lottie animation load xong (khung loading và khung thật giờ cùng kích thước).
- Icon trong 2 card "Học sinh"/"Giáo viên" có hiệu ứng hover thật thay vì class `group` để thừa không dùng.

## 2. Login page (`frontend/src/app/login/page.tsx`)

- **Gộp khối demo, bỏ trùng lặp** — banner "Synthetic Teacher (Vào nhanh)" trùng chức năng với ô "Giáo viên" trong lưới demo → xoá banner, thu nhỏ lưới demo, thêm divider "— hoặc đăng nhập bằng email —" tách bạch với form thật.
- **Việt hoá nhãn** — bỏ email kỹ thuật rút gọn (`synthetic.student.b@...`) khỏi UI.
- **Show/hide mật khẩu** + nút "Quên mật khẩu?" (báo toast "đang phát triển" thay vì link chết).
- **Spinner loading nhất quán** trên nút Đăng Nhập/Đăng Ký.
- **Đồng bộ thương hiệu** — "Aurora Socratic Tutor" → "Aurora Assistant" khớp landing page.
- **Fix container thiếu `relative`** khiến 2 quầng sáng nền định vị sai theo viewport thay vì theo khung trang.
- **Accessibility**: `aria-live` cho khối lỗi/thành công, `autoComplete`/`autoFocus` cho các input, đồng bộ `disabled` khi loading giữa 2 nút chuyển "Đăng nhập"/"Đăng ký ngay".
- Thêm link "← Về trang chủ" phía trên form (trước đó không có cách quay lại landing page).

## 3. Trang học (`frontend/src/app/tutor/page.tsx`)

Đây là trang lớn nhất (~2400 dòng, toàn bộ dùng inline style thay vì Tailwind) nên chỉ xử lý phần **accessibility** theo độ ưu tiên, chưa động tới phần responsive/design-token (xem mục "Chưa làm" bên dưới):

- **Chuyển 21 phần tử `<div onClick>` thành `<button>` thật** — chọn bước lộ trình, 4 tab (Lý thuyết/Luyện tập/Chat/Đề thi), đáp án trắc nghiệm, nút Trả lời/Câu tiếp theo/Gợi ý/Không làm được, quick-reply trong chat, đáp án đề thi, nút ở màn Hoàn thành bài học. Trước đó toàn bộ các tương tác này **không dùng được bằng bàn phím** và không được screen reader nhận diện là phần tử tương tác.
- Thêm class dùng chung `.ah-focusable` trong `globals.css` cho focus-visible ring, vì trang này không dùng Tailwind class nên không tận dụng được `focus-visible:` trực tiếp.
- **Fix bug tràn màn hình modal chẩn đoán đầu vào** — tăng khung danh sách đề thi từ `maxHeight: 180` lên `320` (trước đó cắt cụt nút "Vào thi" của đề thứ 3, đúng như ảnh chụp bạn gửi).
- **Làm rõ "chỉ cần làm 1 trong các đề"** — đối chiếu logic backend (`student_exam.go`) xác nhận nộp bất kỳ đề nào cũng đủ mở khoá lộ trình, nhưng UI cũ không nói rõ điều này.
- **Bỏ thuật ngữ kỹ thuật khỏi UI học sinh** — "(Exam ID)"/"UUID" → "mã đề thi thầy/cô gửi riêng cho em".
- **Giảm cảm giác "làm hoặc biến"** — nút "Đăng xuất tài khoản" (màu đỏ lỗi) đổi thành trung tính + thêm câu trấn an "có thể quay lại làm sau".
- Đồng bộ 2 nút "Vào thi"/"Bắt đầu" (2 cách vào một bài thi) về cùng 1 kiểu.

## 4. Trang Admin mới (prototype)

Dự án trước đó có `/admin` (tổng quan CRUD giáo viên/lớp + telemetry học tập) nhưng chưa có 2 màn hình admin theo 2 wireframe được gửi. Đã dựng **2 trang mới, đặt route riêng thay vì sửa `/admin` hiện có**, để không phá luồng cũ:

### `/admin/monitoring` — Admin Matrix Dashboard
- Prototype tĩnh 3 tầng: **Tầng 1** (Student/Teacher/Session/Adaptive Strategy metrics + biểu đồ HAU 24h), **Tầng 2** (LangGraph node latency + HTTP status tracker 2xx/4xx/5xx), **Tầng 3** (gauge chi phí Gemini + quota + billing circuit breaker).
- Toàn bộ số liệu là mock — có banner cảnh báo rõ ràng ở đầu trang.
- Chi tiết & lộ trình nối API thật: [`frontend/src/app/admin/monitoring/README.md`](frontend/src/app/admin/monitoring/README.md).

### `/admin/users` — Users & Diagnostics
- Cây cấu trúc Trường/Khối/Lớp (mở/thu gọn, lọc bảng theo lớp được thật ở tầng UI), bảng người dùng có ví dụ dòng lỗi validation (tô đỏ + tooltip), panel chi tiết + dual-listbox gán lớp (chuyển qua lại bằng mũi tên, state cục bộ).
- Các nút chưa có backend (Bulk Import, RBAC, Lưu thay đổi...) đều báo toast "sắp ra mắt" thay vì giả vờ hoạt động.
- Chi tiết & lộ trình nối API thật: [`frontend/src/app/admin/users/README.md`](frontend/src/app/admin/users/README.md).

Cả 2 trang đã được thêm vào sidebar admin (`frontend/src/app/admin/layout.tsx`).

## 5. Cập nhật khác

- `README.md` (gốc): thêm painpoint "thiếu nguồn lực cho gia sư 1-1" và giải pháp RAG hỗ trợ cá nhân hoá lộ trình.
- Đồng bộ hoá local dev environment: phát hiện `LEARNING_PATH_URL` mặc định của backend đụng cổng 8000 với container Docker của dự án khác trên máy — chạy learning-path service ở cổng 8010 thay thế (chỉ là cấu hình chạy local tạm thời, không sửa code).

## Chưa làm (để lại cho lần sau)

- **`/tutor` chưa responsive** — toàn trang dùng pixel cố định, không có `@media`, sẽ vỡ trên mobile/tablet. Đây là việc lớn, chưa động tới trong nhánh này.
- **Design token phân mảnh** — `/tutor` dùng màu hex hardcode riêng thay vì biến CSS `var(--mint)`/`var(--purple)` dùng ở các trang khác.
- 2 trang admin mới vẫn là **prototype dữ liệu mock** — xem README riêng của từng trang để biết việc cần làm để nối API thật.
