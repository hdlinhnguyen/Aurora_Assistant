# evals — Eval harness cho Socratic Chat

Bản thiết kế đầy đủ + trạng thái triển khai: [`docs/eval-socratic-chat.md`](../docs/eval-socratic-chat.md).

## Chạy nhanh

```bash
cd evals
uv sync
# Backend Go phải đang chạy ở http://localhost:8081 với OPENAI_API_KEY thật
# (không phải mock mode — harness sẽ fail-fast nếu phát hiện mock mode).
uv run eval-static
```

Chạy riêng từng track:

```bash
uv run eval-static --tracks c        # chỉ Track C (is_correct_step, rẻ nhất)
uv run eval-static --tracks a,d      # hard-leak + safety layer 2
uv run eval-static --out report.json # ghi báo cáo JSON
```

Unit test thuần (không cần backend):

```bash
uv run pytest tests/test_scoring.py -v
```

> Trên Windows, nếu gặp `UnicodeEncodeError` khi in tiếng Việt ra console (terminal
> đang dùng codepage cp1252 thay vì UTF-8), chạy với `PYTHONUTF8=1 uv run eval-static`
> hoặc `chcp 65001` trước.

## Tài khoản dùng để chạy eval

Harness tái dùng 2 tài khoản demo được seed sẵn khi backend khởi động
(`backend/cmd/server/main.go`): `student@aurora.edu.vn` (chat) và
`teacher@aurora.edu.vn` (đọc `guardrail_events` cho Track D). Override qua
env nếu cần: `AURORA_EVAL_STUDENT_EMAIL`, `AURORA_EVAL_STUDENT_PASSWORD`,
`AURORA_EVAL_TEACHER_EMAIL`, `AURORA_EVAL_TEACHER_PASSWORD`, `AURORA_BASE_URL`.

## Đã triển khai vs còn thiếu

Xem bảng đầy đủ trong `docs/eval-socratic-chat.md` mục "Trạng thái triển
khai". Tóm tắt: Track C, Track A (tier 1 — regex leak, chưa có LLM-judge cho
leak diễn giải), Track D, Track B đã chạy được qua HTTP thật. Simulated
student (persona multi-turn do LLM đóng vai), LLM-judge, và calibration với
giáo viên (mục 7-8 trong thiết kế gốc) **chưa triển khai** — cần thêm hạ tầng
judge model + dữ liệu chấm tay từ giáo viên.
