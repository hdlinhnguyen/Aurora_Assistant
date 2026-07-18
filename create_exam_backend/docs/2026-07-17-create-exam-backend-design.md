# Create Exam Backend Design

## 1. Mục tiêu

Xây dựng một backend FastAPI độc lập giúp giáo viên:

1. Tạo đề kiểm tra theo thang điểm cấu hình được, mặc định là 10 điểm.
2. Chọn câu hỏi đã gắn topic từ ngân hàng câu hỏi seed hoặc tự nhập câu hỏi thủ công.
3. Sắp xếp câu hỏi bằng kéo-thả.
4. Tạo barem cho câu tự luận; mỗi ý trong barem phải có topic tag.
5. Kiểm tra tính hợp lệ trước khi chuẩn bị phát đề.
6. Xuất đề và barem thành DOCX có định dạng rõ ràng.
7. Quản lý vòng đời `drafting` → `preparing_exam` → `done`.
8. Chỉ chuyển sang `done` khi module chấm bài thông báo tất cả bài đã được chấm và có điểm.

MVP nằm hoàn toàn trong `create_exam_backend`. Không sửa thư mục `frontend`, không gọi mạng và không phụ thuộc credential bên ngoài.

## 2. Phạm vi

### 2.1. Trong phạm vi

- FastAPI REST API và OpenAPI.
- SQLite database riêng cho module.
- Trang demo HTML/CSS/JavaScript do FastAPI phục vụ tại `/`.
- Ngân hàng câu hỏi và topic seed để chạy demo độc lập.
- Hai loại câu hỏi:
  - Trắc nghiệm một đáp án (`single_choice`).
  - Tự luận (`essay`).
- Hai nguồn câu hỏi:
  - Câu lấy từ ngân hàng (`question_bank`).
  - Câu giáo viên nhập thủ công trong đề (`manual`).
- Topic tagging cho câu nhập thủ công.
- Rubric/barem có topic tagging theo từng ý.
- Kéo-thả thay đổi thứ tự câu.
- Optimistic concurrency bằng `expected_version`.
- DOCX với hai kiểu trình bày `standard` và `compact`.
- Callback nội bộ cho sự kiện bài nộp đầu tiên và hoàn thành chấm.
- Audit log cho thay đổi quan trọng.

### 2.2. Ngoài phạm vi

- Không ghi câu nhập thủ công vào ngân hàng câu hỏi.
- Không sửa topic tag của câu lấy từ ngân hàng trong phạm vi đề.
- Không tích hợp HTTP trực tiếp với Question Tagging hoặc OCR ở MVP.
- Không xuất PDF.
- Không triển khai PostgreSQL, object storage hoặc distributed queue.
- Không triển khai đăng nhập đầy đủ; MVP dùng header nhận diện giống module OCR hiện có.
- Không chấm điểm hoặc thực hiện OCR.

## 3. Kiến trúc

### 3.1. Thành phần

- **FastAPI application**: cấu hình ứng dụng, dependency injection, exception mapping và phục vụ demo.
- **Exam API router**: nhận request giáo viên, xác thực header và gọi application service.
- **Internal callback router**: xác thực shared secret và idempotency key trước khi chuyển sự kiện chấm.
- **ExamService**: chứa state machine, quy tắc điểm, khóa đề, versioning và quyền sở hữu.
- **QuestionBankRepository**: cung cấp câu hỏi/topic seed qua một interface có thể thay bằng HTTP adapter về sau.
- **ExamRepository**: thao tác transaction với đề, câu, barem, snapshot, export và audit.
- **DocumentExporter**: tạo DOCX từ một snapshot đề, không phụ thuộc demo UI.
- **SQLite database**: lưu trạng thái module.
- **Demo UI**: giao diện một trang, chỉ sử dụng public REST API và callback mô phỏng dành cho môi trường demo.

Router không tự chứa quy tắc nghiệp vụ. Mọi thay đổi nhiều bảng phải chạy trong một transaction. Service trả lỗi miền nghiệp vụ có mã ổn định; API chuyển các lỗi đó thành HTTP response.

### 3.2. Ranh giới tích hợp tương lai

`QuestionBankRepository` phải cung cấp contract tối thiểu:

- Liệt kê/lọc câu theo môn, khối, loại câu và topic.
- Lấy chi tiết một câu kèm choices, đáp án, rubric và topic snapshot.
- Liệt kê topic hợp lệ theo môn/khối.

Callback chấm bài dùng contract nội bộ ổn định để module OCR hoặc orchestration service có thể gọi mà không cần biết schema database của module tạo đề.

## 4. Mô hình dữ liệu

### 4.1. `teachers`

- `teacher_id`: định danh từ header.
- `display_name`: tên hiển thị cho demo.

### 4.2. `topics`

- `topic_id`
- `name`
- `subject_id`
- `grade_level`

Đây là dữ liệu seed của MVP. Topic được tham chiếu bởi câu nhập tay và rubric.

### 4.3. `question_bank_questions`

- `question_id`
- `content`
- `subject_id`
- `grade_level`
- `question_type`
- `default_points`
- `choices_json`
- `correct_choice_id`
- `topic_ids_json`
- `rubric_json`

Dữ liệu này chỉ đọc qua API ngân hàng. Khi đưa vào đề, nội dung cần thiết được snapshot vào bảng của đề.

### 4.4. `exams`

- `exam_id`: UUID.
- `title`
- `subject_id`
- `grade_level`
- `duration_minutes`
- `instructions`
- `total_points`: mặc định `10`.
- `status`: `drafting`, `preparing_exam`, hoặc `done`.
- `version`: bắt đầu từ `1`, tăng sau mỗi mutation của giáo viên.
- `created_by`
- `created_at`
- `updated_at`
- `first_submission_received_at`: null cho tới khi có callback đầu tiên.
- `locked_snapshot_id`: snapshot dùng để chấm sau khi bị khóa.

Mỗi API giáo viên chỉ được truy cập đề có `created_by` trùng `X-Teacher-Id`.

### 4.5. `exam_questions`

- `exam_question_id`: UUID riêng trong đề.
- `exam_id`
- `source_type`: `question_bank` hoặc `manual`.
- `source_question_id`: bắt buộc với câu ngân hàng, null với câu thủ công.
- `question_type`: `single_choice` hoặc `essay`.
- `content`
- `points`
- `position`
- `choices_json`: danh sách `{choice_id, content}` cho trắc nghiệm.
- `correct_choice_id`: đáp án đúng cho trắc nghiệm.
- `topic_ids_json`: topic snapshot của câu.

Quy tắc:

- `position` là duy nhất trong một đề.
- Câu trắc nghiệm phải có ít nhất hai lựa chọn và đúng một `correct_choice_id`.
- Câu tự luận không có choices/correct choice.
- Câu thủ công phải có ít nhất một topic hợp lệ thuộc cùng môn và khối với đề.
- Câu ngân hàng giữ topic snapshot từ ngân hàng và không cho chỉnh topic trong đề.
- Thay đổi câu nguồn sau này không làm thay đổi câu đã được thêm vào đề.

### 4.6. `rubric_items`

- `rubric_item_id`: UUID.
- `exam_question_id`
- `description`
- `points`
- `position`
- `topic_ids_json`

Quy tắc:

- Chỉ câu tự luận mới có rubric.
- Mỗi rubric item có ít nhất một topic hợp lệ.
- Tổng điểm rubric items phải bằng điểm của câu trước khi đề chuyển sang `preparing_exam`.
- Trong `drafting`, giáo viên được phép lưu barem tạm thời chưa đủ điểm để tiếp tục chỉnh.

### 4.7. `exam_snapshots`

- `snapshot_id`
- `exam_id`
- `exam_version`
- `purpose`: `grading_lock` hoặc `export`.
- `snapshot_json`
- `created_at`

Snapshot chứa metadata đề, câu theo thứ tự, choices, đáp án, barem và topic tags. `grading_lock` là bất biến và được tạo đúng một lần khi nhận bài nộp đầu tiên.

### 4.8. `grading_progress`

- `exam_id`
- `total_submissions`
- `graded_submissions`
- `scored_submissions`
- `updated_at`

Điều kiện hoàn tất:

- `total_submissions > 0`.
- `graded_submissions == total_submissions`.
- `scored_submissions == total_submissions`.

### 4.9. `internal_events`

- `event_id`
- `exam_id`
- `event_type`
- `idempotency_key`
- `payload_json`
- `processed_at`

Unique constraint trên `(event_type, idempotency_key)` bảo đảm callback lặp lại không tạo tác dụng phụ.

### 4.10. `exports`

- `export_id`
- `exam_id`
- `exam_version`
- `style`: `standard` hoặc `compact`.
- `file_name`
- `file_path`
- `created_by`
- `created_at`

File DOCX được sinh từ snapshot tương ứng với `exam_version`.

### 4.11. `audit_logs`

- `audit_id`
- `exam_id`
- `action`
- `actor_id`
- `previous_value_json`
- `new_value_json`
- `occurred_at`

Audit tối thiểu cho tạo đề, thay đổi trạng thái, reorder, khóa đề, callback chấm hoàn tất và export.

## 5. State machine

### 5.1. `drafting`

Giáo viên được:

- Sửa metadata.
- Thêm câu từ ngân hàng.
- Thêm/sửa/xóa câu thủ công.
- Thay đổi điểm.
- Tạo/sửa/xóa rubric.
- Kéo-thả thay đổi thứ tự.
- Chuyển sang `preparing_exam` khi validation đạt.

### 5.2. `preparing_exam`

Trước khi có bài nộp đầu tiên, giáo viên vẫn được sửa như ở nháp hoặc đưa đề về `drafting`. Mọi mutation vẫn tăng `version`.

Khi nhận `first_submission_received`:

1. Backend xác nhận đề đang `preparing_exam`.
2. Backend chạy lại toàn bộ validation.
3. Backend tạo `grading_lock` snapshot.
4. Backend ghi `first_submission_received_at`.
5. Backend khóa mọi mutation nội dung và không cho quay về nháp.

### 5.3. `done`

Chỉ callback `grading_completed` hợp lệ mới được chuyển đề sang `done`. Giáo viên không có API đặt trực tiếp trạng thái này.

Điều kiện chuyển:

- Đề đã có `grading_lock` snapshot.
- Tổng bài lớn hơn 0.
- Tất cả bài đã chấm.
- Tất cả bài đã có điểm.

`done` là trạng thái cuối và nội dung đề luôn bất biến.

## 6. Validation

Validation đầy đủ chạy khi:

- Giáo viên yêu cầu chuyển sang `preparing_exam`.
- Nhận bài nộp đầu tiên trước khi khóa.
- Sinh DOCX từ một version hiện hành.

Các điều kiện:

1. Đề có ít nhất một câu.
2. `total_points > 0`.
3. Tổng điểm câu bằng `total_points`, dùng Decimal và so sánh chính xác.
4. Mỗi điểm câu lớn hơn 0.
5. Câu trắc nghiệm có ít nhất hai lựa chọn, choice ID duy nhất và đáp án đúng tồn tại.
6. Câu tự luận có ít nhất một rubric item.
7. Tổng điểm rubric bằng điểm câu.
8. Mỗi rubric item có mô tả, điểm dương và ít nhất một topic hợp lệ.
9. Câu thủ công có ít nhất một topic hợp lệ.
10. Mọi topic thuộc đúng `subject_id` và `grade_level` của đề.

Response validation trả danh sách lỗi có:

- `code`
- `message`
- `field`
- `exam_question_id` hoặc `rubric_item_id` khi phù hợp

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

## 7. API

Tất cả route giáo viên yêu cầu:

- `X-Teacher-Id`
- `X-Role: teacher`

### 7.1. Ngân hàng và topic

- `GET /api/question-bank/questions`
  - Filter tùy chọn: `subject_id`, `grade_level`, `question_type`, `topic_id`, `search`.
- `GET /api/question-bank/questions/{question_id}`
- `GET /api/topics`
  - Filter bắt buộc theo `subject_id`, filter tùy chọn theo `grade_level`.

### 7.2. Đề

- `POST /api/exams`
- `GET /api/exams`
  - Filter theo trạng thái và search title.
- `GET /api/exams/{exam_id}`
- `PATCH /api/exams/{exam_id}`
  - Payload có `expected_version`.
- `DELETE /api/exams/{exam_id}`
  - Chỉ cho phép ở `drafting` và khi chưa có bài nộp.

### 7.3. Câu hỏi trong đề

- `POST /api/exams/{exam_id}/questions/from-bank`
  - Nhận `question_id`, `points`, `expected_version`.
- `POST /api/exams/{exam_id}/questions/manual`
  - Nhận nội dung, loại câu, điểm, topic IDs, choices/đáp án nếu là trắc nghiệm và rubric nếu là tự luận.
- `PATCH /api/exams/{exam_id}/questions/{exam_question_id}`
  - Không cho sửa topic của câu `question_bank`.
- `DELETE /api/exams/{exam_id}/questions/{exam_question_id}`
- `PUT /api/exams/{exam_id}/questions/reorder`
  - Nhận toàn bộ danh sách `exam_question_id` theo thứ tự mới và `expected_version`.

### 7.4. Rubric

- `POST /api/exams/{exam_id}/questions/{exam_question_id}/rubric-items`
- `PATCH /api/exams/{exam_id}/questions/{exam_question_id}/rubric-items/{rubric_item_id}`
- `DELETE /api/exams/{exam_id}/questions/{exam_question_id}/rubric-items/{rubric_item_id}`
- `PUT /api/exams/{exam_id}/questions/{exam_question_id}/rubric-items/reorder`

Mọi mutation nhận `expected_version` và trả version mới.

### 7.5. Validation và trạng thái

- `POST /api/exams/{exam_id}/validate`
- `POST /api/exams/{exam_id}/prepare`
- `POST /api/exams/{exam_id}/return-to-draft`

### 7.6. Callback nội bộ

Route yêu cầu:

- `X-Internal-Token`
- `Idempotency-Key`

Endpoints:

- `POST /internal/exams/{exam_id}/first-submission`
  - Payload: `total_submissions`.
- `POST /internal/exams/{exam_id}/grading-completed`
  - Payload: `total_submissions`, `graded_submissions`, `scored_submissions`.

`grading-completed` có thể cập nhật tiến độ chưa hoàn tất mà chưa đổi trạng thái. Chỉ payload đạt đủ điều kiện mới chuyển `done`.

### 7.7. Export

- `POST /api/exams/{exam_id}/exports/docx`
  - Payload: `style`, `include_answer_key`, `include_rubric`, `expected_version`.
- `GET /api/exams/{exam_id}/exports`
- `GET /api/exams/{exam_id}/exports/{export_id}/download`

Export chỉ được thực hiện khi validation đầy đủ đạt. Export không thay đổi `exam.version`.

## 8. DOCX

### 8.1. Phần đề

- Tên trường/sản phẩm demo và tiêu đề đề.
- Môn, khối, thời lượng, tổng điểm.
- Vùng trống cho họ tên/lớp.
- Hướng dẫn làm bài.
- Câu theo đúng thứ tự hiện tại.
- Điểm từng câu.
- Trắc nghiệm hiển thị choices; tự luận có vùng trống trả lời.

### 8.2. Phần đáp án và barem

Khi được chọn:

- Page break sau phần đề.
- Đáp án đúng cho câu trắc nghiệm.
- Các ý barem, điểm và topic tags cho câu tự luận.
- Tổng điểm kiểm tra ở cuối.

### 8.3. Style

- `standard`: khoảng cách thoáng, vùng trả lời tự luận lớn, phù hợp in phát đề.
- `compact`: giảm spacing và vùng trả lời, phù hợp xem nhanh hoặc tiết kiệm giấy.

Tên file được chuẩn hóa từ title và version, không cho phép path traversal.

## 9. Demo UI

Trang demo không dùng framework frontend và không sửa `frontend`.

### 9.1. Bố cục

- **Cột trái**: ngân hàng câu hỏi, search, filter loại câu và topic.
- **Vùng giữa**: metadata đề, danh sách câu có drag handle, tổng điểm hiện tại/mục tiêu và trạng thái.
- **Panel phải**: form sửa câu đang chọn, choices, đáp án hoặc rubric/topic tags.

### 9.2. Luồng demo

1. Chọn/tạo đề.
2. Kéo câu từ ngân hàng vào đề hoặc bấm “Thêm câu thủ công”.
3. Gắn topic và tạo barem.
4. Kéo-thả câu để đổi thứ tự.
5. Validate và sửa lỗi được chỉ đúng vị trí.
6. Chuyển sang `preparing_exam`.
7. Xuất/tải DOCX.
8. Mô phỏng callback bài nộp đầu tiên để khóa đề.
9. Mô phỏng callback chấm hoàn tất để chuyển `done`.

Demo tự thêm header giáo viên và token nội bộ từ cấu hình demo phía server. Token thật không được nhúng vào HTML khi chạy ngoài chế độ demo.

## 10. Concurrency, idempotency và transaction

- Mỗi mutation giáo viên dùng `expected_version`.
- Update chỉ thành công khi `version` trong database khớp; không khớp trả `409 version_conflict` và version hiện tại.
- Reorder xác nhận danh sách chứa đúng toàn bộ ID, không thiếu, thừa hoặc trùng.
- Callback ghi `internal_events` và thay đổi trạng thái trong cùng transaction.
- Callback có cùng `(event_type, idempotency_key)` trả lại kết quả cũ.
- Sự kiện có idempotency key cũ nhưng payload khác trả `409 idempotency_conflict`.
- Khóa đề và tạo snapshot diễn ra trong cùng transaction `BEGIN IMMEDIATE`.

## 11. Bảo mật và lỗi

- Giáo viên chỉ truy cập tài nguyên thuộc sở hữu.
- Header thiếu trả `401`; role sai trả `403`; tài nguyên không thuộc sở hữu trả `404`.
- Callback token so sánh bằng hàm constant-time.
- Pydantic từ chối field thừa ở payload mutation.
- Giới hạn độ dài title, content, instructions, choice, rubric và số lượng phần tử.
- Không trả file path vật lý trong API.
- Không ghi shared secret vào log.
- Lỗi miền nghiệp vụ có dạng:

```json
{
  "error": {
    "code": "score_mismatch",
    "message": "Tổng điểm các câu phải bằng thang điểm của đề.",
    "details": {
      "expected": "10.00",
      "actual": "9.00"
    }
  }
}
```

## 12. Kiểm thử

### 12.1. API và quyền

- Header giáo viên bắt buộc.
- Giáo viên không xem/sửa đề của người khác.
- Tạo, liệt kê và xem đề.
- Optimistic locking trả conflict đúng.

### 12.2. Câu hỏi và rubric

- Snapshot câu ngân hàng.
- Thêm câu thủ công trắc nghiệm và tự luận.
- Topic bắt buộc cho câu thủ công.
- Không sửa topic câu ngân hàng.
- CRUD/reorder câu và rubric.
- Reorder từ chối danh sách thiếu, thừa hoặc trùng.

### 12.3. Validation và state machine

- Đề rỗng.
- Tổng điểm đề lệch.
- Choice/đáp án không hợp lệ.
- Rubric thiếu, lệch điểm hoặc thiếu topic.
- Chuyển trạng thái hợp lệ và không hợp lệ.
- Sửa ở `preparing_exam` trước callback đầu tiên.
- Khóa mọi mutation sau callback đầu tiên.
- Không thể tự đặt `done`.

### 12.4. Callback

- Token sai.
- Idempotency thành công.
- Idempotency key lặp với payload khác.
- Snapshot khóa được tạo đúng một lần.
- Tiến độ chưa đủ không chuyển trạng thái.
- Chỉ đủ bài đã chấm và có điểm mới chuyển `done`.

### 12.5. DOCX

Test mở DOCX thật bằng `python-docx` và xác nhận:

- Metadata đề.
- Thứ tự câu.
- Điểm câu.
- Choices và đáp án.
- Rubric, điểm rubric và topic tags.
- Hai style đều sinh file hợp lệ.
- Export gắn đúng `exam_version`.

### 12.6. Demo

- Route `/` trả HTML.
- Static assets tải được.
- Browser smoke test thực hiện luồng tạo đề, thêm câu, reorder, prepare và tải DOCX.

## 13. Cấu hình và vận hành local

Biến môi trường:

- `AURORA_EXAM_DB_PATH`
- `AURORA_EXAM_EXPORT_DIR`
- `AURORA_EXAM_INTERNAL_TOKEN`
- `AURORA_EXAM_DEMO_MODE`

README phải có:

- Yêu cầu Python.
- Lệnh cài dependency.
- Lệnh chạy Uvicorn.
- Lệnh chạy test.
- Lệnh chạy browser smoke test.
- Danh sách API chính.
- Mô tả callback tích hợp.

## 14. Tiêu chí hoàn thành

MVP hoàn thành khi:

1. Toàn bộ automated tests chạy xanh.
2. Demo chạy độc lập trong `create_exam_backend`.
3. Không có thay đổi trong `frontend`.
4. Giáo viên tạo được đề từ câu ngân hàng và câu thủ công.
5. Câu thủ công và từng ý barem gắn được topic.
6. Kéo-thả cập nhật thứ tự bền vững.
7. Validation ngăn phát đề không hợp lệ.
8. Đề sửa được ở `preparing_exam` trước bài nộp đầu tiên.
9. Callback đầu tiên khóa và snapshot đề.
10. Chỉ callback chấm hoàn tất mới chuyển `done`.
11. DOCX tải được và chứa đúng đề, đáp án/barem theo lựa chọn.
12. README mô tả đầy đủ cách chạy và contract tích hợp.

