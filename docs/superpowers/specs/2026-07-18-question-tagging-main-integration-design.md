# Question Tagging Main Backend and Frontend Integration Design

## 1. Mục tiêu

Tích hợp nghiệp vụ đánh tag thủ công từ `question_tagging_backend` vào hệ thống
Aurora chính:

- Runtime backend duy nhất dùng Go, Fiber, GORM và PostgreSQL.
- Frontend dùng Next.js, React, Tailwind và các UI component hiện có.
- Câu hỏi trong ngân hàng hỗ trợ trắc nghiệm và tự luận có barem.
- Giáo viên gắn nhiều topic cho câu hỏi và từng ý barem.
- Câu được đưa vào đề sẽ snapshot nội dung, barem và tag; hai phía chỉnh sửa độc lập.
- Dữ liệu hiện có được bảo toàn. Tích hợp chỉ thêm bảng, cột, API và UI mới.

`question_tagging_backend` tiếp tục được giữ làm tài liệu tham chiếu và regression
oracle, không phải runtime dependency.

## 2. Quyết định đã chốt

- Tag tồn tại ở cả ngân hàng câu hỏi và câu hỏi trong đề.
- Tag ngân hàng là mặc định; khi thêm câu vào đề, hệ thống tạo snapshot độc lập.
- Ngân hàng câu hỏi được mở rộng cho cả trắc nghiệm và tự luận.
- Ngân hàng dùng chung: mọi giáo viên có thể xem và sửa câu/tag.
- Optimistic locking ngăn giáo viên ghi đè âm thầm thay đổi của nhau.
- UI tagging mở bằng dialog/side panel từ từng thẻ trong tab Ngân hàng câu hỏi.
- Giữ nguyên `Question.NodeID`, `Node.Subject`, `OptionsJSON`, `CorrectOption` và
  toàn bộ dữ liệu hiện có.
- Topic hợp lệ trước mắt được xác định bằng `Node.Subject` giống nhau. Không
  rewrite `Subject` hoặc backfill grade cho dữ liệu cũ.

## 3. So sánh và lựa chọn kiến trúc

### 3.1. Backend chính

Điểm mạnh:

- Một PostgreSQL thống nhất cho `Question`, `Node` và `User`.
- UUID, GORM, JWT và frontend `apiFetch` đã có sẵn.
- Không cần đồng bộ câu hỏi hoặc topic giữa hai service.

Điểm cần bổ sung:

- `Question.NodeID` chỉ biểu diễn một topic.
- Chưa có câu tự luận, barem, optimistic locking và effective-topic.
- API quản lý câu hỏi chưa enforce `role=teacher` nhất quán.
- Update nhận map tự do, chưa có request contract chặt.

### 3.2. `question_tagging_backend`

Nghiệp vụ nên giữ:

- Mapping quan hệ với unique key.
- Thay thế toàn bộ tập tag trong transaction.
- Kiểm tra topic tồn tại và cùng môn.
- Effective-topic là phép hợp không trùng.
- `expectedVersion` và lỗi `version_conflict`.
- Trả latest context để frontend phục hồi khi xung đột.

Thành phần không port nguyên trạng:

- FastAPI, SQLite, `BEGIN IMMEDIATE`, database seed độc lập và HTML demo.
- ID chuỗi demo.
- `updated_by` do client gửi.
- Bản sao riêng của question/topic/rubric.

### 3.3. Kiến trúc được chọn

Port nghiệp vụ sang Go và lưu mapping quan hệ trong PostgreSQL. FastAPI không
được gọi từ Go hoặc frontend.

## 4. Kiến trúc backend

Các thành phần mới hoặc được tách:

- `QuestionHandler`: bind request, kiểm tra teacher, lấy actor từ JWT và map lỗi.
- `QuestionService`: CRUD câu hỏi và barem, bảo đảm tương thích dữ liệu cũ.
- `TaggingHandler`: HTTP contract cho context và cập nhật tag.
- `TaggingService`: validation, transaction, versioning và effective-topic.
- `QuestionRepository`: truy vấn câu hỏi/barem.
- `TaggingRepository`: truy vấn mapping và state.

Handler không chứa quy tắc nghiệp vụ. Mọi thao tác thay thế tập tag và tăng
version chạy trong cùng một PostgreSQL transaction.

## 5. Mô hình dữ liệu

### 5.1. Mở rộng `Question`

Chỉ thêm cột:

- `QuestionType string`, mặc định `multiple_choice`; nhận
  `multiple_choice` hoặc `essay`.
- `GradeLevel string`, nullable/empty để giữ tương thích dữ liệu cũ.

Quy ước:

- Câu cũ mặc định là `multiple_choice`.
- Trắc nghiệm tiếp tục dùng `OptionsJSON` và `CorrectOption`.
- Tự luận dùng `OptionsJSON = "[]"` và `CorrectOption = -1`; các cột cũ không bị
  xóa hoặc đổi nullable.
- `NodeID` tiếp tục là topic legacy/primary và giữ nguyên cho các luồng cũ.

### 5.2. `QuestionRubricItem`

- `ID uuid.UUID`
- `QuestionID uuid.UUID`
- `Content string`
- `Points decimal(10,2)`
- `Position int`
- `CreatedAt`, `UpdatedAt`

Unique constraint `(question_id, position)`.

### 5.3. `QuestionTopicMapping`

- `QuestionID uuid.UUID`
- `NodeID uuid.UUID`
- `CreatedBy uuid.UUID`
- `CreatedAt`

Composite primary key `(question_id, node_id)`.

### 5.4. `QuestionRubricItemTopicMapping`

- `RubricItemID uuid.UUID`
- `NodeID uuid.UUID`
- `CreatedBy uuid.UUID`
- `CreatedAt`

Composite primary key `(rubric_item_id, node_id)`.

### 5.5. `QuestionTaggingState`

- `QuestionID uuid.UUID`, primary key
- `Version int`, bắt đầu từ 1
- `UpdatedBy *uuid.UUID`
- `UpdatedAt`

Version tăng đúng một lần sau mỗi lần thay đổi direct-topic hoặc tag của bất kỳ
rubric item nào thuộc câu hỏi.

### 5.6. Tương thích dữ liệu cũ

Không backfill hoặc rewrite `Question`.

Với câu chưa có `QuestionTaggingState`, API trả virtual state:

- `version = 1`
- `directTopicIds = [question.nodeId]`
- `effectiveTopics = [question.nodeId]`

Lần ghi đầu tiên với `expectedVersion = 1` tạo state và ghi tập mapping mới trong
cùng transaction. Sau đó mapping mới là nguồn tag chính, kể cả khi giáo viên chủ
động lưu một tập rỗng. `Question.NodeID` không bị sửa.

## 6. Quy tắc nghiệp vụ

### 6.1. Phạm vi topic

- Topic là `Node` chưa soft-delete.
- Topic hợp lệ khi `Node.Subject` bằng subject của `Question.NodeID`.
- Không tự thêm node cha, node con hoặc node tiên quyết.
- Có thể lưu tập tag rỗng.
- Request có tối đa 200 UUID topic, không chấp nhận UUID trùng hoặc không hợp lệ.

### 6.2. Effective-topic

Trắc nghiệm:

```text
effective(question) = direct(question)
```

Tự luận:

```text
effective(question)
= direct(question) union rubricTopics(all rubric items)
```

Kết quả được tính khi đọc, loại trùng và sắp xếp ổn định; không có bảng cache
effective-topic.

### 6.3. Optimistic locking

- Client gửi `expectedVersion` trong mọi request cập nhật tag.
- Transaction khóa row state bằng PostgreSQL row lock.
- Nếu version khác, trả HTTP 409 `version_conflict` kèm `latestContext`.
- Mutation thành công tăng version đúng một lần.
- Actor lấy từ JWT, không nhận `updatedBy` từ body.

### 6.4. Câu hỏi và barem

- Chỉ teacher được tạo/sửa/xóa câu và barem.
- Trắc nghiệm phải có ít nhất hai option và correct option hợp lệ.
- Tự luận không có options/correct option và có thể có nhiều rubric item.
- Xóa rubric item xóa mapping tag của item bằng cascade.
- Đổi câu từ tự luận sang trắc nghiệm chỉ được phép khi không còn rubric item.
- Xóa câu dùng soft delete hiện có; dữ liệu mapping bị ẩn theo câu và được dọn
  bằng FK/cascade khi có hard-delete bảo trì.

## 7. API contract

Tất cả route sau nằm sau JWT middleware và teacher-role guard.

### 7.1. Question bank

- `GET /api/teacher/question-bank/questions?subject=&nodeId=&type=&difficulty=&search=`
- `GET /api/teacher/question-bank/questions/:questionId`
- `POST /api/teacher/question-bank/questions`
- `PATCH /api/teacher/question-bank/questions/:questionId`
- `DELETE /api/teacher/question-bank/questions/:questionId`

API cũ `/api/subjects/:subject/questions`, `/api/nodes/:nodeId/questions` và
`/api/questions/:id` tiếp tục tồn tại để tránh phá luồng cũ. Frontend quản trị mới
chuyển sang contract teacher mới.

### 7.2. Rubric

- `POST /api/teacher/question-bank/questions/:questionId/rubric-items`
- `PATCH /api/teacher/question-bank/questions/:questionId/rubric-items/:rubricId`
- `DELETE /api/teacher/question-bank/questions/:questionId/rubric-items/:rubricId`
- `PUT /api/teacher/question-bank/questions/:questionId/rubric-items/reorder`

### 7.3. Tagging

- `GET /api/teacher/question-bank/questions/:questionId/tagging-context`
- `PUT /api/teacher/question-bank/questions/:questionId/topics`
- `PUT /api/teacher/question-bank/questions/:questionId/rubric-items/:rubricId/topics`
- `GET /api/teacher/question-bank/questions/:questionId/effective-topics`

Payload cập nhật:

```json
{
  "topicIds": ["uuid"],
  "expectedVersion": 1
}
```

Context trả:

- question summary và subject
- rubric items cùng topic IDs
- available topics cùng subject
- direct topic IDs
- effective topics
- version, updatedBy, updatedAt

### 7.4. Error contract

```json
{
  "error": {
    "code": "topic_subject_mismatch",
    "message": "Topic must belong to the same subject as the question.",
    "details": {}
  }
}
```

Các code chính:

- `request_validation_error`
- `teacher_role_required`
- `question_not_found`
- `rubric_item_not_found`
- `rubric_item_mismatch`
- `topic_not_found`
- `topic_subject_mismatch`
- `version_conflict`
- `invalid_question_type`
- `invalid_choice_set`

## 8. Tích hợp với module tạo đề

Thiết kế này bổ sung cho
`2026-07-18-create-exam-main-integration-design.md`.

Khi thêm câu từ ngân hàng:

1. `ExamService` đọc question, options, rubric, direct-topic và rubric-topic trong
   một transaction/read snapshot.
2. Tạo `ExamQuestion` và `ExamRubricItem`.
3. Sao chép direct-topic và rubric-topic sang dữ liệu đề.
4. Effective-topic của câu trong đề được tính từ snapshot.

Sau snapshot:

- Sửa tag ngân hàng không đổi tag trong đề.
- Sửa tag trong đề không đổi ngân hàng.
- Xóa hoặc sửa source question không đổi snapshot.
- `SourceQuestionID` chỉ phục vụ truy vết.

Với schema tạo đề chưa được triển khai, ưu tiên mapping quan hệ
`ExamQuestionTopicMapping` và `ExamRubricItemTopicMapping`. Nếu phần tạo đề được
triển khai trước theo `TopicNodeIDsJSON`, service phải giữ cùng API contract và
quy tắc snapshot; storage JSON được cô lập trong repository.

## 9. Frontend

### 9.1. Ngân hàng câu hỏi

Mở rộng `QuestionBankTab`:

- Filter theo loại câu.
- Badge trắc nghiệm/tự luận.
- Hiển thị các topic hiệu lực.
- Nút `Gắn topic` trên mỗi thẻ.
- Form tạo/sửa hỗ trợ chọn loại câu.
- Composer barem cho câu tự luận.

### 9.2. Tagging side panel

Component riêng `QuestionTaggingPanel`:

- Tải một tagging context khi mở.
- Tìm kiếm topic trong danh sách cùng môn.
- Multi-select direct-topic.
- Với câu tự luận, hiển thị từng rubric item và multi-select riêng.
- Hiển thị effective-topic read-only.
- Lưu từng tập tag độc lập và thay local context bằng response server.
- Cho phép tập rỗng.

Không nhúng tagging state vào component trang teacher lớn hơn mức cần thiết.

### 9.3. Xử lý xung đột

Khi HTTP 409:

- `apiFetch` phải giữ được status, error code và `latestContext`.
- Panel hiển thị thông báo dữ liệu vừa được giáo viên khác cập nhật.
- Thay state local bằng `latestContext`.
- Không tự ghi đè hoặc tự merge.
- Giáo viên chọn lại thay đổi và lưu với version mới.

### 9.4. Tích hợp tạo đề

Inspector câu trong `ExamBuilderTab` dùng cùng kiểu topic selector nhưng gọi API
exam. UI ghi rõ đây là tag snapshot của đề, không phải tag ngân hàng.

## 10. Bảo mật và độ tin cậy

- Teacher guard chạy server-side cho toàn bộ API quản trị mới.
- Actor chỉ lấy từ JWT `sub`.
- UUID và request body được validate bằng DTO cụ thể.
- Không cho client gửi field ngoài contract để update model tùy ý.
- GORM dùng parameterized query.
- Topic subject được kiểm tra lại trong transaction.
- Unique constraint ngăn mapping trùng.
- Row lock và version predicate ngăn hai writer cùng commit.
- Không trả internal database error trực tiếp cho client.

## 11. Testing

### 11.1. Backend

- Virtual legacy state dùng `Question.NodeID`.
- Lần ghi đầu tạo state mà không sửa Question.
- Multiple topics và tập rỗng.
- Topic khác subject bị từ chối.
- Topic không tồn tại bị từ chối.
- Effective-topic của tự luận là phép hợp loại trùng.
- Xóa tag rubric cuối làm effective-topic thay đổi đúng.
- Direct tag vẫn tồn tại khi tag trùng bị xóa khỏi rubric.
- Rubric phải thuộc đúng essay question.
- Hai writer cùng version chỉ một writer commit.
- Conflict trả latest context.
- Actor lấy từ JWT và student bị 403.
- CRUD/reorder rubric và validation loại câu.
- API cũ tiếp tục đọc được câu cũ.

### 11.2. Frontend

- Production build và TypeScript pass.
- Panel render direct/effective/rubric topics.
- Lưu tập rỗng.
- Conflict thay context mới và không tự retry mutation.
- Question bank filter/render được cả hai loại câu.
- Smoke test: teacher mở bank, mở panel, gắn tag, gắn tag rubric và tải lại thấy
  dữ liệu đã lưu.

### 11.3. Regression

- 18 test của `question_tagging_backend` tiếp tục pass.
- Backend guardrail test hiện có tiếp tục pass.
- Luồng student/tutor dùng `Question.NodeID` không bị thay đổi.

## 12. Triển khai theo giai đoạn

1. Thêm model/migration additive và tagging domain service.
2. Thêm teacher question-bank/rubric/tagging API.
3. Chuyển `QuestionBankTab` sang API mới và thêm side panel.
4. Chạy regression backend/frontend.
5. Khi module tạo đề được triển khai, nối snapshot adapter vào `ExamService`.

Không xóa FastAPI reference, route cũ, cột cũ hoặc dữ liệu cũ trong đợt tích hợp.

## 13. Tiêu chí hoàn thành

- Không cần chạy FastAPI để đánh tag.
- Teacher gắn được nhiều topic cho câu và từng rubric item.
- Effective-topic đúng quy tắc và không trùng.
- Câu cũ có virtual tag từ `NodeID` mà không cần backfill.
- Optimistic locking ngăn ghi đè.
- Student không gọi được API quản trị.
- Frontend có side panel tagging trong ngân hàng câu hỏi.
- Tag đề thi là snapshot độc lập.
- Backend tests, frontend build và module regression pass.
- Không xóa, rewrite hoặc làm hỏng dữ liệu và API hiện có.
