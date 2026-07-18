# Question Tagging Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng FastAPI backend cho Question Tagging Module cùng HTML demo tự chứa.

**Architecture:** FastAPI gọi một service nghiệp vụ độc lập; service thao tác SQLite qua repository và transaction. Các bảng nguồn được seed để demo nhưng nằm sau repository boundary để thay bằng adapter hệ thống thật.

**Tech Stack:** Python 3.13, FastAPI, Pydantic 2, SQLite, pytest, HTTPX

## Global Constraints

- Tagging hoàn toàn thủ công, không AI và không mở rộng theo quan hệ Knowledge Graph.
- Cho phép topic khác khối nhưng bắt buộc cùng môn.
- Empty topic set hợp lệ.
- Mọi update dùng optimistic concurrency bằng `expected_version`.
- Không sửa frontend hiện tại.

---

### Task 1: Hợp đồng API và schema database

**Files:**
- Create: `backend/question_tagging/app/database.py`
- Create: `backend/question_tagging/app/schemas.py`
- Create: `backend/question_tagging/tests/conftest.py`
- Test: `backend/question_tagging/tests/test_tagging_api.py`

**Interfaces:**
- Produces: `Database`, request/response Pydantic models, test client và database tạm.

- [ ] **Step 1: Viết test thất bại**

Thêm test `GET /health`, `GET /api/questions` và tagging context có `version`, `available_topics`, `rubric_items`.

- [ ] **Step 2: Xác nhận RED**

Run: `python -m pytest backend/question_tagging/tests/test_tagging_api.py -v`
Expected: FAIL vì package `backend.question_tagging.app` chưa tồn tại.

- [ ] **Step 3: Tạo schema và migration tối thiểu**

Tạo các bảng `questions`, `rubric_items`, `topics`, hai bảng mapping và `question_tagging_states`, với foreign key và unique/composite primary key.

- [ ] **Step 4: Xác nhận GREEN**

Run: `python -m pytest backend/question_tagging/tests/test_tagging_api.py -v`
Expected: các test context/health đầu tiên PASS.

### Task 2: Tagging service và validation

**Files:**
- Create: `backend/question_tagging/app/repositories.py`
- Create: `backend/question_tagging/app/service.py`
- Modify: `backend/question_tagging/tests/test_tagging_api.py`

**Interfaces:**
- Produces: `TaggingService.get_context`, `set_question_topics`, `set_rubric_item_topics`, `get_effective_topics`.

- [ ] **Step 1: Viết test thất bại**

Thêm test multiple topics, cross-grade same-subject, cross-subject rejection, unknown topic, empty set và rubric ownership.

- [ ] **Step 2: Xác nhận RED**

Run: `python -m pytest backend/question_tagging/tests/test_tagging_api.py -v`
Expected: FAIL ở các PUT endpoint chưa có.

- [ ] **Step 3: Cài đặt tối thiểu**

Validate topic IDs, replace mappings trong transaction và trả context mới.

- [ ] **Step 4: Xác nhận GREEN**

Run: `python -m pytest backend/question_tagging/tests/test_tagging_api.py -v`
Expected: validation tests PASS.

### Task 3: Aggregation và optimistic concurrency

**Files:**
- Modify: `backend/question_tagging/app/service.py`
- Modify: `backend/question_tagging/app/repositories.py`
- Modify: `backend/question_tagging/tests/test_tagging_api.py`

**Interfaces:**
- Produces: effective topic union không trùng và lỗi `VersionConflict`.

- [ ] **Step 1: Viết test thất bại**

Thêm test union direct/rubric, xóa rubric vẫn giữ direct tag, xóa nguồn cuối làm topic biến mất và stale version không ghi đè.

- [ ] **Step 2: Xác nhận RED**

Run: `python -m pytest backend/question_tagging/tests/test_tagging_api.py -v`
Expected: FAIL ở aggregation/concurrency behavior.

- [ ] **Step 3: Cài đặt tối thiểu**

Tính union từ mappings gốc, khóa ghi bằng `BEGIN IMMEDIATE`, so sánh và tăng version trong cùng transaction.

- [ ] **Step 4: Xác nhận GREEN**

Run: `python -m pytest backend/question_tagging/tests/test_tagging_api.py -v`
Expected: aggregation/concurrency tests PASS.

### Task 4: HTTP routes, seed và HTML demo

**Files:**
- Create: `backend/question_tagging/app/main.py`
- Create: `backend/question_tagging/app/seed.py`
- Create: `backend/question_tagging/app/demo.html`
- Create: `backend/question_tagging/app/__init__.py`
- Create: `backend/question_tagging/requirements.txt`
- Create: `backend/question_tagging/README.md`
- Modify: `backend/question_tagging/tests/test_tagging_api.py`

**Interfaces:**
- Produces: `backend.question_tagging.app.main:create_app`, REST endpoints và trang `/`.

- [ ] **Step 1: Viết test thất bại**

Thêm test status/error payloads và HTML chứa client controls.

- [ ] **Step 2: Xác nhận RED**

Run: `python -m pytest backend/question_tagging/tests/test_tagging_api.py -v`
Expected: FAIL ở route/demo chưa có.

- [ ] **Step 3: Cài đặt tối thiểu**

Ánh xạ domain errors sang 404/409/422, seed dữ liệu mẫu idempotent và thêm trang demo gọi REST.

- [ ] **Step 4: Xác nhận GREEN**

Run: `python -m pytest backend/question_tagging/tests -v`
Expected: toàn bộ test PASS.

### Task 5: Xác minh đầu-cuối

**Files:**
- Modify: `backend/question_tagging/README.md`

- [ ] **Step 1: Kiểm tra compile**

Run: `python -m compileall -q backend/question_tagging/app backend/question_tagging/tests`
Expected: exit 0.

- [ ] **Step 2: Chạy toàn bộ test**

Run: `python -m pytest backend/question_tagging/tests -v`
Expected: 0 failed.

- [ ] **Step 3: Smoke test server**

Run server bằng Uvicorn với database tạm, gọi `/health`, context, hai PUT routes và `/`.
Expected: HTTP 200 cho luồng hợp lệ và effective topics phản ánh đúng union.
