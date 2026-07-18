# Aurora Create Exam Backend

Backend FastAPI độc lập cho luồng giáo viên tạo đề, sắp xếp câu hỏi, gắn
topic/barem, chuẩn bị phát đề, khóa đề khi có bài nộp và hoàn tất sau khi module
chấm xác nhận mọi bài đã có điểm.

## Chức năng

- Chọn câu từ ngân hàng seed hoặc nhập câu thủ công.
- Câu thủ công có topic riêng nhưng không được ghi ngược vào ngân hàng.
- Trắc nghiệm một đáp án và tự luận có barem theo từng ý.
- Kéo-thả thứ tự trong trang demo.
- Chọn lại các đề đã lưu, sửa metadata/câu hỏi và cấu hình nội dung DOCX.
- Optimistic locking bằng `expected_version`.
- Trạng thái `drafting`, `preparing_exam`, `done`.
- DOCX `standard` hoặc `compact`; PDF nằm ngoài phạm vi MVP.
- Callback nội bộ idempotent cho module OCR/chấm.

## Yêu cầu và cài đặt

Python 3.11 trở lên:

```powershell
python -m pip install -r create_exam_backend/requirements-dev.txt
```

## Chạy

```powershell
python -m uvicorn create_exam_backend.app.main:app --reload
```

- Demo kéo-thả: `http://127.0.0.1:8000/`
- OpenAPI: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health`

## Cấu hình

| Biến | Mặc định |
|---|---|
| `AURORA_EXAM_DB_PATH` | `create_exam_backend/data/exams.db` |
| `AURORA_EXAM_EXPORT_DIR` | `create_exam_backend/data/exports` |
| `AURORA_EXAM_INTERNAL_TOKEN` | `change-me-for-production` |
| `AURORA_EXAM_DEMO_MODE` | `true` |

Đổi internal token trước khi dùng ngoài môi trường local.

## Kiểm thử

```powershell
python -m pytest create_exam_backend/tests -v
python -m ruff check create_exam_backend
python -m ruff format --check create_exam_backend
```

Browser smoke:

```powershell
python -m playwright install chromium
python -m uvicorn create_exam_backend.app.main:app --host 127.0.0.1 --port 8130
```

Trong terminal thứ hai:

```powershell
python create_exam_backend/tests/browser_smoke.py
```

## API chính

- `POST/GET /api/exams`
- `GET/PATCH /api/exams/{exam_id}`
- `GET /api/question-bank/questions`
- `GET /api/question-bank/questions/{question_id}`
- `GET /api/topics`
- `POST /api/exams/{exam_id}/questions/from-bank`
- `POST /api/exams/{exam_id}/questions/manual`
- `PATCH/DELETE /api/exams/{exam_id}/questions/{question_id}`
- `PUT /api/exams/{exam_id}/questions/reorder`
- Rubric CRUD và reorder dưới
  `/api/exams/{exam_id}/questions/{question_id}/rubric-items`
- `POST /api/exams/{exam_id}/validate`
- `POST /api/exams/{exam_id}/prepare`
- `POST /api/exams/{exam_id}/return-to-draft`
- `POST /api/exams/{exam_id}/exports/docx`
- `GET /api/exams/{exam_id}/exports`
- `GET /api/exams/{exam_id}/exports/{export_id}/download`
- `GET /api/exams/{exam_id}/audit`

Route giáo viên yêu cầu `X-Teacher-Id` và `X-Role: teacher`.

## Callback module chấm

Callback yêu cầu `X-Internal-Token` và `Idempotency-Key`. Gửi lại cùng key và
payload trả lại cùng kết quả; cùng key với payload khác trả conflict.

Khóa đề khi nhận bài đầu tiên:

```http
POST /internal/exams/{exam_id}/first-submission
X-Internal-Token: your-shared-secret
Idempotency-Key: first-submission-2026-001
Content-Type: application/json

{"total_submissions": 30}
```

Cập nhật hoặc hoàn tất chấm:

```http
POST /internal/exams/{exam_id}/grading-completed
X-Internal-Token: your-shared-secret
Idempotency-Key: grading-completed-2026-001
Content-Type: application/json

{
  "total_submissions": 30,
  "graded_submissions": 30,
  "scored_submissions": 30
}
```

Đề chỉ chuyển `done` khi `graded_submissions` và `scored_submissions` đều bằng
`total_submissions`. Tiến độ chấm không được giảm và tổng số bài phải khớp với
sự kiện khóa đề đầu tiên. Giáo viên không có API tự đặt `done`.

## Quy tắc phát đề

Trước `preparing_exam`, tổng điểm câu phải bằng `total_points`, trắc nghiệm phải
có đáp án hợp lệ, tự luận phải có barem đủ điểm và mỗi ý phải có topic. Giáo
viên vẫn sửa được khi đang chuẩn bị cho tới callback bài nộp đầu tiên. Callback
đó tạo snapshot bất biến dùng cho chấm và khóa mọi mutation nội dung.

## Chế độ demo

`GET /api/demo-config` chỉ trả trạng thái demo và teacher ID mẫu, không bao giờ
trả internal token. Hai route `/demo/exams/.../simulate-*` chỉ hoạt động khi
`AURORA_EXAM_DEMO_MODE=true`; hãy đặt biến này thành `false` ngoài môi trường
demo.
