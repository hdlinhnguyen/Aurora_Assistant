# learning-path — Lộ trình học cá nhân hóa (LangGraph Python)

Hiện thực hóa spec [`docs/superpowers/specs/2026-07-17-personalized-learning-path-design.md`](../docs/superpowers/specs/2026-07-17-personalized-learning-path-design.md)
và addendum [`2026-07-17-langgraph-hint-ladder-addendum.md`](../docs/superpowers/specs/2026-07-17-langgraph-hint-ladder-addendum.md).

**Module độc lập** — không thuộc golden path demo Chắc Gốc (`knowledge-graph/`);
chỉ đọc `knowledge-graph/data/graph.json` qua adapter làm nguồn dữ liệu.
**Không LLM**: toàn bộ pipeline là thống kê/thuật toán tất định, chạy offline,
test không cần mạng/API key.

## Pipeline (LangGraph StateGraph)

```text
ingest_evidence → update_mastery_bkt
    → [Send fan-out theo học sinh] process_student (diagnose → rank → plan)
    → [fan-in] compute_class_insight
    → await_teacher_approval        ← interrupt() chờ giáo viên duyệt (Draft → Approved)
    → apply_overrides_and_finalize → END
```

| File | Spec | Nội dung |
| --- | --- | --- |
| `evidence.py` | mục 4.1, 5 | Chuẩn hóa evidence giấy/quiz, evidence_weight (hint ×0.70, làm lại ×0.80, recency decay), dedup idempotent |
| `bkt.py` | mục 4.2, 6, 7 | Weighted/soft-evidence BKT + confidence (sufficiency × certainty × consistency), phân loại 5 trạng thái |
| `diagnosis.py` | mục 4.3, 9 | Reverse traversal, kiểm DAG, gap_score |
| `ranking.py` | mục 4.5, 9 | Root cause = điểm đứt sớm nhất có bằng chứng; uncertain → cần chẩn đoán thêm |
| `planner.py` | mục 4.6, 10, 11 | Remediation subgraph, knapsack giữ closure khi thiếu giờ, topo sort |
| `hints.py` | addendum mục 3 | Thang gợi ý 3 bậc có trần (Socratic → first-principles YCCĐ → ví dụ mẫu), quá trần → escalation về Path Planner |
| `class_insight.py` | mục 4.7, 13 | Gap toàn lớp (ngưỡng 40%/15%), nhóm theo root-cause, help_priority |
| `graph.py` | mục 14 | Lắp StateGraph + checkpointer + interrupt |
| `api.py` | — | FastAPI mỏng cho team TS |

## Chạy

```bash
uv sync                                  # cài deps
uv run pytest                            # 84 test, offline hoàn toàn
uv run uvicorn learning_path.api:app     # API server
```

Endpoint:

- `POST /learning-path` — tạo lộ trình: chạy pipeline tới interrupt, trả Draft + insight lớp
- `POST /learning-path/{thread_id}/approve` — giáo viên duyệt → Approved
- `POST /learning-path/{thread_id}/evidence` — nộp evidence mới (học sinh làm xong bước/bài mới) → re-plan cùng thread, version tăng, bản Draft mới chờ duyệt lại
- `POST /hints` — thang gợi ý 3 bậc (`topic_id`, `press_count`, `chosen_misconception?`)

Đặt `LEARNING_PATH_DB=lp.sqlite` để phiên duyệt sống qua restart server (mặc định in-memory).
Lưu ý Windows: đặt `PYTHONIOENCODING=utf-8` nếu in JSON tiếng Việt ra console.

## Điểm hiệu chỉnh so với số minh họa trong spec

- `BKTParams.p_t = 0.1` (spec không định giá trị): p_t tạo "sàn" mastery ≈ p_t; 0.2 làm sàn quá cao khiến `confirmed_gap` gần như bất khả.
- `confidence_threshold = 0.40` (spec minh họa 0.70): với công thức certainty entropy chuẩn hóa, 0.70 không thể đạt ngay cả khi 8/8 câu sai sạch — đúng tinh thần "ngưỡng phải cấu hình được theo môn và khối" (mục 7.4). Cả hai đều nằm trong config, đổi được không cần sửa code.

## Ngoài phạm vi v1 (đã chừa seam)

LLM diễn giải (`diagnosis_summary` văn tự nhiên, hint polish — theo pattern
pre-generate rồi verifier rồi fallback), ILP thay knapsack heuristic,
Deep Knowledge Tracing, tự học tham số BKT.
