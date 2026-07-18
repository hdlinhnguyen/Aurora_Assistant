# Handwritten OCR and Rubric Mapping Backend

Backend FastAPI độc lập cho việc chấm bài theo barem. Giảng viên chọn đề thi,
học sinh và đánh dấu các ý đạt được cho từng câu; mỗi ý có `max_points` và demo
hiển thị tổng điểm đã xác nhận. Luồng thủ công không yêu cầu upload. OCR + Qwen
là tùy chọn hỗ trợ và mọi kết quả vẫn phải qua teacher review.

## Chạy local

```powershell
cd Real_exam_scoring_backend
python -m pip install -e ".[test]"
python -m uvicorn app.main:app --reload
```

Mở:

- Demo: `http://127.0.0.1:8000/demo`
- OpenAPI: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health`

Demo tự thêm hai header `X-Teacher-Id` và `X-Role`. API client khác phải gửi hai header này cho mọi route nghiệp vụ, đồng thời gửi `Idempotency-Key` cho các lệnh tạo submission, chạy job và phê duyệt.

`POST /api/submissions` mặc định `processing_mode=full_manual` khi client không truyền trường này. Chỉ truyền `processing_mode=ai_assisted` khi giảng viên chủ động bật OCR + Qwen.

Mỗi phần tử `rubric_items` nhận `max_points` trong khoảng `0..1000` (mặc định
`0`). Ở chế độ thủ công, checkbox được chọn lưu trạng thái `correct`; checkbox
không được chọn lưu `incorrect`. Chỉ nhánh `ai_assisted` yêu cầu file.

Hai header trên là cơ chế định danh tối thiểu cho demo độc lập. Khi tích hợp production, gateway/SSO phải xác thực danh tính và chỉ chuyển các header đã được ký hoặc tin cậy vào service; không nhận trực tiếp header do trình duyệt tự khai báo.

## Live providers

Phần này chỉ cần khi bật tùy chọn OCR + Qwen. Sao chép `.env.example` thành `.env` hoặc export các biến tương ứng, đặt `PROVIDER_MODE=live`, rồi cấu hình:

- `DATALAB_API_KEY`: API key chỉ lưu ở server. Client dùng Document Convert API `/api/v1/convert` với `output_format=json`.
- `QWEN_BASE_URL`: base URL OpenAI-compatible, kết thúc ở `/v1`.
- `QWEN_API_KEY`: tùy chọn nếu endpoint nội bộ yêu cầu bearer token.
- `QWEN_MODEL`: mặc định `qwen-8b`.

Không có secret nào được trả về response hoặc ghi vào raw OCR audit file.

## Kiểm thử

```powershell
cd Real_exam_scoring_backend
python -m pytest -q
python -m compileall -q app tests
```

Test chỉ dùng provider giả lập, không cần Datalab/Qwen thật.

Kiểm tra đầy đủ cho developer:

```powershell
python -m pip install -e ".[dev]"
python -m playwright install chromium
python -m ruff check app tests
python -m ruff format --check app tests
python -m pytest -q --cov=app --cov-fail-under=75
```

Upload ảnh trả thêm `quality_warnings` cho ảnh mờ, độ phân giải thấp, sai
hướng hoặc có nét chạm biên. Submission detail cảnh báo khoảng trống số trang.
Đây là heuristic hỗ trợ giảng viên; giảng viên vẫn có quyền tiếp tục hoặc chụp
lại ảnh.

## API chính

- `POST /api/submissions`
- `POST /api/submissions/{id}/files`
- `GET /api/files/{file_id}/content`
- `POST /api/submissions/{id}/uploads`
- `PUT /api/uploads/{id}/parts/{part_number}`
- `POST /api/uploads/{id}/complete`
- `POST /api/submissions/{id}/process`
- `POST /api/submissions/{id}/mapping-jobs`
- `PUT /api/submissions/{id}/reviews/{rubric_item_id}`
- `POST /api/submissions/{id}/approve`
- `GET /api/submissions/{id}/audit`

SQLite và local storage phục vụ demo. Các lớp `Database`, `LocalStorage`, `OCRProvider` và `MappingProvider` là ranh giới để thay bằng database, object storage và queue production sau này.
