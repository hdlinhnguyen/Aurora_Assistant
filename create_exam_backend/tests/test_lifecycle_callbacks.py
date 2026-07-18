from test_rubric_and_validation import make_essay_exam


def prepared_exam(client, headers):
    exam, question = make_essay_exam(client, headers)
    version = 2
    for points in ("4.00", "6.00"):
        response = client.post(
            f"/api/exams/{exam['exam_id']}/questions/{question['exam_question_id']}/rubric-items",
            headers=headers,
            json={
                "description": f"Ý {points}",
                "points": points,
                "topic_ids": ["topic-linear-equations"],
                "expected_version": version,
            },
        )
        version = response.json()["exam_version"]
    return client.post(
        f"/api/exams/{exam['exam_id']}/prepare",
        headers=headers,
        json={"expected_version": version},
    ).json()


def test_first_submission_locks_and_grading_callback_alone_marks_done(
    client, teacher_headers
):
    exam = prepared_exam(client, teacher_headers)
    first_headers = {
        "X-Internal-Token": "test-internal-token",
        "Idempotency-Key": "first-1",
    }
    first = client.post(
        f"/internal/exams/{exam['exam_id']}/first-submission",
        headers=first_headers,
        json={"total_submissions": 30},
    )
    assert first.status_code == 200
    assert first.json()["locked"] is True
    assert (
        client.patch(
            f"/api/exams/{exam['exam_id']}",
            headers=teacher_headers,
            json={"title": "Không được sửa", "expected_version": exam["version"]},
        ).json()["error"]["code"]
        == "exam_locked"
    )
    assert (
        client.post(
            f"/internal/exams/{exam['exam_id']}/first-submission",
            headers=first_headers,
            json={"total_submissions": 30},
        ).json()
        == first.json()
    )

    partial = client.post(
        f"/internal/exams/{exam['exam_id']}/grading-completed",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "grading-1",
        },
        json={
            "total_submissions": 30,
            "graded_submissions": 30,
            "scored_submissions": 29,
        },
    )
    assert partial.json()["status"] == "preparing_exam"

    completed = client.post(
        f"/internal/exams/{exam['exam_id']}/grading-completed",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "grading-2",
        },
        json={
            "total_submissions": 30,
            "graded_submissions": 30,
            "scored_submissions": 30,
        },
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "done"
    audit = client.get(
        f"/api/exams/{exam['exam_id']}/audit", headers=teacher_headers
    ).json()
    assert {"first_submission_received", "grading_completed"} <= {
        item["action"] for item in audit
    }


def test_internal_callback_rejects_wrong_token(client, teacher_headers):
    exam = prepared_exam(client, teacher_headers)
    response = client.post(
        f"/internal/exams/{exam['exam_id']}/first-submission",
        headers={
            "X-Internal-Token": "wrong",
            "Idempotency-Key": "first-2",
        },
        json={"total_submissions": 1},
    )
    assert response.status_code == 401


def test_first_submission_cannot_create_second_lock_snapshot(client, teacher_headers):
    exam = prepared_exam(client, teacher_headers)
    first = client.post(
        f"/internal/exams/{exam['exam_id']}/first-submission",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "lock-a",
        },
        json={"total_submissions": 1},
    )
    assert first.status_code == 200
    second = client.post(
        f"/internal/exams/{exam['exam_id']}/first-submission",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "lock-b",
        },
        json={"total_submissions": 1},
    )
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "exam_locked"
    database = client.app.state.database
    with database.connect() as connection:
        count = connection.execute(
            """SELECT COUNT(*) FROM exam_snapshots
               WHERE exam_id = ? AND purpose = 'grading_lock'""",
            (exam["exam_id"],),
        ).fetchone()[0]
    assert count == 1


def test_callback_rejects_invalid_counts_and_updates_after_done(
    client, teacher_headers
):
    exam = prepared_exam(client, teacher_headers)
    client.post(
        f"/internal/exams/{exam['exam_id']}/first-submission",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "counts-lock",
        },
        json={"total_submissions": 2},
    )
    invalid = client.post(
        f"/internal/exams/{exam['exam_id']}/grading-completed",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "counts-invalid",
        },
        json={
            "total_submissions": 2,
            "graded_submissions": 1,
            "scored_submissions": 2,
        },
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "invalid_grading_counts"

    completed = client.post(
        f"/internal/exams/{exam['exam_id']}/grading-completed",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "counts-complete",
        },
        json={
            "total_submissions": 2,
            "graded_submissions": 2,
            "scored_submissions": 2,
        },
    )
    assert completed.json()["status"] == "done"
    after_done = client.post(
        f"/internal/exams/{exam['exam_id']}/grading-completed",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "counts-late",
        },
        json={
            "total_submissions": 2,
            "graded_submissions": 1,
            "scored_submissions": 1,
        },
    )
    assert after_done.status_code == 409
    assert after_done.json()["error"]["code"] == "exam_done"


def test_idempotency_key_conflicts_on_changed_payload_or_other_exam(
    client, teacher_headers
):
    first_exam = prepared_exam(client, teacher_headers)
    second_exam = prepared_exam(client, teacher_headers)
    headers = {
        "X-Internal-Token": "test-internal-token",
        "Idempotency-Key": "shared-lock-key",
    }
    assert (
        client.post(
            f"/internal/exams/{first_exam['exam_id']}/first-submission",
            headers=headers,
            json={"total_submissions": 2},
        ).status_code
        == 200
    )
    changed = client.post(
        f"/internal/exams/{first_exam['exam_id']}/first-submission",
        headers=headers,
        json={"total_submissions": 3},
    )
    assert changed.status_code == 409
    assert changed.json()["error"]["code"] == "idempotency_conflict"
    other_exam = client.post(
        f"/internal/exams/{second_exam['exam_id']}/first-submission",
        headers=headers,
        json={"total_submissions": 2},
    )
    assert other_exam.status_code == 409
    assert other_exam.json()["error"]["code"] == "idempotency_conflict"


def test_callbacks_require_preparing_state_and_consistent_submission_total(
    client, teacher_headers
):
    draft, _question = make_essay_exam(client, teacher_headers)
    before_prepare = client.post(
        f"/internal/exams/{draft['exam_id']}/first-submission",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "draft-lock",
        },
        json={"total_submissions": 2},
    )
    assert before_prepare.status_code == 409
    assert before_prepare.json()["error"]["code"] == "invalid_transition"

    exam = prepared_exam(client, teacher_headers)
    client.post(
        f"/internal/exams/{exam['exam_id']}/first-submission",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "total-lock",
        },
        json={"total_submissions": 2},
    )
    changed_total = client.post(
        f"/internal/exams/{exam['exam_id']}/grading-completed",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "total-changed",
        },
        json={
            "total_submissions": 3,
            "graded_submissions": 1,
            "scored_submissions": 1,
        },
    )
    assert changed_total.status_code == 409
    assert changed_total.json()["error"]["code"] == "submission_count_conflict"

    add_after_lock = client.post(
        f"/api/exams/{exam['exam_id']}/questions/manual",
        headers=teacher_headers,
        json={
            "question_type": "essay",
            "content": "Không được thêm.",
            "points": "1.00",
            "topic_ids": ["topic-linear-equations"],
            "expected_version": exam["version"],
        },
    )
    assert add_after_lock.status_code == 409
    assert add_after_lock.json()["error"]["code"] == "exam_locked"
    return_after_lock = client.post(
        f"/api/exams/{exam['exam_id']}/return-to-draft",
        headers=teacher_headers,
        json={"expected_version": exam["version"]},
    )
    assert return_after_lock.status_code == 409
    assert return_after_lock.json()["error"]["code"] == "exam_locked"


def test_grading_progress_cannot_move_backwards(client, teacher_headers):
    exam = prepared_exam(client, teacher_headers)
    client.post(
        f"/internal/exams/{exam['exam_id']}/first-submission",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "progress-lock",
        },
        json={"total_submissions": 3},
    )
    progress = client.post(
        f"/internal/exams/{exam['exam_id']}/grading-completed",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "progress-two",
        },
        json={
            "total_submissions": 3,
            "graded_submissions": 2,
            "scored_submissions": 2,
        },
    )
    assert progress.status_code == 200
    regression = client.post(
        f"/internal/exams/{exam['exam_id']}/grading-completed",
        headers={
            "X-Internal-Token": "test-internal-token",
            "Idempotency-Key": "progress-one",
        },
        json={
            "total_submissions": 3,
            "graded_submissions": 1,
            "scored_submissions": 1,
        },
    )
    assert regression.status_code == 409
    assert regression.json()["error"]["code"] == "grading_progress_regression"
