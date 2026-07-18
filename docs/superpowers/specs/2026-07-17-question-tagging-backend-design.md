# Thiết kế backend Question Tagging Module

## Mục tiêu

Xây dựng một backend độc lập cho phép giáo viên gắn topic thủ công vào câu hỏi hoặc từng ý barem, tính tập topic hiệu lực và ngăn ghi đè khi có cập nhật đồng thời. Backend kèm một trang HTML demo tự chứa và chưa tích hợp với frontend chính.

## Phương án đã cân nhắc

1. **FastAPI + SQLite, repository theo cổng tích hợp** (chọn): chạy demo nhẹ, có OpenAPI, transaction và ràng buộc dữ liệu thật; các bảng câu hỏi/topic đóng vai trò dữ liệu mô phỏng cho hai hệ thống nguồn.
2. FastAPI + bộ nhớ: ít tệp hơn nhưng không chứng minh được unique constraint, transaction và optimistic concurrency khi chạy thật.
3. Node/Express + SQLite: phù hợp nếu repository đã có backend TypeScript, nhưng hiện chỉ có frontend và không có convention backend để kế thừa.

## Kiến trúc

Backend nằm biệt lập trong `backend/question_tagging/` để không va chạm các module backend khác và chia thành các đơn vị:

- `database.py`: kết nối SQLite, migration idempotent và transaction.
- `repositories.py`: đọc dữ liệu nguồn, đọc/ghi mapping và version; đây là biên thay thế bằng adapter Question Management/Knowledge Graph sau này.
- `service.py`: toàn bộ quy tắc nghiệp vụ tagging, validation, aggregation và optimistic concurrency.
- `schemas.py`: hợp đồng HTTP có kiểu rõ ràng.
- `main.py`: FastAPI routes, ánh xạ lỗi và phục vụ demo.
- `demo.html`: client HTML/CSS/JavaScript tự chứa, chỉ gọi REST API.
- `seed.py`: dữ liệu mẫu toán học gồm trắc nghiệm, tự luận, rubric và topic cùng/khác môn.

## API

- `GET /api/questions`: danh sách câu hỏi mẫu.
- `GET /api/questions/{question_id}/tagging-context`: câu hỏi, rubric, topic cùng môn, mapping, effective topics và version.
- `PUT /api/questions/{question_id}/topics`: thay toàn bộ direct topics với `topic_ids`, `expected_version`, `updated_by`.
- `PUT /api/questions/{question_id}/rubric-items/{rubric_item_id}/topics`: thay toàn bộ topic của một ý barem.
- `GET /api/questions/{question_id}/effective-topics`: hợp đồng tối thiểu cho module tiêu thụ.
- `GET /health`: health check.
- `GET /`: HTML demo.

`PUT` dùng replacement semantics để thao tác thêm/xóa vẫn idempotent ở cùng một version đầu vào. Mỗi thay đổi hợp lệ, kể cả đổi về danh sách rỗng, tăng version đúng một lần. Gửi lại version cũ trả HTTP 409 cùng trạng thái mới nhất để client tải lại.

## Dữ liệu và quy tắc

SQLite lưu bốn nhóm dữ liệu: dữ liệu nguồn mô phỏng (`questions`, `rubric_items`, `topics`), mapping do module sở hữu (`question_topic_mappings`, `rubric_item_topic_mappings`) và `question_tagging_states`.

- Topic được khử trùng lặp trước khi lưu.
- Topic phải tồn tại và cùng `subject_id`; khác khối lớp được chấp nhận.
- Rubric item phải thuộc đúng câu hỏi và chỉ câu tự luận mới có thể được tag ở cấp rubric.
- Trắc nghiệm lấy effective topics từ direct mappings.
- Tự luận lấy hợp của direct mappings và mọi rubric mappings, không mở rộng topic cha/con/prerequisite.
- Tất cả kiểm tra version và thay mapping diễn ra trong một transaction `BEGIN IMMEDIATE`.
- Dữ liệu không tồn tại trả 404, đầu vào sai nghiệp vụ trả 422, xung đột version trả 409.

## Demo

Trang demo cho phép chọn câu hỏi, tìm topic, bật/tắt direct topic và topic theo từng rubric. Mỗi lần lưu dùng version đang hiển thị; nếu có xung đột, trang báo lỗi và tải lại context mới nhất. Dữ liệu effective topics được hiển thị riêng để minh họa phép hợp.

### Interaction danh sách tag

Demo không hiển thị toàn bộ topic dưới dạng checkbox. Mỗi phạm vi tagging chỉ hiển thị các topic đã gắn dưới dạng danh sách:

- Khi chưa có tag, danh sách chỉ có dòng `+ Thêm tag cho câu hỏi` hoặc `+ Thêm tag cho ý này`.
- Trigger thêm tag luôn nằm cuối danh sách, kể cả sau khi đã có tag.
- Bấm trigger mở một popover neo tại chỗ, tự focus ô tìm kiếm và chỉ hiển thị topic chưa được gắn.
- Bấm một kết quả sẽ thêm topic, lưu ngay qua API replacement hiện có, đóng popover và cập nhật effective topics.
- Mỗi tag đã gắn có nút xoá; thao tác xoá cũng lưu ngay.
- Chỉ một popover được mở tại một thời điểm. Escape hoặc click bên ngoài đóng popover.
- Nếu version conflict, demo đóng popover, tải context mới nhất và thông báo rõ cho giáo viên.

### Thư viện topic và kéo-thả

Cột phải của demo có thêm `Thư viện topic`, trình bày topic theo mô hình folder/file:

- Mỗi khối lớp là một folder có thể mở/đóng; các topic cùng khối là những file bên trong.
- Topic luôn còn trong thư viện để giáo viên có thể dùng lại cho nhiều ý barem.
- Topic đã có hiệu lực trên câu hỏi được đánh dấu trực quan nhưng vẫn có thể kéo.
- Giáo viên kéo một topic rồi thả vào danh sách tag cấp câu hỏi hoặc một ý barem. Vùng hợp lệ được highlight trong lúc kéo.
- Thả topic sẽ dùng cùng hàm cập nhật và optimistic concurrency với popover. Nếu topic đã có trong phạm vi đó, demo không gửi request thừa.
- Popover `+ Thêm tag...` vẫn được giữ để hỗ trợ thao tác click, bàn phím và màn hình cảm ứng.

## Kiểm thử

Kiểm thử service/API bằng database tạm riêng cho mỗi test:

- nhiều tag cho câu trắc nghiệm;
- direct + rubric union, khử trùng lặp và quy tắc xóa;
- chấp nhận topic khác khối cùng môn, từ chối khác môn/không tồn tại;
- danh sách rỗng hợp lệ;
- rubric không thuộc câu hỏi bị từ chối;
- stale version trả 409 và không ghi đè;
- HTML demo và health endpoint được phục vụ.

## Phạm vi không làm

Không thêm AI, authentication, UI frontend chính, topic hierarchy expansion, offline sync hay merge tự động. `updated_by` là định danh caller do demo gửi; production authentication sẽ cung cấp giá trị này khi tích hợp.
