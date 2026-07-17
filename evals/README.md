# evals — Eval harness cho Socratic Chat & Feynman Clarity Score

Bản thiết kế đầy đủ + trạng thái triển khai: [`docs/eval-socratic-chat.md`](../docs/eval-socratic-chat.md)
(Track A/B/C/D — mode socratic) và
[`docs/superpowers/specs/2026-07-18-feynman-clarity-meta-eval.md`](../docs/superpowers/specs/2026-07-18-feynman-clarity-meta-eval.md)
(Track M/G — mode feynman, meta-eval của `feynman_score`).

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
uv run eval-static --tracks m,g      # ladders + gaming cho feynman_score (mode feynman)
uv run eval-static --out report.json # ghi báo cáo JSON
```

Track M (monotonicity ladders) và Track G (gaming/exploit) chấm `feynman_score`
ở mode `feynman` — không nằm trong track mặc định (`a,b,c,d`) vì tốn nhiều lượt
gọi API hơn (mỗi nấc ladder / mỗi case gaming là 1 session riêng); chạy rõ ràng
qua `--tracks m,g` hoặc `--tracks a,b,c,d,m,g`. Gate đề xuất: 100% ladder đúng
thứ tự giảm đơn điệu, exploit success rate ≤ 5% (xem `apply_gates` trong
`run_static.py`).

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

**feynman_score meta-eval** (spec riêng: `2026-07-18-feynman-clarity-meta-eval.md`):
Track M (ladders, mục 6) và Track G (gaming, mục 5) đã chạy được qua HTTP
thật — đây là mục #1 trong thứ tự triển khai đề xuất (mục 9), không cần chấm
tay. Track R (repeat/paraphrase/model matrix) và Track D-riêng-cho-feynman
(rote vs real, contradiction rate) chỉ tốn compute, không cần giáo viên,
nhưng **chưa triển khai**. Track V và Track A **cần giáo viên** — xem mục
dưới.

## Phần cần giáo viên (chưa tự động hoá được)

Những việc dưới đây **không thể chạy chỉ bằng harness** — cần con người ra
quyết định hoặc chấm tay, nên vẫn đang chặn ở trạng thái "chưa triển khai":

- **Bộ chuẩn giáo viên cho Track V** (mục 2 của spec): ~100-150 lời giải
  thích trải phổ chất lượng, cần **2-3 giáo viên chấm độc lập** trên rubric
  phân rã (4 boolean: đúng kiến thức? / từ ngữ lớp 1? / tự diễn đạt hay đọc
  thuộc? / có ví dụ cụ thể?) + 1 điểm holistic 0-100.
- **Inter-rater agreement (ICC/kappa) trước khi tin bất kỳ số nào khác** —
  bước 0 bắt buộc của Track V. Nếu giáo viên với giáo viên không đồng thuận,
  nghĩa là construct "clarity" chưa định nghĩa đủ rõ; phải sửa rubric (cùng
  giáo viên) trước khi so sánh với model.
- **Spearman ρ / MAE / hồi quy confound so với điểm giáo viên** — cần bộ
  điểm giáo viên ở trên làm ground truth mới tính được.
- **Track A (aggregate/dashboard, mục 7)** — "bao nhiêu lượt thì điểm ổn
  định" và ngưỡng NULL-vs-0 cho schema cần **giáo viên xác nhận** ngưỡng nào
  là hợp lý để hiển thị lên dashboard (tránh gắn nhãn "học vẹt" oan cho học
  sinh mới chat vài câu) — đây là quyết định sản phẩm, không phải con số kỹ
  thuật thuần.
- **A/B kiến trúc (mục 8)** — sau khi có baseline từ 1-4, **giáo viên là
  người đọc kết quả và chọn biến thể thắng** dựa trên việc họ có diễn giải
  được lý do điểm thấp hay không, không chỉ dựa vào số liệu Track R/G/D.

Cho tới khi các mục trên có giáo viên tham gia, **Spearman ρ ≥ 0.7 so với
giáo viên** (gate đề xuất ở mục 9 của spec) không thể verify được — các gate
đang chạy tự động (ladder order, exploit rate, v.v.) chỉ là điều kiện cần,
chưa phải điều kiện đủ để tin điểm `feynman_score` phản ánh đúng clarity
thật.
