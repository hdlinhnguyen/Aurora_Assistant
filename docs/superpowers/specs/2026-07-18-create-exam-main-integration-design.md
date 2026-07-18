# Create Exam Main Backend and Frontend Integration Design

## 1. Mục tiêu

Tích hợp toàn bộ nghiệp vụ tạo đề từ `create_exam_backend` vào hệ thống Aurora chính:

- Runtime backend dùng Go, Fiber, GORM và PostgreSQL.
- Xác thực dùng JWT và vai trò `teacher` hiện có.
- Ngân hàng câu hỏi dùng `Question`; topic kiến thức dùng `Node`.
- Frontend Next.js có tab `Tạo đề kiểm tra` trong sidebar giáo viên.
- Giữ đủ luồng soạn đề, barem, validation, optimistic locking, vòng đời đề,
  callback chấm idempotent, audit và xuất DOCX.

`create_exam_backend` tiếp tục được giữ làm tài liệu tham chiếu và regression
oracle; nó không còn là runtime bắt buộc của tính năng sau khi tích hợp.

## 2. Phạm vi

### 2.1. Trong phạm vi

- Port nghiệp vụ từ FastAPI/SQLite sang Go/Fiber/GORM/PostgreSQL.
- Câu trắc nghiệm một đáp án từ ngân hàng câu hỏi chính.
- Câu trắc nghiệm hoặc tự luận nhập trực tiếp trong đề.
- Topic tagging bằng UUID của `Node`.
- Barem theo từng ý cho câu tự luận; mỗi ý gắn ít nhất một node.
- Kéo-thả sắp xếp câu và sắp xếp barem.
- Optimistic locking bằng `expectedVersion`.
- Validation đầy đủ trước khi chuẩn bị phát đề, khóa chấm hoặc xuất DOCX.
- Vòng đời `drafting` → `preparing_exam` → `done`.
- Snapshot bất biến khi có bài nộp đầu tiên.
- Callback nội bộ idempotent cho module nộp/chấm.
- Xuất DOCX `standard` hoặc `compact`.
- Audit log cho các thay đổi quan trọng.
- Tab tạo đề trong dashboard giáo viên.
- Automated tests backend, frontend build và Playwright smoke test.

### 2.2. Ngoài phạm vi

- Không ghi câu nhập trực tiếp trong đề ngược vào `Question`.
- Không sửa câu nguồn trong `Question` khi giáo viên sửa snapshot trong đề.
- Không chấm bài, OCR hoặc nhận file bài làm trong tính năng này.
- Không xuất PDF.
- Không xóa `create_exam_backend`.
- Không tạo thêm topic bank hoặc question bank độc lập với `Node`/`Question`.

## 3. Kiến trúc

### 3.1. Backend

Các thành phần mới:

- `ExamHandler`: bind/validate HTTP input, lấy actor từ JWT, map domain error.
- `ExamService`: ownership, versioning, validation, state machine, snapshot,
  callback, export và audit orchestration.
- `ExamRepository`: transaction và truy vấn GORM cho toàn bộ dữ liệu đề.
- `ExamExporter`: sinh DOCX từ snapshot, không phụ thuộc HTTP.
- GORM models: exam, exam question, rubric item, snapshot, grading progress,
  internal event, export và audit log.

Handler không chứa quy tắc nghiệp vụ. Các mutation nhiều bảng chạy trong một
PostgreSQL transaction. Service trả domain error có code ổn định để frontend
hiển thị đúng vị trí.

### 3.2. Frontend

Thêm active tab `exam-builder` vào dashboard giáo viên và component riêng
`ExamBuilderTab`. Component dùng `apiFetch`, JWT hiện có và không gọi trực tiếp
service Python.

UI có:

- Danh sách đề với tìm kiếm và lọc trạng thái.
- Form metadata đề.
- Danh sách câu kéo-thả và score meter.
- Ngăn chọn câu từ ngân hàng theo môn, node, độ khó và từ khóa.
- Composer câu thủ công.
- Inspector đáp án, topic và barem.
- Thanh validate, prepare, return-to-draft và export DOCX.
- Badge trạng thái, version, tiến độ chấm và trạng thái khóa.

## 4. Mô hình dữ liệu

### 4.1. `Exam`

- `ID uuid.UUID`
- `Title string`
- `Subject string`
- `GradeLevel string`
- `DurationMinutes int`
- `Instructions string`
- `TotalPoints decimal`
- `Status string`: `drafting`, `preparing_exam`, `done`
- `Version int`: bắt đầu từ 1
- `CreatedBy uuid.UUID`: FK tới `User`
- `FirstSubmissionReceivedAt *time.Time`
- `LockedSnapshotID *uuid.UUID`
- `CreatedAt`, `UpdatedAt`
- soft delete chỉ dùng cho đề nháp chưa khóa

Index:

- `(created_by, status)`
- `(created_by, updated_at)`

### 4.2. `ExamQuestion`

- `ID uuid.UUID`
- `ExamID uuid.UUID`
- `SourceType string`: `question_bank` hoặc `manual`
- `SourceQuestionID *uuid.UUID`
- `QuestionType string`: `single_choice` hoặc `essay`
- `Content string`
- `Points decimal`
- `Position int`
- `ChoicesJSON string`
- `CorrectChoiceID *string`
- `TopicNodeIDsJSON string`
- `CreatedAt`, `UpdatedAt`

Unique constraint `(exam_id, position)`.

Câu từ ngân hàng được snapshot từ `Question`:

- `Content` lấy từ `Question.Content`.
- Choices lấy từ `Question.OptionsJSON`; mỗi choice được gán ID ổn định theo
  vị trí trong snapshot.
- `CorrectChoiceID` được suy ra từ `Question.CorrectOption`.
- Topic mặc định là `Question.NodeID`.

Sau khi thêm, thay đổi ở `Question` không làm thay đổi `ExamQuestion`.

### 4.3. `ExamRubricItem`

- `ID uuid.UUID`
- `ExamQuestionID uuid.UUID`
- `Description string`
- `Points decimal`
- `Position int`
- `TopicNodeIDsJSON string`
- `CreatedAt`, `UpdatedAt`

Unique constraint `(exam_question_id, position)`.

### 4.4. `ExamSnapshot`

- `ID uuid.UUID`
- `ExamID uuid.UUID`
- `ExamVersion int`
- `Purpose string`: `grading_lock` hoặc `export`
- `SnapshotJSON string`
- `CreatedAt`

`grading_lock` được tạo đúng một lần khi nhận callback bài nộp đầu tiên.

### 4.5. `ExamGradingProgress`

- `ExamID uuid.UUID` làm primary key
- `TotalSubmissions int`
- `GradedSubmissions int`
- `ScoredSubmissions int`
- `UpdatedAt`

### 4.6. `ExamInternalEvent`

- `ID uuid.UUID`
- `ExamID uuid.UUID`
- `EventType string`
- `IdempotencyKey string`
- `PayloadJSON string`
- `ResultJSON string`
- `ProcessedAt`

Unique constraint `(event_type, idempotency_key)`. Event lưu cả payload canonical
và result để retry trả đúng kết quả ban đầu.

### 4.7. `ExamExport`

- `ID uuid.UUID`
- `ExamID uuid.UUID`
- `ExamVersion int`
- `Style string`: `standard` hoặc `compact`
- `FileName string`
- `FilePath string`
- `CreatedBy uuid.UUID`
- `CreatedAt`

Physical path không được trả trong JSON API.

### 4.8. `ExamAuditLog`

- `ID uuid.UUID`
- `ExamID uuid.UUID`
- `Action string`
- `ActorID uuid.UUID`
- `PreviousValueJSON string`
- `NewValueJSON string`
- `OccurredAt`

## 5. Nguồn dữ liệu chính

### 5.1. Môn học

Danh sách môn lấy từ các giá trị `Node.Subject` khác nhau. `Exam.Subject` lưu
snapshot tên môn để đề không phụ thuộc việc đổi tên môn về sau.

### 5.2. Topic

Topic hợp lệ là `Node` chưa bị soft-delete và có `Subject` bằng môn của đề.
`ExamQuestion` và `ExamRubricItem` lưu UUID node dưới dạng JSON snapshot.

### 5.3. Ngân hàng câu hỏi

Ngân hàng lấy từ `Question` join `Node`:

- Lọc theo `Node.Subject`, `Question.NodeID`, `Question.Difficulty` và search.
- `Question` hiện tại được ánh xạ thành `single_choice`.
- Tự luận được tạo thủ công trong đề.
- Xóa hoặc sửa câu nguồn không làm thay đổi đề đã snapshot.

`GradeLevel` là metadata của đề. Trong phiên bản tích hợp này không thêm grade
vào `Node` hoặc `Question`; phạm vi ngân hàng được giới hạn bằng `Subject`, vốn
đang là workspace kiến thức của backend chính.

## 6. API contract

Tất cả teacher route nằm sau JWT middleware và kiểm tra claim `role=teacher`.
Actor ID lấy từ JWT `sub`; client không gửi teacher ID.

### 6.1. Exam

- `POST /api/teacher/exams`
- `GET /api/teacher/exams?status=&search=`
- `GET /api/teacher/exams/:examId`
- `PATCH /api/teacher/exams/:examId`
- `DELETE /api/teacher/exams/:examId?expectedVersion=`
- `GET /api/teacher/exams/:examId/audit`

### 6.2. Bank và topic

- `GET /api/teacher/exam-bank/questions?subject=&nodeId=&difficulty=&search=`
- `GET /api/teacher/exam-bank/questions/:questionId`
- `GET /api/teacher/exam-bank/topics?subject=`

### 6.3. Câu trong đề

- `POST /api/teacher/exams/:examId/questions/from-bank`
- `POST /api/teacher/exams/:examId/questions/manual`
- `PATCH /api/teacher/exams/:examId/questions/:questionId`
- `DELETE /api/teacher/exams/:examId/questions/:questionId?expectedVersion=`
- `PUT /api/teacher/exams/:examId/questions/reorder`

### 6.4. Barem

- `POST /api/teacher/exams/:examId/questions/:questionId/rubric-items`
- `PATCH /api/teacher/exams/:examId/questions/:questionId/rubric-items/:rubricId`
- `DELETE /api/teacher/exams/:examId/questions/:questionId/rubric-items/:rubricId?expectedVersion=`
- `PUT /api/teacher/exams/:examId/questions/:questionId/rubric-items/reorder`

### 6.5. Validation và state transition

- `POST /api/teacher/exams/:examId/validate`
- `POST /api/teacher/exams/:examId/prepare`
- `POST /api/teacher/exams/:examId/return-to-draft`

### 6.6. Export

- `POST /api/teacher/exams/:examId/exports/docx`
- `GET /api/teacher/exams/:examId/exports`
- `GET /api/teacher/exams/:examId/exports/:exportId/download`

### 6.7. Internal callbacks

- `POST /internal/exams/:examId/first-submission`
- `POST /internal/exams/:examId/grading-completed`

Callback bắt buộc:

- `X-Internal-Token`
- `Idempotency-Key`

Token lấy từ `EXAM_INTERNAL_TOKEN`. So sánh constant-time. Idempotency key dài
tối đa 200 ký tự.

## 7. Quy tắc nghiệp vụ

### 7.1. Ownership và optimistic locking

- Chỉ chủ sở hữu được xem hoặc sửa đề.
- Mọi mutation của giáo viên gửi `expectedVersion`.
- Version không khớp trả HTTP 409 với code `version_conflict`.
- Mỗi transaction mutation thành công tăng version đúng một lần.

### 7.2. Validation

Validation trả danh sách lỗi gồm:

- `code`
- `message`
- `field`
- `examQuestionId` khi lỗi thuộc câu
- `rubricItemId` khi lỗi thuộc barem
- `expected` và `actual` khi có số điểm

Điều kiện:

1. Đề có ít nhất một câu.
2. Tổng điểm đề lớn hơn 0.
3. Tổng điểm câu bằng `totalPoints`.
4. Điểm mỗi câu lớn hơn 0.
5. Trắc nghiệm có ít nhất hai lựa chọn, choice ID duy nhất và đáp án tồn tại.
6. Tự luận không có choices/correct choice.
7. Tự luận có ít nhất một rubric item.
8. Tổng điểm barem bằng điểm câu.
9. Mỗi rubric có mô tả, điểm dương và ít nhất một topic hợp lệ.
10. Câu manual có ít nhất một topic hợp lệ.
11. Tất cả topic thuộc đúng môn của đề.

Các code chính:

- `exam_empty`
- `score_mismatch`
- `invalid_choice_set`
- `missing_correct_choice`
- `rubric_incomplete`
- `rubric_score_mismatch`
- `topic_required`
- `topic_not_allowed`
- `exam_locked`
- `invalid_transition`
- `version_conflict`

Điểm được lưu và tính bằng fixed-point decimal hai chữ số, không dùng float.

### 7.3. State machine

`drafting`:

- Được sửa metadata, câu, thứ tự và barem.
- Chuyển `preparing_exam` khi validation thành công.

`preparing_exam` trước bài nộp đầu tiên:

- Vẫn được sửa.
- Được trả về `drafting`.
- Mọi mutation vẫn tăng version.

Callback `first-submission`:

1. Kiểm tra trạng thái `preparing_exam`.
2. Chạy lại validation.
3. Tạo snapshot `grading_lock`.
4. Khởi tạo grading progress.
5. Ghi `first_submission_received_at` và `locked_snapshot_id`.
6. Khóa mọi mutation nội dung.

`done`:

- Chỉ callback `grading-completed` được chuyển trạng thái.
- Yêu cầu `totalSubmissions > 0`.
- `gradedSubmissions == totalSubmissions`.
- `scoredSubmissions == totalSubmissions`.
- Progress không được giảm và tổng submissions phải khớp lần khóa đầu tiên.
- Nội dung đề bất biến.

## 8. DOCX

Exporter nhận snapshot và option:

- `style`: `standard` hoặc `compact`
- `includeAnswerKey`
- `includeRubric`

DOCX gồm:

- Tiêu đề, môn, khối, thời gian, tổng điểm và hướng dẫn.
- Câu theo thứ tự, điểm từng câu và lựa chọn trắc nghiệm.
- Vùng trả lời cho câu tự luận.
- Trang đáp án và barem khi được chọn.
- Topic/node ID trong phần barem phục vụ module chấm.

Tên file được slug hóa, loại ký tự đường dẫn và kèm version. File được ghi vào
`EXAM_EXPORT_DIR`; mặc định `backend/data/exam-exports`. API download kiểm tra
owner theo cả exam ID và export ID.

## 9. Frontend behavior

### 9.1. Navigation

Thêm tab `exam-builder` với nhãn `Tạo đề kiểm tra` trong sidebar giáo viên.

### 9.2. Authoring workspace

- Chọn hoặc tạo đề.
- Metadata yêu cầu title, subject, grade, duration và total points.
- Bank panel chỉ hiển thị dữ liệu thuộc subject đã chọn.
- Kéo-thả gửi toàn bộ danh sách ID và `expectedVersion`.
- Mỗi response mutation thay thế local version bằng version từ server.
- Score meter hiển thị tổng điểm câu so với total points.
- Validation error liên kết tới field, question hoặc rubric tương ứng.

### 9.3. Concurrency và khóa

- HTTP 409 `version_conflict`: toast thông báo và tải lại detail.
- `exam_locked`: khóa form và hiển thị thời điểm nhận bài đầu tiên.
- `done`: read-only, vẫn cho xem audit và tải bản export đã có.

### 9.4. Download

Frontend gọi authenticated fetch, đọc blob, lấy file name từ
`Content-Disposition`, tạo object URL tạm và giải phóng URL sau download.

## 10. Error handling và security

- Request body không nhận field ngoài contract.
- Giới hạn độ dài title, instructions, question, choice và rubric như module cũ.
- Teacher route không tin `createdBy` từ client.
- Callback token không xuất hiện trong frontend hoặc response.
- File path không xuất hiện trong JSON.
- Export path luôn được tạo từ server-side UUID và safe file name.
- GORM dùng parameterized queries.
- Domain error map ổn định sang 400, 403, 404, 409 hoặc 422.
- Callback cùng idempotency key và canonical payload trả result cũ; payload khác
  trả `idempotency_conflict`.

## 11. Testing

### 11.1. Backend

- Unit test validation thuần.
- Service/repository integration test với PostgreSQL test database.
- Ownership và teacher role.
- Version conflict và version tăng đúng một lần.
- Snapshot câu ngân hàng không thay đổi khi source thay đổi.
- CRUD/reorder câu và barem.
- State transitions và mutation lock.
- Callback token, idempotency, progress monotonic và done condition.
- DOCX mở được như ZIP/OpenXML và chứa nội dung đề, đáp án, barem.
- Audit cho create, reorder, transition, lock, done và export.

### 11.2. Frontend

- Unit test helper score total, reorder và validation mapping.
- TypeScript/Next.js production build.
- Playwright smoke:
  1. Đăng nhập giáo viên demo.
  2. Mở tab tạo đề.
  3. Tạo đề.
  4. Thêm câu bank và manual essay.
  5. Thêm barem và reorder.
  6. Validate và prepare.
  7. Export và xác nhận download DOCX.

### 11.3. Regression

- `create_exam_backend` test suite tiếp tục pass.
- Các backend guardrail tests hiện tại tiếp tục pass.
- Các luồng teacher/student hiện tại vẫn render và đăng nhập được.

## 12. Triển khai và cấu hình

Biến mới:

- `EXAM_INTERNAL_TOKEN`: bắt buộc ngoài local.
- `EXAM_EXPORT_DIR`: mặc định `backend/data/exam-exports`.

GORM `AutoMigrate` tạo bảng mới khi backend khởi động. Không migration hoặc copy
dữ liệu từ SQLite vì database của module cũ là demo độc lập; câu hỏi dùng trực
tiếp từ PostgreSQL chính.

## 13. Tiêu chí hoàn thành

- Không cần chạy FastAPI `create_exam_backend` để dùng tab tạo đề.
- Giáo viên tạo, sửa, reorder, validate và prepare đề từ frontend.
- Câu ngân hàng lấy từ `Question`/`Node` và được snapshot.
- Manual essay và rubric hoạt động.
- Optimistic locking và ownership được enforced ở server.
- Callback khóa snapshot và hoàn tất grading đúng state machine.
- DOCX tải được từ frontend.
- Backend tests, frontend build và Playwright smoke pass.
- Không làm hỏng các luồng Aurora hiện có.
