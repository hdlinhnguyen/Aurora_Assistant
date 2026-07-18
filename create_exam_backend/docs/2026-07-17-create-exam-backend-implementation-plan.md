# Create Exam Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây dựng backend FastAPI độc lập để giáo viên soạn đề từ ngân hàng hoặc câu nhập tay, gắn topic/barem, kéo-thả, quản lý vòng đời, khóa đề theo callback chấm và xuất DOCX.

**Architecture:** FastAPI gọi các service nghiệp vụ thuần Python; repository SQLite chịu trách nhiệm persistence và transaction. Ngân hàng câu hỏi seed, document exporter và callback chấm nằm sau các interface riêng để có thể thay adapter khi tích hợp production.

**Tech Stack:** Python 3.11+, FastAPI, Pydantic 2, SQLite, python-docx, pytest, HTTPX, vanilla HTML/CSS/JavaScript, Playwright cho browser smoke test.

## Global Constraints

- Mọi thay đổi nằm trong `create_exam_backend`; không sửa thư mục `frontend`.
- MVP chạy độc lập, không gọi mạng và không yêu cầu credential bên ngoài.
- Chỉ hỗ trợ `single_choice` và `essay`.
- Câu có nguồn `question_bank` hoặc `manual`; câu manual không được ghi ngược vào ngân hàng.
- Câu manual phải có topic; mỗi rubric item phải có topic.
- `total_points` cấu hình được và mặc định là `10.00`.
- Trạng thái duy nhất là `drafting`, `preparing_exam`, `done`.
- Giáo viên sửa được ở `preparing_exam` cho tới callback bài nộp đầu tiên.
- Sau bài nộp đầu tiên, đề bị khóa bằng snapshot bất biến.
- Chỉ callback nội bộ xác nhận mọi bài đã chấm và có điểm mới chuyển `done`.
- Chỉ xuất DOCX; không xuất PDF.
- Mọi mutation của giáo viên dùng `expected_version`.
- Điểm được tính bằng `Decimal`, lưu SQLite dưới dạng chuỗi có hai chữ số thập phân.
- Mọi behavior mới phải đi qua RED → GREEN → REFACTOR.

---

## Cấu trúc file đích

```text
create_exam_backend/
├── __init__.py
├── requirements.txt
├── requirements-dev.txt
├── README.md
├── app/
│   ├── __init__.py
│   ├── api.py
│   ├── auth.py
│   ├── config.py
│   ├── database.py
│   ├── demo.html
│   ├── errors.py
│   ├── exporter.py
│   ├── main.py
│   ├── repositories.py
│   ├── schema.sql
│   ├── schemas.py
│   ├── seed.py
│   └── services.py
└── tests/
    ├── conftest.py
    ├── test_auth_and_exams.py
    ├── test_question_authoring.py
    ├── test_rubric_and_validation.py
    ├── test_lifecycle_callbacks.py
    ├── test_docx_export.py
    ├── test_demo.py
    └── browser_smoke.py
```

Trách nhiệm:

- `schemas.py`: request/response model và chuẩn hóa Decimal.
- `services.py`: state machine, validation, versioning và snapshot.
- `repositories.py`: SQL có tham số, mapping row và transaction.
- `exporter.py`: chỉ nhận snapshot và trả đường dẫn/file metadata.
- `api.py`: HTTP contract, không chứa quy tắc điểm/trạng thái.
- `demo.html`: REST client và drag-and-drop, không truy cập database trực tiếp.

---

### Task 1: Nền ứng dụng, cấu hình, database và dữ liệu seed

**Files:**

- Create: `create_exam_backend/__init__.py`
- Create: `create_exam_backend/requirements.txt`
- Create: `create_exam_backend/requirements-dev.txt`
- Create: `create_exam_backend/app/__init__.py`
- Create: `create_exam_backend/app/config.py`
- Create: `create_exam_backend/app/database.py`
- Create: `create_exam_backend/app/schema.sql`
- Create: `create_exam_backend/app/seed.py`
- Create: `create_exam_backend/app/main.py`
- Create: `create_exam_backend/tests/conftest.py`
- Create: `create_exam_backend/tests/test_auth_and_exams.py`

**Interfaces:**

- Produces: `Settings`, `Database`, `create_app(settings: Settings | None = None) -> FastAPI`.
- Produces: initialized SQLite schema and deterministic teacher/topic/question seed data.
- Consumes: no earlier task.

- [ ] **Step 1: Ghi test thất bại cho health check và database riêng của test**

```python
# create_exam_backend/tests/conftest.py
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from create_exam_backend.app.config import Settings
from create_exam_backend.app.main import create_app


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    settings = Settings(
        db_path=tmp_path / "exam.db",
        export_dir=tmp_path / "exports",
        internal_token="test-internal-token",
        demo_mode=True,
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def teacher_headers() -> dict[str, str]:
    return {"X-Teacher-Id": "teacher-demo", "X-Role": "teacher"}
```

```python
# create_exam_backend/tests/test_auth_and_exams.py
def test_health_reports_ready_and_seed_counts(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "topics": 6,
        "question_bank_questions": 4,
    }
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_auth_and_exams.py::test_health_reports_ready_and_seed_counts -v
```

Expected: collection fails with `ModuleNotFoundError` hoặc import error vì ứng dụng chưa tồn tại.

- [ ] **Step 3: Tạo dependency manifests**

```text
# create_exam_backend/requirements.txt
fastapi>=0.115,<1
uvicorn>=0.30,<1
pydantic>=2.9,<3
python-docx>=1.1,<2
```

```text
# create_exam_backend/requirements-dev.txt
-r requirements.txt
pytest>=8.3,<9
httpx>=0.27,<1
playwright>=1.46,<2
ruff>=0.8,<1
```

- [ ] **Step 4: Tạo Settings và Database tối thiểu**

```python
# create_exam_backend/app/config.py
from dataclasses import dataclass
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    db_path: Path
    export_dir: Path
    internal_token: str
    demo_mode: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            db_path=Path(os.getenv("AURORA_EXAM_DB_PATH", "create_exam_backend/data/exams.db")),
            export_dir=Path(os.getenv("AURORA_EXAM_EXPORT_DIR", "create_exam_backend/data/exports")),
            internal_token=os.getenv("AURORA_EXAM_INTERNAL_TOKEN", "change-me-for-production"),
            demo_mode=os.getenv("AURORA_EXAM_DEMO_MODE", "true").lower() == "true",
        )
```

```python
# create_exam_backend/app/database.py
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from collections.abc import Iterator


class Database:
    def __init__(self, path: Path):
        self.path = path

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @contextmanager
    def transaction(self, immediate: bool = False) -> Iterator[sqlite3.Connection]:
        connection = self.connect()
        try:
            connection.execute("BEGIN IMMEDIATE" if immediate else "BEGIN")
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self, schema_path: Path) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.executescript(schema_path.read_text(encoding="utf-8"))
```

- [ ] **Step 5: Tạo schema SQL đầy đủ**

`schema.sql` phải tạo các bảng sau với foreign key và unique constraint tương ứng:

```sql
CREATE TABLE IF NOT EXISTS teachers (
    teacher_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS topics (
    topic_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    grade_level INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS question_bank_questions (
    question_id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    grade_level INTEGER NOT NULL,
    question_type TEXT NOT NULL CHECK(question_type IN ('single_choice', 'essay')),
    default_points TEXT NOT NULL,
    choices_json TEXT NOT NULL DEFAULT '[]',
    correct_choice_id TEXT,
    topic_ids_json TEXT NOT NULL,
    rubric_json TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS exams (
    exam_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    grade_level INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    total_points TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('drafting', 'preparing_exam', 'done')),
    version INTEGER NOT NULL,
    created_by TEXT NOT NULL REFERENCES teachers(teacher_id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    first_submission_received_at TEXT,
    locked_snapshot_id TEXT
);
CREATE TABLE IF NOT EXISTS exam_questions (
    exam_question_id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(exam_id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK(source_type IN ('question_bank', 'manual')),
    source_question_id TEXT,
    question_type TEXT NOT NULL CHECK(question_type IN ('single_choice', 'essay')),
    content TEXT NOT NULL,
    points TEXT NOT NULL,
    position INTEGER NOT NULL,
    choices_json TEXT NOT NULL DEFAULT '[]',
    correct_choice_id TEXT,
    topic_ids_json TEXT NOT NULL,
    UNIQUE(exam_id, position)
);
CREATE TABLE IF NOT EXISTS rubric_items (
    rubric_item_id TEXT PRIMARY KEY,
    exam_question_id TEXT NOT NULL REFERENCES exam_questions(exam_question_id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    points TEXT NOT NULL,
    position INTEGER NOT NULL,
    topic_ids_json TEXT NOT NULL,
    UNIQUE(exam_question_id, position)
);
CREATE TABLE IF NOT EXISTS exam_snapshots (
    snapshot_id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(exam_id),
    exam_version INTEGER NOT NULL,
    purpose TEXT NOT NULL CHECK(purpose IN ('grading_lock', 'export')),
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS grading_progress (
    exam_id TEXT PRIMARY KEY REFERENCES exams(exam_id),
    total_submissions INTEGER NOT NULL,
    graded_submissions INTEGER NOT NULL,
    scored_submissions INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS internal_events (
    event_id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(exam_id),
    event_type TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    processed_at TEXT NOT NULL,
    UNIQUE(event_type, idempotency_key)
);
CREATE TABLE IF NOT EXISTS exports (
    export_id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(exam_id),
    exam_version INTEGER NOT NULL,
    style TEXT NOT NULL CHECK(style IN ('standard', 'compact')),
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id TEXT PRIMARY KEY,
    exam_id TEXT NOT NULL REFERENCES exams(exam_id),
    action TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    previous_value_json TEXT,
    new_value_json TEXT,
    occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exams_owner_status ON exams(created_by, status);
CREATE INDEX IF NOT EXISTS idx_exam_questions_exam_position ON exam_questions(exam_id, position);
CREATE INDEX IF NOT EXISTS idx_rubric_question_position ON rubric_items(exam_question_id, position);
```

- [ ] **Step 6: Seed đúng 6 topic, 4 câu và một giáo viên**

`seed.py` dùng `INSERT OR IGNORE` cho:

```python
TOPICS = [
    ("topic-linear-equations", "Phương trình bậc nhất", "math", 8),
    ("topic-fractions", "Phân số", "math", 8),
    ("topic-geometry", "Hình học phẳng", "math", 8),
    ("topic-probability", "Xác suất", "math", 8),
    ("topic-reading", "Đọc hiểu", "literature", 8),
    ("topic-writing", "Viết đoạn văn", "literature", 8),
]
```

Bốn câu gồm hai `single_choice`, hai `essay`; ít nhất một câu tự luận có hai rubric items với tổng điểm bằng `default_points`.

- [ ] **Step 7: Tạo app factory và health route**

```python
# create_exam_backend/app/main.py
from pathlib import Path
from fastapi import FastAPI

from .config import Settings
from .database import Database
from .seed import seed_database


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings or Settings.from_env()
    config.export_dir.mkdir(parents=True, exist_ok=True)
    database = Database(config.db_path)
    database.initialize(Path(__file__).with_name("schema.sql"))
    seed_database(database)
    app = FastAPI(title="Aurora Create Exam Backend")
    app.state.settings = config
    app.state.database = database

    @app.get("/health")
    def health() -> dict[str, int | str]:
        with database.connect() as connection:
            topics = connection.execute("SELECT COUNT(*) FROM topics").fetchone()[0]
            questions = connection.execute(
                "SELECT COUNT(*) FROM question_bank_questions"
            ).fetchone()[0]
        return {
            "status": "ready",
            "topics": topics,
            "question_bank_questions": questions,
        }

    return app


app = create_app()
```

- [ ] **Step 8: Chạy test và xác nhận GREEN**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_auth_and_exams.py::test_health_reports_ready_and_seed_counts -v
```

Expected: `1 passed`.

- [ ] **Step 9: Commit**

```powershell
git add create_exam_backend
git commit -m "feat(exams): scaffold FastAPI service and database"
```

---

### Task 2: Authentication, error contract và CRUD đề

**Files:**

- Create: `create_exam_backend/app/auth.py`
- Create: `create_exam_backend/app/errors.py`
- Create: `create_exam_backend/app/schemas.py`
- Create: `create_exam_backend/app/repositories.py`
- Create: `create_exam_backend/app/services.py`
- Create: `create_exam_backend/app/api.py`
- Modify: `create_exam_backend/app/main.py`
- Modify: `create_exam_backend/tests/test_auth_and_exams.py`

**Interfaces:**

- Consumes: `Database`.
- Produces: dependency `teacher_id(x_teacher_id, x_role) -> str`, `DomainError`, `ExamRepository`, `ExamService`.
- Produces: create/list/detail/update/delete exam endpoints.

- [ ] **Step 1: Viết test RED cho auth, ownership, CRUD và version conflict**

```python
def test_exam_crud_requires_owner_and_expected_version(client, teacher_headers):
    create = client.post(
        "/api/exams",
        headers=teacher_headers,
        json={
            "title": "Kiểm tra 15 phút",
            "subject_id": "math",
            "grade_level": 8,
            "duration_minutes": 15,
            "instructions": "Không sử dụng tài liệu.",
            "total_points": "10.00",
        },
    )
    assert create.status_code == 201
    exam = create.json()
    assert exam["status"] == "drafting"
    assert exam["version"] == 1

    missing_auth = client.get(f"/api/exams/{exam['exam_id']}")
    assert missing_auth.status_code == 401

    other_teacher = client.get(
        f"/api/exams/{exam['exam_id']}",
        headers={"X-Teacher-Id": "teacher-other", "X-Role": "teacher"},
    )
    assert other_teacher.status_code == 404

    update = client.patch(
        f"/api/exams/{exam['exam_id']}",
        headers=teacher_headers,
        json={"title": "Đề số 1", "expected_version": 1},
    )
    assert update.status_code == 200
    assert update.json()["version"] == 2

    stale = client.patch(
        f"/api/exams/{exam['exam_id']}",
        headers=teacher_headers,
        json={"title": "Bản cũ", "expected_version": 1},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "version_conflict"
    assert stale.json()["error"]["details"]["current_version"] == 2
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_auth_and_exams.py -v
```

Expected: `404 Not Found` ở `POST /api/exams`.

- [ ] **Step 3: Tạo schema request nghiêm ngặt và Decimal normalizer**

`schemas.py` định nghĩa `StrictModel(extra="forbid")`, `ExamCreate`, `ExamPatch`, `ExamResponse`; `total_points` dùng:

```python
Score = Annotated[
    Decimal,
    Field(gt=Decimal("0"), max_digits=7, decimal_places=2),
]


def score_text(value: Decimal) -> str:
    return str(value.quantize(Decimal("0.01")))
```

`ExamPatch` có mọi field metadata optional nhưng bắt buộc `expected_version: int = Field(ge=1)`.

- [ ] **Step 4: Tạo auth và DomainError**

```python
def teacher_id(
    x_teacher_id: Annotated[str | None, Header()] = None,
    x_role: Annotated[str | None, Header()] = None,
) -> str:
    if not x_teacher_id:
        raise HTTPException(401, "X-Teacher-Id is required")
    if x_role != "teacher":
        raise HTTPException(403, "Teacher role is required")
    return x_teacher_id.strip()
```

```python
class DomainError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}
        super().__init__(message)
```

Exception handler trả chính xác `{"error": {"code", "message", "details"}}`.

- [ ] **Step 5: Implement repository/service CRUD**

Repository phải dùng SQL có tham số và cung cấp đúng signatures:

| Method | Parameters | Return |
|---|---|---|
| `create_exam` | `connection: sqlite3.Connection, values: dict[str, object]` | `dict[str, object]` |
| `list_exams` | `connection: sqlite3.Connection, teacher_id: str, status: str | None, search: str | None` | `list[dict[str, object]]` |
| `get_owned_exam` | `connection: sqlite3.Connection, exam_id: str, teacher_id: str` | `dict[str, object] | None` |
| `update_exam` | `connection: sqlite3.Connection, exam_id: str, teacher_id: str, expected_version: int, changes: dict[str, object], updated_at: str` | `dict[str, object] | None` |
| `delete_exam` | `connection: sqlite3.Connection, exam_id: str, teacher_id: str` | `bool` |

`update_exam` thực hiện:

```sql
UPDATE exams
SET title = COALESCE(:title, title),
    instructions = COALESCE(:instructions, instructions),
    duration_minutes = COALESCE(:duration_minutes, duration_minutes),
    total_points = COALESCE(:total_points, total_points),
    version = version + 1,
    updated_at = :updated_at
WHERE exam_id = :exam_id
  AND created_by = :teacher_id
  AND version = :expected_version
  AND first_submission_received_at IS NULL
  AND status != 'done'
```

Service phân biệt not found, locked và stale version bằng read trong cùng `BEGIN IMMEDIATE` transaction.

- [ ] **Step 6: Gắn router và chạy test GREEN**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_auth_and_exams.py -v
```

Expected: tất cả test trong file pass.

- [ ] **Step 7: Commit**

```powershell
git add create_exam_backend
git commit -m "feat(exams): add owned exam CRUD and versioning"
```

---

### Task 3: Ngân hàng, câu nhập tay và kéo-thả

**Files:**

- Modify: `create_exam_backend/app/schemas.py`
- Modify: `create_exam_backend/app/repositories.py`
- Modify: `create_exam_backend/app/services.py`
- Modify: `create_exam_backend/app/api.py`
- Create: `create_exam_backend/tests/test_question_authoring.py`

**Interfaces:**

- Consumes: `ExamService`, owner/version/lock checks.
- Produces: question bank/topic read APIs.
- Produces: add-from-bank, add/update/delete manual question, reorder APIs.

- [ ] **Step 1: Viết RED test cho hai nguồn câu và snapshot**

```python
def test_adds_bank_snapshot_and_manual_question(client, teacher_headers, exam):
    bank = client.get(
        "/api/question-bank/questions?subject_id=math&grade_level=8",
        headers=teacher_headers,
    )
    assert bank.status_code == 200
    bank_question_id = bank.json()[0]["question_id"]

    added_bank = client.post(
        f"/api/exams/{exam['exam_id']}/questions/from-bank",
        headers=teacher_headers,
        json={
            "question_id": bank_question_id,
            "points": "2.00",
            "expected_version": 1,
        },
    )
    assert added_bank.status_code == 201
    assert added_bank.json()["source_type"] == "question_bank"
    assert added_bank.json()["topic_ids"]

    manual = client.post(
        f"/api/exams/{exam['exam_id']}/questions/manual",
        headers=teacher_headers,
        json={
            "question_type": "single_choice",
            "content": "Giá trị của x khi x + 3 = 5?",
            "points": "2.00",
            "topic_ids": ["topic-linear-equations"],
            "choices": [
                {"choice_id": "a", "content": "1"},
                {"choice_id": "b", "content": "2"},
            ],
            "correct_choice_id": "b",
            "expected_version": 2,
        },
    )
    assert manual.status_code == 201
    assert manual.json()["source_type"] == "manual"
    assert manual.json()["position"] == 2
    assert manual.json()["exam_version"] == 3
```

- [ ] **Step 2: Viết RED test cho topic sai, sửa tag bank và reorder**

Test phải xác nhận:

- Manual không có topic trả `422 topic_required`.
- Topic văn học trong đề toán trả `422 topic_not_allowed`.
- Patch `topic_ids` của câu bank trả `409 bank_topics_immutable`.
- Reorder danh sách ID thiếu hoặc trùng trả `422 invalid_reorder`.
- Reorder hợp lệ đổi đúng `position` và tăng version một lần.

- [ ] **Step 3: Chạy file test và xác nhận RED**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_question_authoring.py -v
```

Expected: route question bank và question authoring trả `404`.

- [ ] **Step 4: Implement question bank queries và schema**

Schemas:

```python
class Choice(StrictModel):
    choice_id: str = Field(min_length=1, max_length=40)
    content: str = Field(min_length=1, max_length=2_000)


class AddBankQuestion(StrictModel):
    question_id: str = Field(min_length=1, max_length=200)
    points: Score
    expected_version: int = Field(ge=1)


class ManualQuestionCreate(StrictModel):
    question_type: Literal["single_choice", "essay"]
    content: str = Field(min_length=1, max_length=20_000)
    points: Score
    topic_ids: list[str] = Field(min_length=1, max_length=50)
    choices: list[Choice] = Field(default_factory=list, max_length=20)
    correct_choice_id: str | None = None
    expected_version: int = Field(ge=1)


class ReorderQuestions(StrictModel):
    exam_question_ids: list[str] = Field(min_length=1, max_length=200)
    expected_version: int = Field(ge=1)
```

Validator cho manual single choice xác nhận ít nhất hai choice, ID duy nhất và correct ID tồn tại; essay buộc choices rỗng và correct ID null.

- [ ] **Step 5: Implement mutation transaction**

Mọi mutation dùng `BEGIN IMMEDIATE` theo thứ tự:

1. Load owned exam.
2. So sánh version.
3. Từ chối nếu `first_submission_received_at` khác null hoặc `status == done`.
4. Validate topic cùng subject/grade.
5. Insert/update/delete/reorder.
6. `UPDATE exams SET version = version + 1, updated_at = ?`.
7. Ghi audit log.
8. Trả object và version mới.

Khi delete, cập nhật position bằng hai pha để tránh unique collision:

```sql
UPDATE exam_questions SET position = -position WHERE exam_id = ?;
```

Sau đó ghi lại `1..n` theo thứ tự cũ bỏ câu đã xóa.

- [ ] **Step 6: Chạy test GREEN và toàn bộ regression**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_question_authoring.py -v
python -m pytest create_exam_backend/tests -v
```

Expected: tất cả pass.

- [ ] **Step 7: Commit**

```powershell
git add create_exam_backend
git commit -m "feat(exams): author and reorder exam questions"
```

---

### Task 4: Rubric, validation và chuyển chuẩn bị đề

**Files:**

- Modify: `create_exam_backend/app/schemas.py`
- Modify: `create_exam_backend/app/repositories.py`
- Modify: `create_exam_backend/app/services.py`
- Modify: `create_exam_backend/app/api.py`
- Create: `create_exam_backend/tests/test_rubric_and_validation.py`

**Interfaces:**

- Consumes: question authoring và lock/version helpers.
- Produces: rubric CRUD/reorder, `validate_exam`, `prepare`, `return_to_draft`.

- [ ] **Step 1: Viết RED test cho rubric và danh sách validation errors**

Tạo một đề 10 điểm gồm:

- Một manual single choice 4 điểm.
- Một manual essay 6 điểm.
- Hai rubric items 2 và 3 điểm.

Gọi `POST /api/exams/{id}/validate` và xác nhận:

```python
assert response.status_code == 200
assert response.json()["valid"] is False
assert {
    item["code"] for item in response.json()["errors"]
} == {"rubric_score_mismatch"}
```

Thêm rubric 1 điểm nhưng không topic phải trả `422 topic_required`; thêm hợp lệ rồi validate trả `{"valid": True, "errors": []}`.

- [ ] **Step 2: Viết RED test cho prepare và return-to-draft**

Test xác nhận:

- Prepare đề invalid trả `409 exam_invalid` cùng danh sách chi tiết.
- Prepare hợp lệ chuyển `preparing_exam`, tăng version.
- Vẫn sửa metadata ở `preparing_exam`.
- Return-to-draft trước bài nộp chuyển về `drafting`.
- Rubric API trên câu trắc nghiệm trả `409 rubric_not_allowed`.

- [ ] **Step 3: Chạy test và xác nhận RED**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_rubric_and_validation.py -v
```

Expected: rubric và validate routes trả `404`.

- [ ] **Step 4: Implement rubric schemas và service**

```python
class RubricItemCreate(StrictModel):
    description: str = Field(min_length=1, max_length=10_000)
    points: Score
    topic_ids: list[str] = Field(min_length=1, max_length=50)
    expected_version: int = Field(ge=1)


class ReorderRubricItems(StrictModel):
    rubric_item_ids: list[str] = Field(min_length=1, max_length=200)
    expected_version: int = Field(ge=1)
```

Rubric CRUD dùng cùng transaction pattern của Task 3 và tăng exam version đúng một lần.

- [ ] **Step 5: Implement validation thuần**

Tạo hàm:

```python
def validate_exam_snapshot(exam: dict) -> list[dict]:
    errors: list[dict] = []
    questions = exam["questions"]
    if not questions:
        errors.append(error("exam_empty", "Đề phải có ít nhất một câu.", "questions"))
    actual = sum((Decimal(q["points"]) for q in questions), Decimal("0"))
    expected = Decimal(exam["total_points"])
    if actual != expected:
        errors.append(error(
            "score_mismatch",
            "Tổng điểm các câu phải bằng thang điểm của đề.",
            "total_points",
            expected=score_text(expected),
            actual=score_text(actual),
        ))
    for question in questions:
        errors.extend(validate_question(question, exam["subject_id"], exam["grade_level"]))
    return errors
```

`validate_question` triển khai đủ 10 điều kiện trong design spec và gắn `exam_question_id`/`rubric_item_id` vào lỗi.

- [ ] **Step 6: Implement prepare/return transition**

`prepare`:

- Lock transaction.
- Check owner/version/unlocked.
- Build detail snapshot.
- Reject nếu validation có lỗi.
- Update `status = 'preparing_exam'`, `version += 1`.

`return_to_draft`:

- Chỉ từ `preparing_exam`.
- `first_submission_received_at` phải null.
- Update `status = 'drafting'`, `version += 1`.

- [ ] **Step 7: Chạy test GREEN và regression**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_rubric_and_validation.py -v
python -m pytest create_exam_backend/tests -v
```

Expected: tất cả pass.

- [ ] **Step 8: Commit**

```powershell
git add create_exam_backend
git commit -m "feat(exams): validate rubrics and prepare exams"
```

---

### Task 5: Snapshot khóa, callback idempotent và trạng thái done

**Files:**

- Modify: `create_exam_backend/app/schemas.py`
- Modify: `create_exam_backend/app/repositories.py`
- Modify: `create_exam_backend/app/services.py`
- Modify: `create_exam_backend/app/api.py`
- Create: `create_exam_backend/tests/test_lifecycle_callbacks.py`

**Interfaces:**

- Consumes: validated exam detail snapshot.
- Produces: `POST /internal/exams/{id}/first-submission`.
- Produces: `POST /internal/exams/{id}/grading-completed`.

- [ ] **Step 1: Viết RED test cho token, khóa và snapshot**

Test một đề hợp lệ ở `preparing_exam`:

```python
callback_headers = {
    "X-Internal-Token": "test-internal-token",
    "Idempotency-Key": "submission-event-1",
}
response = client.post(
    f"/internal/exams/{exam_id}/first-submission",
    headers=callback_headers,
    json={"total_submissions": 30},
)
assert response.status_code == 200
assert response.json()["locked"] is True
assert response.json()["total_submissions"] == 30
```

Sau callback:

- Patch exam trả `409 exam_locked`.
- Reorder trả `409 exam_locked`.
- Return-to-draft trả `409 exam_locked`.
- Database có đúng một snapshot `purpose = grading_lock`.
- Lặp lại cùng key/payload trả cùng response và vẫn chỉ một snapshot.
- Cùng key/payload khác trả `409 idempotency_conflict`.

- [ ] **Step 2: Viết RED test cho grading progress và done**

Test:

- `20/30/20` trả `422 invalid_grading_counts`.
- `29/30/29` được lưu nhưng status vẫn `preparing_exam`.
- `30/30/29` status vẫn `preparing_exam`.
- `30/30/30` chuyển `done`.
- Callback grading trước first submission trả `409 exam_not_locked`.
- Teacher PATCH ở `done` trả `409 exam_locked`.

- [ ] **Step 3: Chạy test và xác nhận RED**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_lifecycle_callbacks.py -v
```

Expected: callback routes trả `404`.

- [ ] **Step 4: Implement constant-time auth và schemas**

```python
def require_internal_token(request: Request, x_internal_token: str | None) -> None:
    expected = request.app.state.settings.internal_token
    if not x_internal_token or not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(401, "Invalid internal token")


class FirstSubmissionEvent(StrictModel):
    total_submissions: int = Field(gt=0, le=100_000)


class GradingCompletedEvent(StrictModel):
    total_submissions: int = Field(gt=0, le=100_000)
    graded_submissions: int = Field(ge=0, le=100_000)
    scored_submissions: int = Field(ge=0, le=100_000)
```

Reject nếu `scored_submissions > graded_submissions` hoặc `graded_submissions > total_submissions`.

- [ ] **Step 5: Implement idempotent event transaction**

Trong `BEGIN IMMEDIATE`:

1. Query event theo `(event_type, idempotency_key)`.
2. Nếu tồn tại và canonical JSON giống nhau, trả `result_json`.
3. Nếu tồn tại và payload khác, raise `idempotency_conflict`.
4. Validate exam state.
5. Thực hiện snapshot/progress/state update.
6. Ghi audit.
7. Ghi event cùng result.
8. Commit.

Canonical JSON dùng `json.dumps(payload, sort_keys=True, separators=(",", ":"))`.

First submission tạo snapshot bằng `json.dumps(detail, ensure_ascii=False, sort_keys=True)`, set `first_submission_received_at` và `locked_snapshot_id`; không tăng teacher-edit version.

Grading chuyển `done` khi:

```python
completed = (
    payload.total_submissions > 0
    and payload.graded_submissions == payload.total_submissions
    and payload.scored_submissions == payload.total_submissions
)
```

- [ ] **Step 6: Chạy test GREEN và regression**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_lifecycle_callbacks.py -v
python -m pytest create_exam_backend/tests -v
```

Expected: tất cả pass.

- [ ] **Step 7: Commit**

```powershell
git add create_exam_backend
git commit -m "feat(exams): lock exams and complete grading lifecycle"
```

---

### Task 6: Xuất DOCX versioned

**Files:**

- Create: `create_exam_backend/app/exporter.py`
- Modify: `create_exam_backend/app/schemas.py`
- Modify: `create_exam_backend/app/repositories.py`
- Modify: `create_exam_backend/app/services.py`
- Modify: `create_exam_backend/app/api.py`
- Create: `create_exam_backend/tests/test_docx_export.py`

**Interfaces:**

- Consumes: validated current exam snapshot and configured export directory.
- Produces: `DocumentExporter.export(snapshot, options, destination) -> None`.
- Produces: create/list/download export APIs.

- [ ] **Step 1: Viết RED test mở DOCX thật**

```python
from io import BytesIO
from docx import Document


def test_exports_versioned_docx_with_questions_answers_and_rubric(
    client, teacher_headers, valid_exam
):
    response = client.post(
        f"/api/exams/{valid_exam['exam_id']}/exports/docx",
        headers=teacher_headers,
        json={
            "style": "standard",
            "include_answer_key": True,
            "include_rubric": True,
            "expected_version": valid_exam["version"],
        },
    )
    assert response.status_code == 201
    export = response.json()
    assert export["exam_version"] == valid_exam["version"]
    assert "file_path" not in export

    download = client.get(
        f"/api/exams/{valid_exam['exam_id']}/exports/{export['export_id']}/download",
        headers=teacher_headers,
    )
    assert download.status_code == 200
    assert download.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    document = Document(BytesIO(download.content))
    text = "\n".join(p.text for p in document.paragraphs)
    assert valid_exam["title"] in text
    assert "ĐÁP ÁN VÀ BAREM" in text
    assert "topic-linear-equations" in text
```

Thêm test `compact`, owner isolation, stale version, invalid exam và path-safe filename.

- [ ] **Step 2: Chạy test và xác nhận RED**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_docx_export.py -v
```

Expected: export route trả `404`.

- [ ] **Step 3: Implement export schema và filename**

```python
class DocxExportCreate(StrictModel):
    style: Literal["standard", "compact"] = "standard"
    include_answer_key: bool = True
    include_rubric: bool = True
    expected_version: int = Field(ge=1)


def safe_file_name(title: str, version: int) -> str:
    normalized = unicodedata.normalize("NFKD", title)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-") or "exam"
    return f"{slug[:80]}-v{version}.docx"
```

- [ ] **Step 4: Implement DocumentExporter**

Exporter:

- Set A4, margin 2 cm.
- Font Arial 12 cho `standard`, 10.5 cho `compact`.
- Center title, subject/grade/duration/total.
- Render mỗi câu `Câu N (x điểm).`.
- Render choices `A.`, `B.`, theo input order.
- Essay standard thêm 5 dòng trống, compact thêm 2 dòng.
- Nếu answer/rubric được chọn, page break rồi render `ĐÁP ÁN VÀ BAREM`.
- Rubric line: `- {description} — {points} điểm — Topics: {comma-separated topic_ids}`.
- Save đúng destination do service cung cấp.

Public signature:

`DocumentExporter.export(snapshot: dict[str, object], style: Literal["standard", "compact"], include_answer_key: bool, include_rubric: bool, destination: Path) -> None`.

- [ ] **Step 5: Implement export transaction và download**

Service:

1. Check owner/version.
2. Build detail và validate đầy đủ.
3. Tạo `export` snapshot row.
4. Sinh DOCX vào `export_dir / export_id / safe_name`.
5. Chỉ insert exports row sau khi file save thành công.
6. Nếu insert thất bại, xóa file vừa sinh.

Download query theo cả `exam_id`, `export_id`, `created_by`; trả `FileResponse` với media type DOCX và không lộ physical path.

- [ ] **Step 6: Chạy test GREEN và regression**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_docx_export.py -v
python -m pytest create_exam_backend/tests -v
```

Expected: tất cả pass.

- [ ] **Step 7: Commit**

```powershell
git add create_exam_backend
git commit -m "feat(exams): export versioned DOCX assessments"
```

---

### Task 7: Demo kéo-thả và browser smoke test

**Files:**

- Create: `create_exam_backend/app/demo.html`
- Modify: `create_exam_backend/app/main.py`
- Create: `create_exam_backend/tests/test_demo.py`
- Create: `create_exam_backend/tests/browser_smoke.py`

**Interfaces:**

- Consumes: toàn bộ REST API đã hoàn tất.
- Produces: HTML demo tại `/` và browser smoke script.

- [ ] **Step 1: Viết RED route test**

```python
def test_demo_page_exposes_authoring_controls(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "Ngân hàng câu hỏi" in response.text
    assert 'id="exam-canvas"' in response.text
    assert 'id="manual-question-form"' in response.text
    assert 'id="export-docx"' in response.text
    assert "frontend/" not in response.text
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_demo.py -v
```

Expected: `/` trả `404`.

- [ ] **Step 3: Tạo demo HTML hoàn chỉnh**

`demo.html` phải có:

- Header trạng thái và version hiện tại.
- Sidebar bank với search, type filter, topic filter.
- `#exam-canvas` chứa sortable cards; dùng native pointer drag/drop.
- Inspector form cho metadata, manual question, choices, correct answer, rubric rows và multi-select topic.
- Score meter `current / total`.
- Nút Validate, Prepare, Return to Draft, Export DOCX.
- Khối demo callback chỉ hiển thị khi response config cho biết `demo_mode=true`.
- Toast/error panel render `error.code`, message và focus field/item tương ứng.

Mọi fetch teacher dùng:

```javascript
const teacherHeaders = {
  "X-Teacher-Id": "teacher-demo",
  "X-Role": "teacher",
  "Content-Type": "application/json",
};
```

Reorder gửi toàn bộ ID sau drop và `expected_version`; nếu `409`, reload đề thay vì tự ghi đè.

Download dùng authenticated fetch → blob → temporary object URL.

- [ ] **Step 4: Phục vụ HTML và demo config an toàn**

`GET /` trả `FileResponse(Path(__file__).with_name("demo.html"))`.

`GET /api/demo-config` trả:

```json
{"demo_mode": true, "teacher_id": "teacher-demo"}
```

Không trả internal token. Hai nút mô phỏng gọi server-only demo endpoints:

- `POST /demo/exams/{id}/simulate-first-submission`
- `POST /demo/exams/{id}/simulate-grading-completed`

Các endpoint chỉ tồn tại khi `demo_mode=True`; server tự thêm token và idempotency key.

- [ ] **Step 5: Tạo browser smoke script**

Playwright script phải:

1. Mở `/`.
2. Tạo đề.
3. Thêm một câu bank và một manual essay.
4. Thêm rubric/topic đủ điểm.
5. Drag manual essay lên đầu.
6. Validate và prepare.
7. Bấm Export, xác nhận download có đuôi `.docx`.
8. Mô phỏng first submission, xác nhận controls bị disabled.
9. Mô phỏng grading complete, xác nhận badge `done`.

Script kết thúc exit code `0`; timeout mỗi bước 10 giây và chụp screenshot vào thư mục temp khi lỗi.

- [ ] **Step 6: Chạy unit test và browser smoke**

Run terminal 1:

```powershell
python -m uvicorn create_exam_backend.app.main:app --host 127.0.0.1 --port 8130
```

Run terminal 2:

```powershell
python create_exam_backend/tests/browser_smoke.py
```

Expected: `Create exam browser smoke test passed`.

Run:

```powershell
python -m pytest create_exam_backend/tests/test_demo.py -v
python -m pytest create_exam_backend/tests -v
```

Expected: tất cả pass.

- [ ] **Step 7: Commit**

```powershell
git add create_exam_backend
git commit -m "feat(exams): add drag-and-drop authoring demo"
```

---

### Task 8: README, lint và kiểm chứng cuối

**Files:**

- Create: `create_exam_backend/README.md`
- Modify: các file `create_exam_backend/app/*.py` nếu Ruff phát hiện lỗi.
- Modify: các file `create_exam_backend/tests/*.py` nếu Ruff phát hiện lỗi.

**Interfaces:**

- Consumes: ứng dụng hoàn chỉnh.
- Produces: hướng dẫn chạy và evidence kiểm chứng.

- [ ] **Step 1: Viết README contract test trước**

Thêm vào `test_demo.py`:

```python
from pathlib import Path


def test_readme_documents_run_test_and_callback_commands():
    text = Path("create_exam_backend/README.md").read_text(encoding="utf-8")
    assert "python -m uvicorn create_exam_backend.app.main:app" in text
    assert "python -m pytest create_exam_backend/tests -v" in text
    assert "X-Internal-Token" in text
    assert "Idempotency-Key" in text
    assert "grading-completed" in text
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run:

```powershell
python -m pytest create_exam_backend/tests/test_demo.py::test_readme_documents_run_test_and_callback_commands -v
```

Expected: `FileNotFoundError` vì README chưa tồn tại.

- [ ] **Step 3: Viết README**

README phải ghi rõ:

- Python 3.11+.
- `python -m pip install -r create_exam_backend/requirements-dev.txt`.
- Bốn biến môi trường từ design spec.
- Uvicorn command.
- URL `/`, `/docs`, `/health`.
- Pytest và Playwright commands.
- API chính.
- Hai callback payload mẫu với đủ headers.
- State machine và quy tắc khóa.
- DOCX supported, PDF out of scope.
- Câu manual không được ghi ngược vào question bank.

- [ ] **Step 4: Chạy lint**

Run:

```powershell
python -m ruff check create_exam_backend
python -m ruff format --check create_exam_backend
```

Expected: cả hai exit code `0`, không warning.

- [ ] **Step 5: Chạy toàn bộ test**

Run:

```powershell
python -m pytest create_exam_backend/tests -v
```

Expected: tất cả tests pass, không warning/error.

- [ ] **Step 6: Chạy DOCX manual evidence**

Khởi động app với database temp, dùng demo tạo đề hợp lệ và tải DOCX. Mở file bằng `python-docx` trong một lệnh read-only để xác nhận số paragraph > 0 và document có `ĐÁP ÁN VÀ BAREM`.

- [ ] **Step 7: Chạy browser smoke lần cuối**

Run:

```powershell
python create_exam_backend/tests/browser_smoke.py
```

Expected: `Create exam browser smoke test passed`.

- [ ] **Step 8: Xác nhận không đụng frontend**

Run:

```powershell
git status --short -- frontend
git diff -- frontend
```

Expected: không có thay đổi do feature này tạo ra.

- [ ] **Step 9: Commit**

```powershell
git add create_exam_backend
git commit -m "docs(exams): document local workflow and integrations"
```

---

## Ma trận coverage

| Yêu cầu | Task kiểm chứng |
|---|---|
| FastAPI + SQLite độc lập | Task 1 |
| Ownership teacher | Task 2 |
| Optimistic locking | Task 2, 3, 4 |
| Câu ngân hàng snapshot | Task 3 |
| Câu nhập tay và topic | Task 3 |
| Kéo-thả/reorder | Task 3, 7 |
| Rubric item và topic | Task 4 |
| Tổng điểm đề/barem | Task 4 |
| Sửa ở preparing trước bài nộp | Task 4 |
| Snapshot và khóa sau bài đầu tiên | Task 5 |
| Done chỉ sau chấm đủ và có điểm | Task 5 |
| DOCX standard/compact | Task 6 |
| Demo không đụng frontend | Task 7, 8 |
| README integration contract | Task 8 |

## Definition of Done

- Tất cả bước RED đã được quan sát thất bại vì behavior còn thiếu.
- Mọi production behavior có automated test tương ứng.
- `python -m pytest create_exam_backend/tests -v` pass.
- Ruff check và format check pass.
- Browser smoke pass.
- DOCX được mở và đọc lại thành công bằng `python-docx`.
- `git diff -- frontend` không có thay đổi do module này.
- Không còn placeholder hoặc dead route trong `create_exam_backend`.
