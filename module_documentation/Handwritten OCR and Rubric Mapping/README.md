# Tài liệu thiết kế Handwritten OCR and Rubric Mapping

## 1. Mục tiêu

Module `Handwritten OCR and Rubric Mapping` giúp giảng viên đối chiếu bài làm viết tay của học sinh với từng ý nhỏ trong barem. Giảng viên thực hiện thủ công theo mặc định và có thể chủ động bật OCR + Qwen để nhận gợi ý ban đầu.

Module gồm:

- Luồng thủ công mặc định để giảng viên chọn đề thi, học sinh và đánh dấu các ý barem theo từng câu mà không cần upload.
- API OCR của Datalab.to và Qwen 8B self-host như một tùy chọn hỗ trợ nhận diện, đề xuất ánh xạ.
- Bước giảng viên duyệt bắt buộc để tạo kết quả cuối cùng, kể cả khi dùng hỗ trợ AI.

Module cộng điểm một cách xác định từ các checkbox do giảng viên xác nhận; AI không tự quyết định điểm. Module không chẩn đoán lỗ hổng kiến thức. Topic tag đã được giảng viên gán cho từng ý barem từ module quản lý/tagging câu hỏi; module này chỉ kế thừa các tag đó.

## 2. Phạm vi trách nhiệm

### 2.1. Trong phạm vi

- Nhận ảnh chụp từng trang, tập ảnh chụp liên tục và PDF nhiều trang khi giảng viên bật tùy chọn OCR + Qwen.
- Cho giảng viên chọn thủ công lớp, học sinh, bài kiểm tra và câu hỏi tương ứng.
- Kiểm tra chất lượng ảnh cơ bản trước khi gửi OCR.
- Tối ưu upload cho mạng có băng thông thấp và kết nối không ổn định.
- Cho phép giảng viên làm hoàn toàn thủ công theo mặc định.
- Khi giảng viên bật tùy chọn hỗ trợ: gọi Datalab.to, chuẩn hóa OCR blocks và gọi Qwen 8B để đề xuất mapping.
- Hiển thị ảnh, vùng bằng chứng và barem để giảng viên duyệt.
- Cho phép giảng viên sửa mapping hoặc tự đánh dấu `đúng`, `sai`, `không làm`.
- Lưu version, lịch sử chỉnh sửa, phương thức xử lý và nguyên nhân fallback.

### 2.2. Ngoài phạm vi

- Tạo hoặc chỉnh sửa câu hỏi và barem gốc.
- Gán mới hoặc thay đổi topic tag của câu hỏi và barem.
- Tự động mở rộng topic theo Knowledge Graph.
- Tự động cho điểm dựa trên kết quả AI khi chưa có xác nhận của giảng viên.
- Chẩn đoán topic học sinh bị hổng.
- Cập nhật mastery hoặc tạo learning path.
- Xây dựng OCR model nội bộ hoặc cơ chế thay đổi nhiều OCR provider.

## 3. Các hệ thống liên quan

### 3.1. Question Tagging Module

Module này cung cấp `Assessment Template` đã được phê duyệt, gồm:

- Cấu trúc bài kiểm tra và câu hỏi.
- Nội dung câu hỏi gốc.
- Các ý nhỏ trong barem.
- Điểm tối đa của từng ý nếu hệ thống nguồn có lưu.
- Topic tag do giảng viên gán cho từng ý barem.
- Mapping giữa câu hỏi và các ý barem.

`Handwritten OCR and Rubric Mapping` chỉ đọc dữ liệu này. Topic tag không được Qwen tạo, sửa hoặc suy luận bổ sung.

### 3.2. Datalab.to OCR API

Backend gọi trực tiếp API của Datalab.to. API key chỉ được lưu phía server. Tích hợp phải hỗ trợ quy trình bất đồng bộ của nhà cung cấp: gửi tài liệu, lưu định danh yêu cầu, theo dõi kết quả và chuẩn hóa phản hồi.

Không xây `OCR Provider Adapter` đa nhà cung cấp trong phiên bản đầu. Nếu hợp đồng API của Datalab thay đổi, `Datalab OCR Client` là thành phần duy nhất cần cập nhật.

### 3.3. Qwen 8B self-host

Qwen nhận dữ liệu có cấu trúc, không nhận trách nhiệm OCR. Đầu vào gồm:

- Câu hỏi gốc.
- Danh sách ý barem và topic tag tương ứng.
- Các OCR block đã chuẩn hóa.
- Loại nội dung, số trang, thứ tự đọc và bounding box của từng block.

Qwen chỉ trả về JSON mapping theo schema quy định. Qwen không sinh giải thích tự do, không tạo topic tag và không tính điểm.

### 3.4. Module phía sau

Đầu ra gồm `Approved Rubric Mapping` và tổng điểm xác định từ `max_points` của các ý được giảng viên đánh dấu đạt. Module tạo mastery evidence phía sau có thể sử dụng kết quả này, nhưng việc đó không thuộc trách nhiệm của module hiện tại.

## 4. Kiến trúc logic

### 4.1. Submission Intake

Tiếp nhận bài làm và metadata do giảng viên chọn thủ công:

- `class_id`.
- `student_id`.
- `assessment_template_id`.
- `question_id` hoặc danh sách câu hỏi cần xử lý.
- Các ảnh hoặc PDF thuộc bài làm.

Submission Intake kiểm tra định dạng, số trang, checksum và quyền truy cập trước khi tạo job.

### 4.2. Upload Manager

Upload Manager chịu trách nhiệm:

- Nén ảnh có kiểm soát, không làm mất chi tiết công thức hoặc nét bút mảnh.
- Chia file lớn thành nhiều phần.
- Tiếp tục upload từ phần bị gián đoạn.
- Không tải lại phần đã thành công.
- Phát hiện file trùng bằng checksum.
- Lưu nháp metadata trong lúc mạng không ổn định.

### 4.3. Job Orchestrator

OCR và rubric mapping là hai job riêng:

```text
Submission
-> OCR Job
-> Normalized OCR Result
-> Mapping Job
-> Draft Rubric Mapping
-> Teacher Review
-> Approved Rubric Mapping
```

Việc tách job cho phép chạy lại mapping mà không gửi ảnh lên Datalab lần nữa.

### 4.4. Datalab OCR Client

Thành phần này:

- Gửi tài liệu đã upload tới Datalab.to.
- Lưu request ID của nhà cung cấp.
- Nhận hoặc truy vấn trạng thái xử lý.
- Lưu phản hồi thô để audit và tái chuẩn hóa khi cần.
- Phân loại lỗi có thể retry và lỗi không thể retry.

### 4.5. OCR Result Normalizer

Chuyển phản hồi của Datalab thành `OCRBlock` thống nhất. Normalizer không sửa nội dung theo barem và không suy luận đáp án.

### 4.6. Qwen Mapping Service

Mapping Service tạo prompt có cấu trúc, gọi Qwen 8B và kiểm tra JSON trả về. Kết quả bị từ chối nếu:

- Không đúng schema.
- Tham chiếu rubric item không tồn tại.
- Tham chiếu OCR block không tồn tại.
- Tự tạo topic tag mới.
- Thiếu kết quả cho một hoặc nhiều ý barem.

### 4.7. Teacher Review

Mọi kết quả đều phải qua giảng viên. Hệ thống không tự động phê duyệt dù confidence cao.

## 5. Các chế độ xử lý

### 5.1. Full manual — mặc định

Nếu request không truyền `processing_mode`, hệ thống dùng `full_manual`:

- Không tạo OCR job.
- Không tạo mapping job.
- Không yêu cầu ảnh/PDF.
- Giảng viên chọn đề thi hiện tại và học sinh.
- Hiển thị barem có checkbox và `max_points` cho từng câu.
- Checkbox được chọn lưu `đúng`; checkbox bỏ trống lưu `sai`.
- Tổng điểm bằng tổng `max_points` của các ý được chọn.

### 5.2. AI-assisted — tùy chọn hỗ trợ

Điều kiện:

- Giảng viên chủ động chọn dùng OCR + Qwen.
- OCR thành công.
- Qwen mapping thành công và trả đúng schema.

Hệ thống tạo bản nháp gồm vùng bằng chứng, `ocr_confidence` và `mapping_confidence`. Giảng viên xem lại và chọn trạng thái cuối cùng cho từng ý barem.

### 5.3. Partial fallback

Trường hợp chính:

- OCR thành công nhưng Qwen mapping thất bại.

Hệ thống giữ OCR blocks để hỗ trợ đọc bài, nhưng giảng viên tự đánh dấu từng ý barem. Nếu OCR thất bại sau khi đã retry có giới hạn, hệ thống chuyển sang xem ảnh gốc và làm thủ công.

Giảng viên cũng có thể chuyển từ AI-assisted sang manual tại bất kỳ thời điểm nào trước khi phê duyệt.

## 6. Luồng xử lý end-to-end

1. Giảng viên chọn bài kiểm tra hiện tại và học sinh.
2. Hệ thống mặc định mở luồng `Full manual` và hiển thị barem của mọi câu.
3. Giảng viên đánh dấu checkbox cho các ý học sinh đạt được.
4. Hệ thống lưu trạng thái từng ý, phê duyệt từng câu và cộng tổng điểm.
5. Nếu giảng viên chủ động bật `AI-assisted`, hệ thống mới yêu cầu ảnh/PDF.
6. Với `AI-assisted`, Upload Manager hoàn tất upload và tạo OCR Job.
7. Datalab OCR Client gửi tài liệu và theo dõi kết quả.
8. OCR Result Normalizer tạo danh sách OCR blocks.
9. Job Orchestrator tạo Mapping Job.
10. Qwen Mapping Service gửi câu hỏi, barem, topic tag và OCR blocks cho Qwen.
11. Hệ thống kiểm tra schema và tạo Draft Rubric Mapping.
12. Nếu OCR hoặc mapping thất bại, hệ thống chuyển sang manual review.
13. Giảng viên xem dữ liệu hỗ trợ và từng ý barem.
14. Giảng viên xác nhận `đúng`, `sai` hoặc `không làm` cho mọi ý.
15. Hệ thống lưu `Approved Rubric Mapping` cùng version và audit log.

## 7. Mô hình dữ liệu logic

### 7.1. Submission

```text
Submission
- submission_id
- class_id
- student_id
- assessment_template_id
- processing_mode
- status
- created_by
- created_at
- version
```

`processing_mode` nhận một trong các giá trị:

```text
ai_assisted
partial_fallback
full_manual
```

Mỗi `rubric_item` có `max_points` từ `0` đến `1000`; client cũ không truyền
trường này nhận mặc định `0`.

### 7.2. SubmissionFile

```text
SubmissionFile
- file_id
- submission_id
- page_number
- file_name
- media_type
- checksum
- storage_key
- upload_status
- image_quality_status
```

### 7.3. OCRJob

```text
OCRJob
- ocr_job_id
- submission_id
- provider
- provider_request_id
- status
- attempt_count
- raw_response_location
- failure_code
- created_at
- completed_at
```

`provider` của phiên bản đầu luôn là `datalab`.

### 7.4. OCRBlock

```text
OCRBlock
- block_id
- ocr_job_id
- page_number
- reading_order
- content
- content_type
- bounding_box
- ocr_confidence
```

`content_type` nhận một trong các giá trị ban đầu:

```text
text
math
table
figure
```

Nếu Datalab không trả confidence ở mức block cho một loại nội dung, trường này được để trống thay vì tự tạo số giả.

### 7.5. RubricMappingJob

```text
RubricMappingJob
- mapping_job_id
- submission_id
- ocr_job_id
- model_name
- prompt_version
- status
- attempt_count
- failure_code
- created_at
- completed_at
```

### 7.6. DraftRubricItemMapping

```text
DraftRubricItemMapping
- mapping_job_id
- rubric_item_id
- evidence_block_ids[]
- mapping_confidence
```

Một OCR block có thể là bằng chứng cho nhiều ý barem. Một ý barem có thể tham chiếu nhiều OCR block trên nhiều trang.

### 7.7. ApprovedRubricItemMapping

```text
ApprovedRubricItemMapping
- approved_mapping_id
- submission_id
- rubric_item_id
- status
- evidence_block_ids[]
- ocr_confidence
- mapping_confidence
- mapping_method
- approved_by
- approved_at
- version
```

`status` nhận một trong ba giá trị:

```text
correct
incorrect
unanswered
```

Giao diện tiếng Việt hiển thị tương ứng:

```text
đúng
sai
không làm
```

`mapping_method` nhận một trong các giá trị:

```text
ai_reviewed
manual_after_ocr
full_manual
```

### 7.8. ReviewAuditLog

```text
ReviewAuditLog
- audit_id
- submission_id
- rubric_item_id
- action
- previous_value
- new_value
- actor_id
- occurred_at
```

## 8. Hợp đồng đầu vào của Qwen

```json
{
  "question": {
    "question_id": "q1",
    "content": "Tính 1/2 + 1/4"
  },
  "rubric_items": [
    {
      "rubric_item_id": "r1",
      "description": "Quy đồng mẫu số",
      "topic_tags": ["fraction", "common_denominator"],
      "max_points": 1.0
    }
  ],
  "ocr_blocks": [
    {
      "block_id": "b1",
      "page_number": 1,
      "reading_order": 1,
      "content": "1/2 = 2/4",
      "content_type": "math",
      "bounding_box": [100, 200, 300, 250],
      "ocr_confidence": 0.91
    }
  ]
}
```

## 9. Hợp đồng đầu ra của Qwen

```json
{
  "rubric_mappings": [
    {
      "rubric_item_id": "r1",
      "evidence_block_ids": ["b1"],
      "mapping_confidence": 0.88
    }
  ]
}
```

Qwen không trả điểm, topic mới hoặc phần giải thích bằng ngôn ngữ tự nhiên. Trạng thái `đúng`, `sai`, `không làm` là kết quả cuối cùng do giảng viên xác nhận trên giao diện.

## 10. Quy tắc nghiệp vụ

1. Mọi submission phải được gắn thủ công với một học sinh và Assessment Template hợp lệ.
2. Topic tag chỉ được đọc từ barem đã phê duyệt.
3. Qwen không được tạo, xóa hoặc thay đổi topic tag.
4. Kết quả AI luôn là bản nháp.
5. Chỉ giảng viên có quyền tạo Approved Rubric Mapping.
6. Mọi ý barem phải có trạng thái `đúng`, `sai` hoặc `không làm` trước khi phê duyệt.
7. Module chỉ cộng `max_points` sau khi giảng viên xác nhận trạng thái; Qwen không được tự cho điểm.
8. OCR và mapping có confidence riêng; không gộp thành một confidence duy nhất.
9. Nếu provider không cung cấp OCR confidence thì lưu `null`, không nội suy.
10. Một job thành công không được thực thi lại do cùng một message được gửi lặp.
11. Chạy lại mapping phải tạo job/version mới và không ghi đè lịch sử cũ.
12. Giảng viên có thể chuyển sang manual trước khi kết quả được phê duyệt.
13. Kết quả đã phê duyệt khi sửa lại phải tạo version mới.

## 11. Trạng thái xử lý

### 11.1. Submission

```text
draft
uploading
ready
processing
awaiting_review
approved
failed
```

`failed` không phải trạng thái kết thúc bắt buộc. Submission có thể chuyển từ `failed` sang `awaiting_review` khi giảng viên chọn làm thủ công.

### 11.2. OCR Job và Mapping Job

```text
queued
processing
retrying
completed
failed
cancelled
```

Mỗi job có `idempotency_key`. Worker phải kiểm tra trạng thái hiện tại trước khi xử lý để tránh gọi Datalab hoặc Qwen hai lần ngoài ý muốn.

## 12. Xử lý băng thông thấp

- Nén ảnh phía client với ngưỡng chất lượng tối thiểu có cấu hình.
- Không giảm kích thước dưới mức làm mất nét bút, dấu tiếng Việt hoặc ký hiệu toán học.
- Upload theo phần và tiếp tục từ phần cuối đã xác nhận.
- Lưu checksum cho từng file và từng phần upload.
- Tải tuần tự khi kết nối yếu thay vì gửi đồng thời quá nhiều trang.
- Hiển thị tiến độ theo từng trang.
- Cho phép tạm dừng và tiếp tục upload.
- Lưu nháp thao tác review trên thiết bị rồi đồng bộ lại.
- Chỉ tải ảnh độ phân giải cao của trang đang được giảng viên xem.
- Dùng thumbnail cho danh sách trang và tải lười các trang còn lại.

## 13. Fallback và xử lý lỗi

### 13.1. Upload thất bại

- Retry phần upload bị lỗi, không gửi lại toàn bộ file.
- Giữ submission ở trạng thái nháp.
- Cho phép thay file nếu ảnh bị hỏng.

### 13.2. Ảnh không đạt chất lượng

- Cảnh báo ảnh mờ, bị cắt, thiếu trang hoặc sai hướng.
- Cho phép giảng viên chụp lại.
- Cho phép tiếp tục nếu giảng viên chấp nhận rủi ro.

### 13.3. Datalab thất bại

- Retry có giới hạn đối với timeout, rate limit và lỗi tạm thời.
- Không retry tự động vô hạn.
- Sau giới hạn retry, cho phép chạy lại thủ công hoặc chuyển full manual.
- Nếu OCR chỉ có kết quả một phần, đánh dấu rõ các trang thiếu; giảng viên quyết định chạy lại hoặc chuyển manual.

### 13.4. Qwen thất bại

- Mapping bị xem là thất bại khi timeout, JSON sai schema hoặc tham chiếu ID không hợp lệ.
- Giữ nguyên OCR result đã có.
- Chuyển sang `manual_after_ocr` để giảng viên dùng OCR blocks làm thông tin hỗ trợ.

### 13.5. Cả OCR và mapping không dùng được

- Hiển thị ảnh gốc và barem.
- Chuyển `processing_mode` sang `full_manual`.
- Lưu `fallback_reason = both_failed` hoặc lỗi gốc cụ thể.

### 13.6. Các lý do fallback

```text
ocr_failed
mapping_failed
both_failed
teacher_selected_manual
invalid_ocr_result
invalid_mapping_schema
```

## 14. Giao diện Teacher Review

Màn hình review gồm hai vùng chính:

- Ảnh/PDF bài làm ở bên trái.
- Danh sách các ý barem ở bên phải.

Hành vi bắt buộc:

- Chọn một ý barem sẽ tô nổi các OCR block được đề xuất.
- Hiển thị `ocr_confidence` và `mapping_confidence` riêng.
- Cho phép thêm hoặc bỏ vùng bằng chứng.
- Cho phép sửa nội dung OCR mà không thay đổi ảnh gốc.
- Cho phép chọn `đúng`, `sai`, `không làm` cho từng ý.
- Cho phép chuyển sang manual bất kỳ lúc nào.
- Tự lưu nháp khi giảng viên thao tác.
- Không bật nút phê duyệt khi còn ý barem chưa có trạng thái.
- Cho phép duyệt từng câu hoặc toàn bộ bài.
- Hiển thị rõ chế độ và lý do fallback.

## 15. Bảo mật và quyền riêng tư

- Datalab API key và thông tin Qwen endpoint chỉ tồn tại phía server.
- Dữ liệu gửi Datalab được giới hạn ở file cần OCR và metadata kỹ thuật tối thiểu.
- Không gửi tên học sinh, lớp hoặc topic tag cho Datalab nếu API không cần.
- Mọi kết nối tới Datalab và Qwen phải được mã hóa khi truyền.
- File gốc, phản hồi OCR và audit log tuân theo chính sách lưu trữ dữ liệu học sinh.
- Quyền xem và phê duyệt submission được kiểm tra theo lớp và vai trò giảng viên.
- Log kỹ thuật không ghi API key hoặc toàn bộ nội dung bài làm.

## 16. Quan sát và vận hành

Các chỉ số tối thiểu:

- Tỷ lệ upload thành công và số lần resume.
- Thời gian xử lý OCR theo trang và theo submission.
- Tỷ lệ OCR job retry/fail.
- Thời gian xử lý Qwen và tỷ lệ output sai schema.
- Tỷ lệ submission chuyển fallback.
- Tỷ lệ giảng viên sửa mapping AI.
- Thời gian trung bình để duyệt một bài.
- Tỷ lệ giảng viên chủ động bật tùy chọn OCR + Qwen.

Không dùng các chỉ số này để tự động chấm điểm hoặc kết luận năng lực học sinh.

## 17. Tiêu chí kiểm thử chấp nhận

### 17.1. Submission và upload

- Nhận được ảnh, PDF nhiều trang và tập ảnh chụp liên tục.
- Gắn đúng submission với lớp, học sinh, bài kiểm tra và câu hỏi đã chọn.
- Resume upload từ phần bị gián đoạn.
- Không tạo file hoặc submission trùng khi request được gửi lại.
- Cảnh báo ảnh mờ, thiếu trang, bị cắt hoặc sai hướng.

### 17.2. OCR

- Gọi Datalab đúng một lần cho cùng idempotency key.
- Chuẩn hóa được text, math, table, figure, thứ tự đọc và bounding box.
- Giữ `ocr_confidence` riêng và cho phép `null` nếu provider không cung cấp.
- Lưu phản hồi thô để audit.

### 17.3. Mapping

- Qwen nhận đủ câu hỏi, barem, topic tag và OCR blocks.
- Từ chối output sai schema hoặc tham chiếu ID không tồn tại.
- Không chấp nhận topic tag do Qwen tự tạo.
- Hỗ trợ nhiều block cho một ý và một block cho nhiều ý.
- Chạy lại mapping không yêu cầu chạy lại OCR.

### 17.4. Fallback

- OCR fail chuyển được sang full manual.
- Qwen fail giữ OCR result và chuyển `manual_after_ocr`.
- Cả hai fail vẫn cho giảng viên hoàn tất bài bằng ảnh gốc và barem.
- Giảng viên chọn manual ngay từ đầu thì không tạo OCR hoặc mapping job.
- Giảng viên chuyển từ AI-assisted sang manual khi đang review được.

### 17.5. Teacher Review

- Hiển thị đúng vùng bằng chứng của từng ý barem.
- Lưu được ba trạng thái `đúng`, `sai`, `không làm`.
- Không phê duyệt khi còn ý chưa có trạng thái.
- Mọi thay đổi được lưu trong audit log.
- Sửa kết quả đã phê duyệt tạo version mới.

### 17.6. Ranh giới module

- Không để OCR hoặc Qwen tự cho điểm.
- Không tạo hoặc sửa topic tag.
- Không chẩn đoán lỗ hổng kiến thức.
- Không cập nhật trực tiếp Core Mastery Module.

## 18. Phạm vi phiên bản đầu

Phiên bản đầu nên gồm:

- Gán thủ công submission với học sinh và bài kiểm tra.
- Upload ảnh/PDF có resume và checksum cho nhánh AI-assisted.
- Kiểm tra chất lượng ảnh cơ bản.
- Full manual là chế độ mặc định.
- Tích hợp Datalab.to, chuẩn hóa OCR blocks và Qwen 8B mapping bằng JSON schema cố định dưới dạng tùy chọn hỗ trợ.
- Hàng đợi riêng cho OCR và mapping khi tùy chọn hỗ trợ được bật.
- AI-assisted và partial fallback cho nhánh hỗ trợ.
- Teacher Review bắt buộc.
- Approved Rubric Mapping có version và audit log.

Chưa cần trong phiên bản đầu:

- Thay đổi nhiều OCR provider.
- Tự huấn luyện OCR handwriting model.
- Tự động phê duyệt theo confidence.
- Tự chấm điểm bằng AI hoặc tự tạo mastery evidence.

## 19. Quyết định thiết kế đã chốt

- Dùng pipeline bất đồng bộ có hàng đợi.
- Full manual là chế độ chính và là mặc định khi tạo submission.
- Full manual chọn đề thi và học sinh, không yêu cầu upload, chấm bằng checkbox barem theo từng câu.
- Lưu `max_points` và cộng tổng điểm từ các checkbox do giảng viên xác nhận.
- Datalab.to OCR và Qwen 8B self-host là tùy chọn hỗ trợ do giảng viên chủ động bật.
- Qwen nhận OCR có cấu trúc, câu hỏi gốc, barem và topic tag.
- Lưu riêng `ocr_confidence` và `mapping_confidence`.
- Giảng viên luôn duyệt kết quả cuối cùng.
- Trạng thái cuối của từng ý là `đúng`, `sai`, `không làm`.
- Nếu OCR hoặc Qwen thất bại, giảng viên có thể hoàn tất thủ công.
- Nếu không chọn tùy chọn hỗ trợ, hệ thống không tạo OCR job hoặc mapping job.
- Đầu ra dừng tại `Approved Rubric Mapping`.
- Module không để AI tự cho điểm và không chẩn đoán topic bị hổng.
