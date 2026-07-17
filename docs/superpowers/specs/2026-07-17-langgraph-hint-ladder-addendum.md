# Addendum — Triển khai LangGraph Python + thang gợi ý cho module lộ trình học cá nhân hóa

> Bổ sung cho `2026-07-17-personalized-learning-path-design.md` (spec gốc, giữ nguyên không sửa).
> Ghi lại các quyết định đã chốt qua brainstorm ngày 17/7/2026 về cách hiện thực hóa spec và tính năng gợi ý ở khâu tự ôn tập.

## 1. Quyết định đã chốt

1. **Không LLM trong pipeline.** Toàn bộ pipeline (BKT, chẩn đoán gap, xếp hạng root-cause, tạo lộ trình, insight lớp) là thống kê/thuật toán tất định — đúng phạm vi phiên bản đầu của spec gốc (mục 17). LangGraph được dùng vì state machine + checkpointer + human-in-the-loop (interrupt chờ giáo viên duyệt), không phải để gọi LLM.
2. **BKT bổ sung song song, không thay thuật toán tạo lộ trình.** BKT chỉ sở hữu `mastery_probability`; chẩn đoán root-cause và tạo lộ trình dùng graph traversal + công thức tường minh (đúng mục 18 spec gốc).
3. **Module độc lập** (`learning-path/`), không ràng buộc tương thích ngược với Chắc Gốc (`knowledge-graph/`); nhưng có adapter đọc `knowledge-graph/data/graph.json` làm nguồn dữ liệu test thật (38 node, chuỗi L7→L6→L5→L4 đã kiểm chứng).
4. **Input/Output dùng nguyên hợp đồng dữ liệu của spec gốc**: `LearningPathRequest` (mục 8.2) → `PersonalizedLearningPath` + `PathStep` (mục 11) + `ClassLearningInsight` (mục 13.3).

## 2. Kiến trúc StateGraph

```text
ingest_evidence → update_mastery_bkt
      → [Send fan-out theo student_id] diagnose_gaps
              → (thiếu evidence → plan_diagnostics → kết thúc nhánh học sinh đó)
              → rank_root_causes → plan_path
      → [fan-in] compute_class_insight → create_draft_path
      → await_teacher_approval        ← interrupt() + checkpointer (Draft → Approved)
      → apply_overrides_and_finalize → END
```

- Mỗi node là hàm Python thuần, test độc lập được.
- `Send` API fan-out theo học sinh: 1 request giáo viên → N lộ trình + 1 bức tranh lớp.
- `interrupt()` tại `await_teacher_approval`: pipeline dừng giữ state qua checkpointer, giáo viên duyệt/override lúc nào cũng được, resume đúng chỗ dừng — khớp vòng đời `Draft → Approved → Active → …` (mục 11 spec gốc).
- Tái lập kế hoạch (mục 14): mỗi trigger là một lần invoke lại graph cùng `thread_id`, không loop trong một run.
- Ngoại lệ (mục 15: cycle, không đường tới mục tiêu, thiếu thời gian…) trả về trong state dưới dạng mã lỗi có cấu trúc, không raise xuyên graph.

## 3. Thang gợi ý 3 bậc ở khâu tự ôn tập (chốt sau phản biện ý tưởng Socratic)

Bối cảnh: nhóm đề xuất nút gợi ý dùng Socratic/first-principles — khi học sinh mắc ở node B thì gợi ý dựa trên kiến thức nền, không làm được thì đi xuống sâu hơn trong cây tiên quyết.

**Điểm giữ lại từ ý tưởng gốc:** hint ladder có cấu trúc (không phải chat tự do — học sinh "trả lời" bằng cách làm lại bài, không gõ text); gợi ý neo vào node thật của cây tiên quyết.

**Điểm sửa sau phản biện:** descent không giới hạn ("tìm đến hết, xuống sâu hơn") bị loại — nó tái hiện engine chẩn đoán bên trong hộp gợi ý, sai tầng kiến trúc. Học sinh đang ở bước B của lộ trình vì hệ thống đã kết luận nền của B ổn; nếu em cần gợi ý sâu liên tục thì đó là bằng chứng mô hình mastery sai → phải phát evidence để BKT hạ mastery và Path Planner sửa lộ trình, không phải gợi ý tiếp.

**Thiết kế chốt:**

| Bậc | Hình thức | Nội dung |
|---|---|---|
| 1 | Socratic nudge (câu hỏi gợi mở, không lộ phương pháp) | Bám quan niệm sai (`loSai`) của phương án vừa chọn nếu có |
| 2 | First-principles | Nguyên lý của node tiên quyết trực tiếp, xây từ định nghĩa gốc, neo theo YCCĐ |
| 3 | Bottom-out | Ví dụ mẫu tối giản của kỹ năng nền |
| Hết trần | Chuyển tầng | Phát evidence (`hint_factor` ×0.70 — đã có sẵn trong mục 5 spec gốc) + đề xuất Path Planner chèn/ưu tiên node nền |

- Mỗi lần bấm gợi ý = một evidence event (giảm `evidence_weight` theo `hint_factor`) → BKT cập nhật → dashboard giáo viên thấy "em X cần gợi ý nhiều ở node Y".
- Nội dung gợi ý v1 = template tất định từ YCCĐ (sinh theo node — 3 đoạn/node, không theo câu hỏi, tiết kiệm công rà); LLM diễn đạt lại là extension point (pre-generate + verifier + fallback), **không build ở v1**.
- Socratic đối thoại gõ tự do bị loại có chủ đích: cần mạng (phản bối cảnh vùng khó của đề), chấm text toán tự do bằng LLM không verify được, và mở lại tính năng "chat tự do" đã cắt trong SPEC Chắc Gốc.

## 4. Công nghệ

- Python ≥3.11, quản lý bằng `uv`. Deps: `langgraph`, `pydantic`, `networkx`, `pytest`; `fastapi` + `uvicorn` cho API mỏng (cầu nối cho phần còn lại của hệ thống viết TS).
- Checkpointer v1: `MemorySaver` (seam để thay SQLite khi cần bền vững).
- Toàn bộ test chạy không cần mạng, không cần API key.
