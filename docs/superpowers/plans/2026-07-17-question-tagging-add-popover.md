# Question Tagging Add Popover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thay checkbox matrix bằng danh sách tag đã chọn và popover tìm kiếm để thêm tag tại từng câu hỏi/ý barem.

**Architecture:** Giữ nguyên FastAPI và REST contracts. `demo.html` quản lý một popover active theo scope, render selected tags từ context và gọi replacement PUT ngay khi add/remove; Playwright kiểm tra interaction thật.

**Tech Stack:** HTML, CSS, vanilla JavaScript, FastAPI API hiện có, Playwright

## Global Constraints

- Không sửa backend business logic hoặc frontend chính.
- Trigger `+ Thêm tag…` luôn là phần tử cuối trong từng scope.
- Popover chỉ hiển thị topic chưa chọn và có tìm kiếm.
- Add/remove tự lưu với `expected_version` hiện tại.
- Giữ DOM escaping, version-conflict handling và keyboard accessibility.

---

### Task 1: Browser regression contract

**Files:**
- Modify: `backend/question_tagging/tests/browser_smoke.py`

**Interfaces:**
- Consumes: demo tại `http://127.0.0.1:8123`.
- Produces: smoke test cho add trigger, searchable popover, auto-save, remove và rubric scope.

- [ ] **Step 1: Viết test theo interaction mới**

Test phải tìm `[data-add-scope="direct"]`, click, nhập `Phân số` vào `[data-tag-search]`, click `[data-pick-topic="topic-fractions"]` và chờ version tăng mà không bấm nút Save. Lặp lại với `r-essay-1`, xác nhận trigger vẫn là dòng cuối và tag xuất hiện trong effective topics.

- [ ] **Step 2: Xác nhận RED**

Run: `python backend/question_tagging/tests/browser_smoke.py` với server hiện tại.
Expected: FAIL vì selector add-popover chưa tồn tại.

### Task 2: Selected list và anchored popover

**Files:**
- Modify: `backend/question_tagging/app/demo.html`

**Interfaces:**
- Produces: `openTagPicker(scope, trigger)`, `closeTagPicker()`, `updateScope(scope, topicIds)` và DOM selectors từ Task 1.

- [ ] **Step 1: Thay checkbox matrix bằng selected rows**

Render mỗi tag đã chọn thành `.selected-tag` với tên, khối và button `[data-remove-topic]`; render button `[data-add-scope]` sau tất cả selected rows.

- [ ] **Step 2: Thêm popover tìm kiếm**

Popover dùng `role="dialog"`, input `[data-tag-search]`, danh sách button `[data-pick-topic]`; lọc theo tên/khối và loại topic đã chọn.

- [ ] **Step 3: Auto-save add/remove**

Khi pick/remove, tạo topic set mới và gọi PUT theo scope với version hiện tại. Trong lúc request, disable action; sau success cập nhật context, render lại và thông báo version.

- [ ] **Step 4: Keyboard và click-outside**

Tự focus search, Escape đóng, click ngoài đóng, trigger có `aria-expanded`.

### Task 3: Verification và demo restart

**Files:**
- Verify: `backend/question_tagging/tests/test_tagging_api.py`
- Verify: `backend/question_tagging/tests/browser_smoke.py`

- [ ] **Step 1: Chạy backend suite**

Run: `python -m pytest backend/question_tagging/tests -q -p no:cacheprovider -W error`
Expected: toàn bộ tests PASS.

- [ ] **Step 2: Chạy clean Playwright smoke**

Run Uvicorn trên database tạm và chạy `browser_smoke.py`.
Expected: add/remove trực tiếp và rubric đều PASS, không console error.

- [ ] **Step 3: Restart port 8009**

Dừng đúng Uvicorn Question Tagging đang giữ port 8009, khởi động lại module và xác nhận `/health` cùng `/` trả HTTP 200.
