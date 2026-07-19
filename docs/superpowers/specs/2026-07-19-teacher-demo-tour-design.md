# Teacher Demo Tour Design

## Goal

Give teacher demo users a complete guided walkthrough of every teacher
dashboard tab, in the same order as the sidebar workflow.

## Sequence

1. Quản lý Lớp & Học sinh (`student-mgmt`)
2. Thiết kế Cây Kiến thức (`graph-designer`)
3. Ngân hàng Câu hỏi (`question-bank`)
4. Tạo đề kiểm tra (`exam-builder`)
5. Chấm bài kiểm tra (`exam-scoring`)
6. Báo cáo tiến độ học tập (`students`)
7. Lập lộ trình cá nhân (`learning-path`)
8. Giám sát Lớp học (`monitoring`)
9. An toàn học sinh (`guardrail`)

Each step targets the active teacher workspace with a `teacher-tab-*` selector,
switches to the corresponding tab before measuring the target, and scrolls the
workspace into view. Existing student tour steps remain unchanged.

## Constraints

- Reuse the existing `GuidedTour` and teacher tab state; no new auth flow.
- Teacher demo login uses the existing temporary demo marker and cleanup.
- Keep all existing teacher tab behavior and sidebar controls unchanged.
