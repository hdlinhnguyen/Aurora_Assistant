# Users & Diagnostics — Prototype

Trang `/admin/users` (menu sidebar admin: **Người dùng & Chẩn đoán**). Dựng theo wireframe do team gửi: cây cấu trúc trường/khối/lớp bên trái, bảng "Users & Diagnostics" ở giữa (có ví dụ dòng lỗi validation), panel chi tiết + dual-listbox gán lớp bên phải.

## Trạng thái hiện tại

**Prototype tĩnh — toàn bộ người dùng, cây lớp học và kết quả gán lớp là mock, không gọi API thật.** Banner vàng ở đầu trang nhắc điều này.

Đã làm (tương tác thật ở tầng UI, chưa có tầng dữ liệu thật):
- Cây cấu trúc Trường/Khối/Lớp — mở/thu gọn Khối được, bấm vào 1 lớp sẽ lọc bảng theo lớp đó (state cục bộ, không gọi API).
- Ô tìm kiếm lọc bảng theo tên/email ngay trên dữ liệu mock (client-side, không debounce/không gọi API).
- Dòng lỗi validation (`student.invalid.email`) tô đỏ + chấm đỏ trên avatar + tooltip "Validation Errors" khi hover/click nút "Xem lỗi" — khớp trạng thái trong wireframe.
- Panel bên phải + dual-listbox gán lớp: chọn user ở bảng (nút "Xem chi tiết"/"Chẩn đoán") sẽ đổi panel bên phải; 2 khung `<select multiple>` + nút mũi tên trái/phải để chuyển lớp giữa "đã gán" và "khả dụng" — **chỉ lưu tạm trong state React, mất khi đổi user khác hoặc reload trang.**
- Các nút chưa có backend đứng sau ("Thêm người dùng", "Bulk Import & Provisioning", "Role Permission Matrix (RBAC)", các icon Xuất dữ liệu/Khóa hàng loạt/Đổi chế độ xem, nút "Lưu thay đổi" ở dual-listbox) đều hiện toast "sắp ra mắt" thay vì giả vờ đã hoạt động — tránh gây hiểu lầm là tính năng thật.

Chưa làm (để prototype, không đụng backend theo yêu cầu ban đầu):
- Không có route/handler backend mới nào được tạo.
- Không sửa `run.ps1`, `.env`, hay bất kỳ service Go/Python nào.

## Việc cần làm để lên dữ liệu thật

1. **Cây cấu trúc trường/khối/lớp:** hiện lấy từ `TREE` hardcode trong `page.tsx`. Backend đã có `/api/admin/classrooms` và `/api/admin/classrooms/:id/students` ([xem `admin/page.tsx`](../page.tsx) đang dùng) — cần thêm khái niệm "Khối" (gom nhóm lớp theo cấp, ví dụ `11`, `12`) nếu model dữ liệu hiện tại chưa có trường này, hoặc suy ra từ tên lớp (`11A1` → khối `11`) ở tầng frontend nếu backend không đổi.
2. **Bảng Users & Diagnostics:** cột `Avg Score`, `Clarity`, `Top Gap` nhìn giống dữ liệu mastery/Feynman clarity đã có trong hệ thống (xem `GET /api/teacher/students/:studentId/mastery`, các bảng liên quan tới Feynman Clarity nhắc ở gốc [README.md](../../../../../README.md)). Cần một endpoint tổng hợp theo học sinh (không phải theo topic) để đổ vào bảng này thay vì mock.
3. **Trạng thái lỗi validation:** hiện là 1 record mock cứng. Cần quyết định: lỗi này phát sinh ở đâu (import hàng loạt? đăng ký sai định dạng email?) và backend có nên trả về danh sách "user lỗi" riêng hay đánh dấu field `invalid`/`validationError` ngay trong response danh sách user.
4. **Dual-listbox gán lớp:** cần API kiểu `PUT /api/admin/students/:id/classes` (chưa tồn tại) nhận danh sách `classIds` mới. Vì một học sinh có thể chỉ thuộc 1 lớp cố định theo mô hình dữ liệu hiện tại (`class_id` đơn) — **cần xác nhận với team liệu multi-class per student có phải yêu cầu nghiệp vụ thật hay wireframe chỉ minh hoạ pattern UI chung**, trước khi build backend cho phép nhiều lớp/học sinh.
5. **Bulk Import & Provisioning, Role Permission Matrix (RBAC):** hai tính năng lớn, chưa có bất kỳ phần backend nào — cần scope riêng (định dạng file import, ma trận quyền theo role) trước khi thiết kế UI chi tiết hơn mock hiện tại.

## Quyết định thiết kế đáng chú ý

- Không tái tạo thanh header riêng trong ảnh wireframe (logo + chuông thông báo + avatar profile) vì layout admin dùng chung (`admin/layout.tsx`) đã có sidebar với tên tài khoản + đăng xuất — tránh trùng lặp 2 lớp "chrome" cho cùng một khu vực, giống quyết định đã áp dụng ở trang [`/admin/monitoring`](../monitoring/README.md).
- Các hành động chưa có backend dùng nhất quán 1 kiểu: `disabled` + `title` tooltip cho nút tĩnh, hoặc `toast.info(...)` cho nút có thể bấm — không để nút trông "sống" nhưng không làm gì cả mà im lặng, tránh người dùng tưởng đã lưu thành công.
