def test_health_reports_ready_and_seed_counts(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "topics": 6,
        "question_bank_questions": 4,
    }


def test_exam_crud_requires_owner_and_expected_version(client, teacher_headers):
    created = client.post(
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
    assert created.status_code == 201
    exam = created.json()
    assert exam["status"] == "drafting"
    assert exam["version"] == 1

    assert client.get(f"/api/exams/{exam['exam_id']}").status_code == 401
    assert (
        client.get(
            f"/api/exams/{exam['exam_id']}",
            headers={"X-Teacher-Id": "teacher-other", "X-Role": "teacher"},
        ).status_code
        == 404
    )

    updated = client.patch(
        f"/api/exams/{exam['exam_id']}",
        headers=teacher_headers,
        json={"title": "Đề số 1", "expected_version": 1},
    )
    assert updated.status_code == 200
    assert updated.json()["version"] == 2

    stale = client.patch(
        f"/api/exams/{exam['exam_id']}",
        headers=teacher_headers,
        json={"title": "Bản cũ", "expected_version": 1},
    )
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "version_conflict"
    assert stale.json()["error"]["details"]["current_version"] == 2

    listed = client.get("/api/exams", headers=teacher_headers)
    assert [item["exam_id"] for item in listed.json()] == [exam["exam_id"]]
    client.post(
        "/api/exams",
        headers=teacher_headers,
        json={
            "title": "Đề tìm kiếm riêng",
            "subject_id": "math",
            "grade_level": 8,
            "duration_minutes": 45,
            "total_points": "10.00",
        },
    )
    searched = client.get("/api/exams?search=tìm kiếm riêng", headers=teacher_headers)
    assert [item["title"] for item in searched.json()] == ["Đề tìm kiếm riêng"]


def test_deletes_draft_exam_and_exposes_audit(client, teacher_headers):
    created = client.post(
        "/api/exams",
        headers=teacher_headers,
        json={
            "title": "Đề sẽ xóa",
            "subject_id": "math",
            "grade_level": 8,
            "duration_minutes": 15,
            "total_points": "10.00",
        },
    ).json()
    audit = client.get(
        f"/api/exams/{created['exam_id']}/audit", headers=teacher_headers
    )
    assert audit.status_code == 200
    assert audit.json()[0]["action"] == "exam_created"
    assert audit.json()[0]["new_value"]["status"] == "drafting"
    assert "new_value_json" not in audit.json()[0]

    deleted = client.delete(
        f"/api/exams/{created['exam_id']}",
        headers=teacher_headers,
        params={"expected_version": 1},
    )
    assert deleted.status_code == 204
    assert (
        client.get(
            f"/api/exams/{created['exam_id']}", headers=teacher_headers
        ).status_code
        == 404
    )


def test_rejects_wrong_role_and_extra_payload_fields(client, teacher_headers):
    wrong_role = client.post(
        "/api/exams",
        headers={"X-Teacher-Id": "teacher-demo", "X-Role": "student"},
        json={
            "title": "Không hợp lệ",
            "subject_id": "math",
            "grade_level": 8,
            "duration_minutes": 15,
        },
    )
    assert wrong_role.status_code == 403
    extra_field = client.post(
        "/api/exams",
        headers=teacher_headers,
        json={
            "title": "Không hợp lệ",
            "subject_id": "math",
            "grade_level": 8,
            "duration_minutes": 15,
            "unexpected": True,
        },
    )
    assert extra_field.status_code == 422
