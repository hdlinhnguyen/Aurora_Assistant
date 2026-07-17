# Handwritten OCR and Rubric Mapping Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Viết bộ tài liệu thiết kế và sơ đồ Mermaid đầy đủ cho module Handwritten OCR and Rubric Mapping bằng tiếng Việt có dấu.

**Architecture:** Module dùng pipeline bất đồng bộ gồm tiếp nhận bài làm, upload tối ưu cho băng thông thấp, OCR qua Datalab.to, mapping qua Qwen 8B self-host và bước giảng viên duyệt bắt buộc. Khi OCR hoặc mapping thất bại, hoặc khi giảng viên chủ động chọn, hệ thống chuyển sang chế độ thủ công.

**Tech Stack:** Markdown, Mermaid, Datalab.to OCR API, Qwen 8B self-host, hàng đợi job bất đồng bộ.

---

### Task 1: Viết tài liệu thiết kế chính

**Files:**
- Create: `module_documentation/Handwritten OCR and Rubric Mapping/README.md`

- [x] **Step 1:** Viết mục tiêu, phạm vi và ranh giới trách nhiệm của module.
- [x] **Step 2:** Mô tả kiến trúc, các thành phần và luồng xử lý AI-assisted, partial fallback và full manual.
- [x] **Step 3:** Định nghĩa hợp đồng dữ liệu, trạng thái, quy tắc nghiệp vụ, xử lý lỗi và tiêu chí kiểm thử.
- [x] **Step 4:** Kiểm tra tài liệu không gán trách nhiệm chấm điểm hoặc chẩn đoán topic cho module.

### Task 2: Viết các sơ đồ Mermaid

**Files:**
- Modify: `module_documentation/Handwritten OCR and Rubric Mapping/Handwritten OCR and Rubric Mapping.mermaid`
- Modify: `module_documentation/Handwritten OCR and Rubric Mapping/Quan hệ giữa hai module.mermaid`
- Create: `module_documentation/Handwritten OCR and Rubric Mapping/02-xu-ly-bat-dong-bo.mermaid`
- Create: `module_documentation/Handwritten OCR and Rubric Mapping/03-fallback-va-teacher-review.mermaid`
- Create: `module_documentation/Handwritten OCR and Rubric Mapping/04-mo-hinh-du-lieu.mermaid`
- Create: `module_documentation/Handwritten OCR and Rubric Mapping/05-trang-thai-job.mermaid`

- [x] **Step 1:** Cập nhật sơ đồ tổng quan theo pipeline đã chốt.
- [x] **Step 2:** Cập nhật sơ đồ quan hệ để đầu ra dừng tại Approved Rubric Mapping.
- [x] **Step 3:** Vẽ luồng job OCR và mapping bất đồng bộ.
- [x] **Step 4:** Vẽ đầy đủ các nhánh fallback và lựa chọn manual ngay từ đầu.
- [x] **Step 5:** Vẽ mô hình dữ liệu logic và vòng đời trạng thái job.

### Task 3: Xác minh bộ tài liệu

**Files:**
- Verify: `module_documentation/Handwritten OCR and Rubric Mapping/*.md`
- Verify: `module_documentation/Handwritten OCR and Rubric Mapping/*.mermaid`

- [x] **Step 1:** Parse từng tệp Mermaid bằng Mermaid CLI; kết quả mong đợi là tất cả sơ đồ render thành công.
- [x] **Step 2:** Quét placeholder, chuỗi mojibake và các thuật ngữ ngoài phạm vi như tự chấm điểm hoặc tự chẩn đoán topic.
- [x] **Step 3:** Đối chiếu README với toàn bộ quyết định thiết kế đã được người dùng phê duyệt.
- [x] **Step 4:** Xem `git diff` để bảo đảm chỉ các tệp thuộc phạm vi được thay đổi.
