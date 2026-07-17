# Question Tagging Backend

Backend FastAPI độc lập cho `Question_Tagging_Module`. Dữ liệu câu hỏi và Knowledge Graph hiện được seed vào SQLite để chạy demo; mapping và versioning sử dụng cùng schema dự kiến của module.

## Chạy

Từ thư mục gốc repository:

```powershell
python -m pip install -r backend/question_tagging/requirements.txt
python -m uvicorn backend.question_tagging.app.main:app --reload
```

Mở `http://127.0.0.1:8000/` để dùng HTML demo hoặc `http://127.0.0.1:8000/docs` để xem OpenAPI.

Database mặc định nằm tại `backend/question_tagging/data/question_tagging.db`. Có thể đổi đường dẫn:

```powershell
$env:AURORA_TAGGING_DB = "C:\temp\question-tagging.db"
python -m uvicorn backend.question_tagging.app.main:app
```

## Kiểm thử

```powershell
python -m pytest backend/question_tagging/tests -v
```

Mỗi test dùng một SQLite database riêng và không thay đổi database demo.

Browser smoke test kiểm tra thao tác thật trên Chromium:

```powershell
python -m pip install -r backend/question_tagging/requirements-dev.txt
python -m playwright install chromium
python -m uvicorn backend.question_tagging.app.main:app --host 127.0.0.1 --port 8123
```

Trong terminal thứ hai:

```powershell
python backend/question_tagging/tests/browser_smoke.py
```

## API chính

- `GET /api/questions`
- `GET /api/questions/{question_id}/tagging-context`
- `PUT /api/questions/{question_id}/topics`
- `PUT /api/questions/{question_id}/rubric-items/{rubric_item_id}/topics`
- `GET /api/questions/{question_id}/effective-topics`

Payload cho hai thao tác `PUT`:

```json
{
  "topic_ids": ["topic-equations", "topic-fractions"],
  "expected_version": 1,
  "updated_by": "teacher-demo"
}
```

Nếu `expected_version` đã cũ, API trả `409 version_conflict` và kèm `latest_context`.
