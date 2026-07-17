def make_essay_exam(client, headers):
    exam = client.post(
        "/api/exams",
        headers=headers,
        json={
            "title": "Đề tự luận",
            "subject_id": "math",
            "grade_level": 8,
            "duration_minutes": 45,
            "total_points": "10.00",
        },
    ).json()
    question = client.post(
        f"/api/exams/{exam['exam_id']}/questions/manual",
        headers=headers,
        json={
            "question_type": "essay",
            "content": "Giải và trình bày phương trình.",
            "points": "10.00",
            "topic_ids": ["topic-linear-equations"],
            "expected_version": 1,
        },
    ).json()
    return exam, question


def test_rubric_validation_and_prepare_lifecycle(client, teacher_headers):
    exam, question = make_essay_exam(client, teacher_headers)
    invalid = client.post(
        f"/api/exams/{exam['exam_id']}/validate", headers=teacher_headers
    )
    assert invalid.json()["valid"] is False
    assert {e["code"] for e in invalid.json()["errors"]} == {"rubric_incomplete"}

    first = client.post(
        f"/api/exams/{exam['exam_id']}/questions/{question['exam_question_id']}/rubric-items",
        headers=teacher_headers,
        json={
            "description": "Biến đổi đúng",
            "points": "4.00",
            "topic_ids": ["topic-linear-equations"],
            "expected_version": 2,
        },
    )
    assert first.status_code == 201
    second = client.post(
        f"/api/exams/{exam['exam_id']}/questions/{question['exam_question_id']}/rubric-items",
        headers=teacher_headers,
        json={
            "description": "Kết luận đúng",
            "points": "6.00",
            "topic_ids": ["topic-linear-equations"],
            "expected_version": 3,
        },
    )
    assert second.status_code == 201

    valid = client.post(
        f"/api/exams/{exam['exam_id']}/validate", headers=teacher_headers
    )
    assert valid.json() == {"valid": True, "errors": []}

    prepared = client.post(
        f"/api/exams/{exam['exam_id']}/prepare",
        headers=teacher_headers,
        json={"expected_version": 4},
    )
    assert prepared.status_code == 200
    assert prepared.json()["status"] == "preparing_exam"
    assert prepared.json()["version"] == 5

    edited = client.patch(
        f"/api/exams/{exam['exam_id']}",
        headers=teacher_headers,
        json={"title": "Đề đã chỉnh", "expected_version": 5},
    )
    assert edited.status_code == 200

    repeated_prepare = client.post(
        f"/api/exams/{exam['exam_id']}/prepare",
        headers=teacher_headers,
        json={"expected_version": 6},
    )
    assert repeated_prepare.status_code == 409
    assert repeated_prepare.json()["error"]["code"] == "invalid_transition"

    returned = client.post(
        f"/api/exams/{exam['exam_id']}/return-to-draft",
        headers=teacher_headers,
        json={"expected_version": 6},
    )
    assert returned.status_code == 200
    assert returned.json()["status"] == "drafting"


def test_invalid_exam_and_invalid_transition_are_rejected(client, teacher_headers):
    exam, _question = make_essay_exam(client, teacher_headers)
    prepare = client.post(
        f"/api/exams/{exam['exam_id']}/prepare",
        headers=teacher_headers,
        json={"expected_version": 2},
    )
    assert prepare.status_code == 409
    assert prepare.json()["error"]["code"] == "exam_invalid"
    back_to_draft = client.post(
        f"/api/exams/{exam['exam_id']}/return-to-draft",
        headers=teacher_headers,
        json={"expected_version": 2},
    )
    assert back_to_draft.status_code == 409
    assert back_to_draft.json()["error"]["code"] == "invalid_transition"
