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
    created_by TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS idx_questions_position ON exam_questions(exam_id, position);
CREATE INDEX IF NOT EXISTS idx_rubric_position ON rubric_items(exam_question_id, position);
