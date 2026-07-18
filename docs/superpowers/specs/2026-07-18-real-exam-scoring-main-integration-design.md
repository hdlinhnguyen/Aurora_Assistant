# Real Exam Scoring Main Backend and Frontend Integration Design

## 1. Mục tiêu

Tích hợp nghiệp vụ chấm bài kiểm tra từ `Real_exam_scoring_backend` vào hệ
thống Aurora chính:

- Runtime backend dùng Go, Fiber, GORM và PostgreSQL.
- Frontend dùng Next.js, React, TypeScript và bộ UI hiện có.
- Một bài chấm đại diện toàn bộ bài làm của một học sinh, không còn giới hạn
  một câu hỏi trên mỗi submission.
- Câu hỏi và barem lấy từ `ExamSnapshot` có purpose `grading_lock`.
- Giáo viên chấm hoàn toàn thủ công theo câu và từng ý barem.
- Điểm do server tính bằng fixed-point decimal, không nhận điểm tùy ý từ client.
- Giữ optimistic locking, idempotency, approval version và audit.
- Một grading batch chứa một hoặc nhiều học sinh và cập nhật tiến độ chấm của
  module tạo đề.

`Real_exam_scoring_backend` tiếp tục được giữ làm tài liệu tham chiếu và
regression oracle. FastAPI, SQLite và Python module này không còn là runtime
bắt buộc sau khi tích hợp.

Thiết kế dựa trên contract trong
`docs/superpowers/specs/2026-07-18-create-exam-main-integration-design.md` và
implementation plan
`docs/superpowers/plans/2026-07-18-create-exam-main-integration.md`. Phần
create-exam có thể đang được triển khai song song, nhưng tên miền, snapshot,
score type và state machine trong hai tài liệu này là dependency bắt buộc.

## 2. Phạm vi

### 2.1. Trong phạm vi

- Port nghiệp vụ chấm thủ công từ FastAPI/SQLite sang Go/Fiber/GORM/PostgreSQL.
- Chọn một đề ở trạng thái `preparing_exam`.
- Chọn một hoặc nhiều `User` có `role=student` để tạo grading batch.
- Khóa một `grading_lock` snapshot khi tạo batch.
- Tạo một `ScoringSubmission` cho toàn bộ bài của mỗi học sinh.
- Chấm trắc nghiệm theo `correct`, `incorrect` hoặc `unanswered`.
- Chấm tự luận theo từng `ExamRubricItem`.
- Tính điểm câu và tổng điểm trên server.
- Autosave từng thay đổi với optimistic locking.
- Duyệt bài, lưu approval snapshot bất biến và audit.
- Tạo revision cho bài đã duyệt mà không xóa kết quả chính thức trước đó.
- Hoàn tất batch và cập nhật grading progress của exam.
- Tab `Chấm bài kiểm tra` trong teacher dashboard.
- Automated tests backend, frontend và browser smoke test.

### 2.2. Ngoài phạm vi

- Không upload ảnh hoặc PDF bài làm.
- Không resumable upload, checksum hoặc kiểm tra chất lượng ảnh.
- Không Datalab OCR.
- Không Qwen mapping.
- Không OCR block, evidence block hoặc confidence.
- Không có `ai_assisted`, `partial_fallback` hoặc `full_manual` như các mode
  runtime; luồng tích hợp chỉ có chấm thủ công.
- Không xây dựng quản lý lớp hoặc enrollment. Giáo viên chọn trực tiếp các
  `User` có `role=student`.
- Không sửa câu hỏi, barem, topic hoặc tổng điểm của exam.
- Không tự động chẩn đoán lỗ hổng kiến thức hoặc cập nhật mastery.
- Không xóa `Real_exam_scoring_backend`.

## 3. So sánh hệ thống hiện tại

| Khía cạnh | Backend chính/create-exam | `Real_exam_scoring_backend` | Thiết kế tích hợp |
|---|---|---|---|
| Runtime | Go/Fiber | Python/FastAPI | Go/Fiber |
| Database | PostgreSQL/GORM | SQLite/raw SQL | PostgreSQL/GORM |
| ID | UUID | Text | UUID |
| Điểm | `numeric(7,2)` qua `model.Score` | SQLite `REAL`/Python `float` | `model.Score`, `numeric(7,2)` |
| Auth | JWT `sub` | `X-Teacher-Id`, `X-Role` | JWT `sub` và teacher middleware |
| Nguồn đề | Snapshot bất biến | Client gửi lại question/rubric | `grading_lock` snapshot |
| Submission | Toàn exam theo contract mới | Một câu hỏi | Toàn bài của một học sinh |
| Đồng thời | Optimistic locking | Version tập trung ở approval | Version trên mọi mutation |
| Audit | Transactional domain audit | Review audit | Transactional scoring audit |
| Idempotency | Canonical internal events | Create/process/approve keys | Create batch và approve keys |
| AI/OCR | Ngoài create-exam | Upload/OCR/Qwen pipeline | Không tích hợp |

### 3.1. Điểm mạnh của backend chính

- PostgreSQL, transaction và row locking phù hợp với nhiều giáo viên thao tác
  đồng thời.
- JWT cung cấp actor đáng tin cậy thay vì nhận identity từ browser header.
- `ExamSnapshot` cho phép chấm dựa trên một đề bất biến.
- `model.Score` tránh sai số của floating-point.
- `Node`, `Question`, `ExamQuestion` và `ExamRubricItem` là nguồn dữ liệu chung,
  không cần tạo ngân hàng dữ liệu thứ hai.

### 3.2. Điểm yếu cần xử lý trong backend chính

- Backend hiện tại chưa có domain scoring.
- Teacher handler/page đang lớn; scoring phải nằm trong package và component
  riêng.
- Backend hiện chưa có `Class`, vì vậy phiên bản đầu chỉ chọn student trực
  tiếp.
- Auth middleware xác thực JWT nhưng role authorization phải được enforce ở
  route scoring.

### 3.3. Điểm mạnh của module chấm hiện tại

- Có quy tắc review rõ ràng với ba trạng thái.
- Có idempotency, versioned approval và audit.
- Không cho phép approve khi kết quả chưa đầy đủ.
- Có test cho ownership, concurrency, retry và approval history.

### 3.4. Điểm yếu của module chấm hiện tại

- SQLite và local database không phù hợp làm nguồn dữ liệu thứ hai trong
  Aurora.
- `REAL`/`float` không phù hợp cho điểm cần tính chính xác.
- Header identity chỉ phù hợp demo.
- Client gửi lại question/rubric, tạo nguy cơ lệch khỏi đề đã khóa.
- Một submission chỉ chứa một câu, không đại diện toàn bộ bài kiểm tra.
- Phần lớn code và schema phục vụ OCR/Qwen, không còn cần thiết trong phạm vi
  đã chốt.

## 4. Lựa chọn kiến trúc

### 4.1. Phương án được chọn: port vào Go monolith

Thêm bounded domain `backend/internal/scoring` dùng database và auth của
backend chính. Domain này đọc exam snapshot qua interface nội bộ của
`backend/internal/exam`, không gọi FastAPI và không gọi HTTP callback nội bộ.

Ưu điểm:

- Một runtime, một database và một cơ chế xác thực.
- Có thể khóa exam, tạo batch và tạo submissions atomically.
- Không có bài toán đồng bộ snapshot qua network.
- Frontend chỉ dùng `apiFetch` với JWT hiện có.
- Loại bỏ vận hành Python service khi không còn OCR/Qwen.

Chi phí:

- Nghiệp vụ và test scoring phải được port sang Go.
- Contract tích hợp với `internal/exam` phải được giữ ổn định trong lúc
  create-exam đang được implement.

### 4.2. Phương án không chọn: giữ FastAPI microservice

Phương án này tái sử dụng code Python nhiều hơn nhưng vẫn phải thay SQLite,
auth header, float score, single-question submission và snapshot contract.
Nó còn thêm network retry và consistency giữa hai database nên không còn lợi
thế sau khi loại OCR/Qwen.

### 4.3. Phương án không chọn: Go data với Python scoring service

Không có tác vụ AI hoặc CPU-bound cần Python. Việc tách business logic chấm
thủ công thành network service chỉ thêm failure mode và không mang lại lợi ích
đủ lớn.

## 5. Kiến trúc backend

Các thành phần mới:

- `ScoringHandler`: bind request, lấy actor từ JWT và map domain error.
- `ScoringService`: ownership, batch creation, state machine, score
  calculation, approval, revision và exam progress orchestration.
- `ScoringRepository`: transaction, row locking và GORM queries.
- `ScoreCalculator`: pure functions tính điểm từ snapshot và result.
- `ExamGradingGateway`: interface nội bộ để khóa exam và hoàn tất grading.

Handler không chứa quy tắc tính điểm. Mọi mutation nhiều bảng chạy trong một
PostgreSQL transaction.

`ExamGradingGateway` phải hỗ trợ transaction hiện tại để các thao tác sau là
atomic:

1. Khóa exam và kiểm tra version.
2. Validate exam detail.
3. Tạo đúng một `grading_lock` snapshot.
4. Khởi tạo exam grading progress.
5. Tạo grading batch.
6. Tạo submissions và result rows.

Các HTTP callback của create-exam vẫn được giữ cho caller bên ngoài. Scoring
trong cùng monolith gọi domain interface trực tiếp, không loopback HTTP.

## 6. Mô hình dữ liệu

### 6.1. `GradingBatch`

- `ID uuid.UUID`
- `ExamID uuid.UUID`
- `ExamSnapshotID uuid.UUID`
- `CreatedBy uuid.UUID`
- `Status string`: `grading` hoặc `completed`
- `TotalSubmissions int`
- `ApprovedSubmissions int`
- `CreatedAt time.Time`
- `CompletedAt *time.Time`

Constraints và index:

- Unique `exam_id`: mỗi exam có đúng một grading batch.
- Index `(created_by, status)`.
- `total_submissions > 0`.
- `0 <= approved_submissions <= total_submissions`.

Danh sách student không thể bổ sung sau khi tạo batch vì create-exam khóa
`TotalSubmissions` tại first-submission event.

### 6.2. `ScoringSubmission`

- `ID uuid.UUID`
- `GradingBatchID uuid.UUID`
- `StudentID uuid.UUID`
- `Status string`: `grading`, `approved` hoặc `revision`
- `Version int`: bắt đầu từ 1
- `AwardedPoints model.Score`
- `EffectiveApprovalVersion int`: 0 khi chưa approve
- `ApprovedBy *uuid.UUID`
- `ApprovedAt *time.Time`
- `CreatedAt time.Time`
- `UpdatedAt time.Time`

Constraints và index:

- Unique `(grading_batch_id, student_id)`.
- Index `(grading_batch_id, status)`.
- Student phải tồn tại và có `User.Role == "student"`.

`AwardedPoints` là tổng của working result hiện tại. Khi status là `revision`,
approval snapshot gần nhất vẫn là kết quả có hiệu lực cho tới khi revision
được approve.

### 6.3. `ScoringQuestionResult`

- `SubmissionID uuid.UUID`
- `ExamQuestionID uuid.UUID`
- `Status string`: `correct`, `incorrect` hoặc `unanswered`
- `Reviewed bool`
- `AwardedPoints model.Score`
- `UpdatedBy uuid.UUID`
- `UpdatedAt time.Time`

Primary key `(submission_id, exam_question_id)`.

Với câu `single_choice`:

- `correct` nhận toàn bộ `ExamQuestion.Points`.
- `incorrect` và `unanswered` nhận 0.
- `Reviewed` chỉ thành `true` sau khi giáo viên chủ động chọn một trạng thái.

Với câu `essay`, status và điểm câu được suy ra từ rubric results. API không
cho sửa trực tiếp question result của essay. `Reviewed` chỉ là `true` khi mọi
rubric result của câu đã được giáo viên đánh giá.

### 6.4. `ScoringRubricResult`

- `SubmissionID uuid.UUID`
- `ExamRubricItemID uuid.UUID`
- `Status string`: `correct`, `incorrect` hoặc `unanswered`
- `Reviewed bool`
- `AwardedPoints model.Score`
- `UpdatedBy uuid.UUID`
- `UpdatedAt time.Time`

Primary key `(submission_id, exam_rubric_item_id)`.

- `correct` nhận toàn bộ `ExamRubricItem.Points`.
- `incorrect` và `unanswered` nhận 0.
- `Reviewed` chỉ thành `true` sau khi giáo viên chủ động chọn một trạng thái.
- Cập nhật rubric result phải tính lại essay question result và submission
  total trong cùng transaction.

### 6.5. `ScoringApprovalSnapshot`

- `ID uuid.UUID`
- `SubmissionID uuid.UUID`
- `ApprovalVersion int`
- `ResultJSON string`
- `TotalPoints model.Score`
- `ApprovedBy uuid.UUID`
- `ApprovedAt time.Time`

Unique `(submission_id, approval_version)`.

Snapshot chứa canonical result của tất cả câu và rubric tại thời điểm approve.
Không update hoặc delete approval snapshot.

### 6.6. `ScoringAuditLog`

- `ID uuid.UUID`
- `BatchID uuid.UUID`
- `SubmissionID *uuid.UUID`
- `Action string`
- `ActorID uuid.UUID`
- `PreviousValueJSON string`
- `NewValueJSON string`
- `OccurredAt time.Time`

Index `(submission_id, occurred_at)`.

`SubmissionID` để trống cho action cấp batch như `batch_created` và
`batch_completed`. Mọi audit entry luôn có `BatchID`.

Các action tối thiểu:

- `batch_created`
- `question_result_updated`
- `rubric_result_updated`
- `submission_approved`
- `revision_started`
- `revision_approved`
- `batch_completed`

### 6.7. `ScoringInternalEvent`

- `ID uuid.UUID`
- `EventType string`
- `IdempotencyKey string`
- `PayloadJSON string`
- `ResultJSON string`
- `ProcessedAt time.Time`

Unique `(event_type, idempotency_key)`.

Event dùng cho `create_batch`, `approve_submission` và
`start_revision`. Retry cùng canonical payload trả result cũ; payload khác với
cùng key trả `idempotency_conflict`.

## 7. Nguồn dữ liệu và snapshot

`ExamSnapshot` có purpose `grading_lock` là nguồn sự thật cho:

- Exam metadata và total points.
- Danh sách câu theo thứ tự.
- Loại câu.
- Điểm tối đa của câu.
- Danh sách rubric item và điểm tối đa.
- Topic node IDs phục vụ báo cáo sau này.

Scoring không snapshot lại question content hoặc rubric description vào các
bảng result. Approval snapshot chứa kết quả và các ID của grading snapshot,
không tạo phiên bản đề mới.

Khi đọc snapshot, server phải:

1. Từ chối purpose khác `grading_lock`.
2. Từ chối question ID trùng.
3. Từ chối rubric ID trùng.
4. Từ chối rubric không thuộc essay question.
5. Xác minh tổng rubric bằng điểm essay question.
6. Xác minh tổng điểm câu bằng total points của exam.

Validation này phòng trường hợp snapshot cũ hoặc dữ liệu migration không đúng
contract.

## 8. Quy tắc tính điểm

### 8.1. Trắc nghiệm

Giáo viên chọn một trong:

- `correct`: nhận toàn bộ điểm câu.
- `incorrect`: nhận 0.
- `unanswered`: nhận 0.

Giá trị khởi tạo có thể là `unanswered` nhưng `Reviewed=false`. Chỉ lựa chọn
chủ động của giáo viên mới đặt `Reviewed=true`; nhờ đó hệ thống phân biệt
“chưa đánh giá” với “đã xác nhận học sinh không làm”.

### 8.2. Tự luận

Giáo viên đánh giá mỗi rubric item:

- `correct`: nhận toàn bộ điểm của rubric.
- `incorrect`: nhận 0.
- `unanswered`: nhận 0.

Điểm câu tự luận là tổng awarded points của các rubric item. Trạng thái câu:

- `unanswered` nếu tất cả rubric là `unanswered`.
- `correct` nếu mọi rubric là `correct`.
- `incorrect` cho các trường hợp còn lại sau khi tất cả rubric đã được đánh
  giá.

Trạng thái câu chỉ phục vụ hiển thị; điểm rubric mới là nguồn tính điểm essay.
Essay question có `Reviewed=true` chỉ khi mọi rubric result có
`Reviewed=true`.

### 8.3. Tổng điểm

Tổng bài là tổng `ScoringQuestionResult.AwardedPoints`.

- Mọi phép tính dùng `model.Score`/`decimal.Decimal`.
- Không dùng `float32` hoặc `float64`.
- Client không gửi `AwardedPoints` hay tổng điểm.
- Server tính lại toàn bộ total trước mỗi approval.

## 9. API contract

Tất cả route nằm sau JWT middleware và teacher role middleware. Actor ID lấy
từ JWT `sub`.

### 9.1. Student selection và batch

- `GET /api/teacher/scoring/students?search=`
- `POST /api/teacher/grading-batches`
- `GET /api/teacher/grading-batches?status=&search=`
- `GET /api/teacher/grading-batches/:batchId`

Create batch body:

```json
{
  "examId": "4c0f8562-3fc2-4cb8-882a-f086d5561cca",
  "studentIds": [
    "57501f64-7fb1-43b8-a3c1-b33178eb6558",
    "eaadb337-ad5b-4e1e-9926-53d138ad2dd2"
  ],
  "expectedExamVersion": 7
}
```

Header bắt buộc:

- `Idempotency-Key`

Create batch kiểm tra:

- Exam thuộc actor.
- Exam ở `preparing_exam`.
- Exam chưa có batch.
- `expectedExamVersion` khớp.
- Student list không rỗng, không trùng.
- Mọi student tồn tại và có role `student`.

### 9.2. Submission

- `GET /api/teacher/scoring-submissions/:submissionId`
- `PUT /api/teacher/scoring-submissions/:submissionId/questions/:questionId`
- `PUT /api/teacher/scoring-submissions/:submissionId/rubrics/:rubricId`
- `POST /api/teacher/scoring-submissions/:submissionId/approve`
- `POST /api/teacher/scoring-submissions/:submissionId/revisions`
- `GET /api/teacher/scoring-submissions/:submissionId/history`
- `GET /api/teacher/scoring-submissions/:submissionId/audit`

Question/rubric mutation body:

```json
{
  "status": "correct",
  "expectedVersion": 3
}
```

Approve body:

```json
{
  "expectedVersion": 12
}
```

Approve và start revision bắt buộc có `Idempotency-Key`.

## 10. State machine

### 10.1. Batch

```text
grading -> completed
```

- `grading`: chưa phải mọi submission đều có approval.
- `completed`: mọi submission đã có ít nhất một approval.
- Batch completed không quay lại grading khi có revision vì approval cũ vẫn có
  hiệu lực.

### 10.2. Submission

```text
grading -> approved
approved -> revision -> approved
```

- `grading`: chưa có approval.
- `approved`: working result trùng approval version có hiệu lực.
- `revision`: working result đang được sửa; approval cũ vẫn có hiệu lực.

Approve lần đầu:

1. Validate mọi result đầy đủ.
2. Tính lại total.
3. Tạo approval version 1.
4. Chuyển submission sang `approved`.
5. Tăng `ApprovedSubmissions`.
6. Nếu đủ, hoàn tất batch và gọi exam grading-completed.

Approve revision:

1. Validate mọi result đầy đủ.
2. Tính lại total.
3. Tạo approval version kế tiếp.
4. Cập nhật effective approval version.
5. Chuyển về `approved`.
6. Không tăng `ApprovedSubmissions`.
7. Không giảm hoặc phát lại exam completion progress.

Exam đã `done` vẫn cho phép revision kết quả. Nội dung exam và grading snapshot
luôn bất biến.

## 11. Đồng thời và idempotency

Mỗi result mutation:

1. Bắt đầu transaction.
2. Lock owned submission bằng `SELECT ... FOR UPDATE`.
3. Kiểm tra `expectedVersion`.
4. Kiểm tra submission ở `grading` hoặc `revision`.
5. Validate result ID thuộc snapshot.
6. Cập nhật result.
7. Tính lại question và submission totals.
8. Tăng submission version đúng một lần.
9. Ghi audit.
10. Commit và trả detail mới.

HTTP 409 `version_conflict` trả current version trong error metadata. Frontend
reload detail; mutation không được tự retry.

Create batch và approve:

- Lưu canonical payload và result trong `ScoringInternalEvent`.
- Cùng event type, key và payload trả result cũ.
- Cùng event type/key nhưng payload khác trả `idempotency_conflict`.
- Unique database constraints là lớp bảo vệ cuối cho concurrent duplicate.

## 12. Validation và error contract

Không cho approve khi:

- Còn single-choice question chưa được giáo viên đánh giá.
- Còn rubric item chưa được giáo viên đánh giá.
- Có result ID không thuộc grading snapshot.
- Thiếu result row so với snapshot.
- Tổng điểm working result không khớp phép tính lại.

Domain error có:

- `code`
- `message`
- `field`
- `submissionId`, `examQuestionId` hoặc `rubricItemId` khi phù hợp.
- `currentVersion` cho version conflict.

Các code ổn định:

- `grading_batch_exists`
- `exam_not_prepared`
- `invalid_student`
- `duplicate_student`
- `submission_not_found`
- `question_not_in_snapshot`
- `rubric_not_in_snapshot`
- `result_incomplete`
- `version_conflict`
- `revision_required`
- `invalid_transition`
- `idempotency_conflict`

Status mapping:

- 400: request contract hoặc transition không hợp lệ.
- 403: actor đã xác thực nhưng không có teacher role.
- 404: resource không tồn tại hoặc ownership mismatch.
- 409: version/idempotency/batch conflict.
- 422: kết quả chưa đủ điều kiện approve.

## 13. Frontend

### 13.1. Cấu trúc

```text
frontend/src/features/scoring/
├── api.ts
├── types.ts
└── errors.ts

frontend/src/app/teacher/components/
├── ExamScoringTab.tsx
└── scoring/
    ├── GradingBatchList.tsx
    ├── CreateGradingBatch.tsx
    ├── StudentSubmissionList.tsx
    ├── SubmissionScoringForm.tsx
    ├── QuestionScoringCard.tsx
    ├── RubricScoringRow.tsx
    └── ScoringSummary.tsx
```

`teacher/page.tsx` chỉ thêm active tab, navigation item và render
`ExamScoringTab`. Typed API client và scoring state không đặt trong page này.

### 13.2. Luồng tạo batch

1. Mở tab `Chấm bài kiểm tra`.
2. Chọn exam ở `preparing_exam`.
3. Chọn một hoặc nhiều student.
4. Hiển thị cảnh báo không thể thêm student sau khi khóa đề.
5. Tạo batch với idempotency key.
6. Mở grading workspace.

### 13.3. Grading workspace

- Danh sách student hiển thị trạng thái, điểm effective và tiến độ.
- Chọn student mở toàn bộ câu theo thứ tự snapshot.
- Single-choice có nút `Đúng`, `Sai`, `Không làm`.
- Mỗi rubric row có `Đạt`, `Không đạt`, `Không làm`.
- Mỗi thao tác autosave và thay local version bằng response server.
- Summary hiển thị điểm hiện tại, tổng điểm, số result chưa đánh giá, version
  và trạng thái.
- Approve chỉ bật khi không còn result chưa đánh giá.
- Bài approved là read-only cho tới khi chọn `Tạo bản chỉnh sửa`.
- Revision hiển thị rõ working score và effective approved score.
- History hiển thị các approval version theo thời gian.

Không có upload panel, document preview, OCR content, evidence selection hoặc
provider configuration.

### 13.4. Error UX

- `version_conflict`: toast thông báo dữ liệu đã đổi ở tab khác và reload.
- `result_incomplete`: focus/scroll tới result đầu tiên chưa đánh giá.
- Mất mạng khi autosave: giữ trạng thái `Chưa lưu` và nút thử lại.
- Không optimistic-update điểm chính thức trước response.
- Không tự retry PUT/POST mutation.
- GET có thể dùng retry behavior hiện tại của `apiFetch`.

## 14. Bảo mật

- Teacher identity chỉ lấy từ JWT `sub`.
- Backend enforce teacher role; frontend role check chỉ phục vụ navigation.
- Giáo viên chỉ đọc/sửa exam, batch và submission do mình sở hữu.
- Student ID phải tham chiếu `User` có role `student`.
- Request không nhận `awardedPoints`, `totalPoints`, `approvedBy` hoặc
  `approvalVersion`.
- File path, provider key và OCR data không tồn tại trong contract.
- Audit không ghi JWT, password hoặc secret.
- Batch/submission không hard-delete sau khi exam đã khóa.
- GORM sử dụng parameterized query; idempotency payload được canonicalize.

## 15. Testing

### 15.1. Backend unit tests

- Parse và validate grading snapshot.
- Reject duplicate/unknown question và rubric IDs.
- Single-choice score calculation.
- Essay rubric score calculation.
- Derived essay question status.
- Phân biệt initial `unanswered` chưa review với explicit `unanswered` đã
  review.
- Submission total calculation bằng decimal.
- Approval completeness validation.
- Canonical idempotency payload.

### 15.2. Backend PostgreSQL integration tests

- Tạo batch atomically với exam grading lock.
- Reject stale exam version.
- Reject duplicate batch, student ID và non-student user.
- Ownership và teacher role.
- Tạo đúng số submissions/result rows từ snapshot.
- Autosave result và tăng version đúng một lần.
- Hai concurrent mutation chỉ một request thành công.
- Create batch và approve idempotent.
- Approval snapshot bất biến.
- Revision tạo approval version mới.
- Approval lần đầu tăng progress; revision không tăng progress lần hai.
- Batch completion gọi grading-completed đúng một lần.
- Rollback toàn bộ nếu lock exam hoặc tạo submission thất bại.

### 15.3. Frontend tests

- Typed API paths và error mapping.
- Student multi-select và create batch payload.
- Không cho create khi chưa chọn exam/student.
- Hiển thị result từ snapshot.
- Autosave gửi current expected version.
- Version conflict reload.
- Network error hiển thị `Chưa lưu`.
- Approve disabled khi incomplete.
- Approved read-only và revision flow.
- History hiển thị nhiều approval versions.
- TypeScript check và Next.js production build.

### 15.4. Browser smoke

1. Đăng nhập teacher demo.
2. Mở `Chấm bài kiểm tra`.
3. Chọn prepared exam và hai student.
4. Tạo batch.
5. Chấm và approve student thứ nhất.
6. Chấm và approve student thứ hai.
7. Xác nhận batch completed và exam done.
8. Tạo revision cho student thứ nhất.
9. Sửa một result và approve lại.
10. Xác nhận approval history có version mới và batch progress không tăng sai.

### 15.5. Regression

- `go test ./...` và `go vet ./...` trong backend chính.
- Frontend tests, typecheck và production build.
- `create_exam_backend` test suite tiếp tục pass.
- `Real_exam_scoring_backend` test suite tiếp tục pass như regression oracle.
- Teacher/student flows hiện có không bị hỏng.

## 16. Triển khai và cấu hình

Không thêm Python service vào `run.ps1`. Không thêm Datalab hoặc Qwen
environment variables.

GORM AutoMigrate thêm các scoring models vào PostgreSQL chính. Không migrate
dữ liệu từ SQLite của module demo.

Runtime dependencies:

- Go 1.26.3.
- Fiber v3.
- GORM/PostgreSQL.
- `shopspring/decimal` thông qua `model.Score`.
- Next.js/React/TypeScript và component library hiện có.

## 17. Tiêu chí hoàn thành

- Không cần chạy `Real_exam_scoring_backend` để chấm bài.
- Giáo viên tạo batch từ prepared exam và một hoặc nhiều student.
- Exam được khóa bằng đúng một `grading_lock` snapshot.
- Mỗi student có một submission cho toàn bộ exam.
- Trắc nghiệm và rubric tự luận chấm được bằng ba trạng thái.
- Server tính điểm chính xác và không tin điểm từ client.
- Optimistic locking, ownership, idempotency và audit được enforce.
- Approval và revision tạo lịch sử bất biến.
- Batch completion cập nhật create-exam progress đúng một lần.
- Frontend có tab chấm bài hoàn chỉnh, autosave và conflict UX.
- Không có upload, OCR hoặc Qwen trong runtime tích hợp.
- Backend tests, frontend tests/build và Playwright smoke pass.
- Các test suite tham chiếu hiện có tiếp tục pass.
