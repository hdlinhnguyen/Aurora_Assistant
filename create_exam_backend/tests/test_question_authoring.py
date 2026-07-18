def create_exam(client, headers):
    return client.post(
        "/api/exams",
        headers=headers,
        json={
            "title": "Đề Toán",
            "subject_id": "math",
            "grade_level": 8,
            "duration_minutes": 45,
            "total_points": "10.00",
        },
    ).json()


def test_adds_bank_snapshot_manual_question_and_reorders(client, teacher_headers):
    exam = create_exam(client, teacher_headers)
    bank = client.get(
        "/api/question-bank/questions?subject_id=math&grade_level=8",
        headers=teacher_headers,
    )
    assert bank.status_code == 200
    assert len(bank.json()) == 4
    probability = client.get(
        "/api/question-bank/questions?subject_id=math&grade_level=8&topic_id=topic-probability",
        headers=teacher_headers,
    )
    assert [item["question_id"] for item in probability.json()] == ["bank-math-4"]
    bank_detail = client.get(
        "/api/question-bank/questions/bank-math-1",
        headers=teacher_headers,
    )
    assert bank_detail.status_code == 200
    assert bank_detail.json()["correct_choice_id"] == "b"

    first = client.post(
        f"/api/exams/{exam['exam_id']}/questions/from-bank",
        headers=teacher_headers,
        json={
            "question_id": "bank-math-1",
            "points": "2.00",
            "expected_version": 1,
        },
    )
    assert first.status_code == 201
    assert first.json()["source_type"] == "question_bank"

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
    assert manual.json()["position"] == 2
    assert manual.json()["exam_version"] == 3

    invalid = client.put(
        f"/api/exams/{exam['exam_id']}/questions/reorder",
        headers=teacher_headers,
        json={
            "exam_question_ids": [manual.json()["exam_question_id"]],
            "expected_version": 3,
        },
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "invalid_reorder"

    reordered = client.put(
        f"/api/exams/{exam['exam_id']}/questions/reorder",
        headers=teacher_headers,
        json={
            "exam_question_ids": [
                manual.json()["exam_question_id"],
                first.json()["exam_question_id"],
            ],
            "expected_version": 3,
        },
    )
    assert reordered.status_code == 200
    assert [q["exam_question_id"] for q in reordered.json()["questions"]] == [
        manual.json()["exam_question_id"],
        first.json()["exam_question_id"],
    ]
    assert reordered.json()["version"] == 4
    audit = client.get(
        f"/api/exams/{exam['exam_id']}/audit", headers=teacher_headers
    ).json()
    assert "questions_reordered" in {item["action"] for item in audit}


def test_rejects_manual_question_with_topic_from_another_subject(
    client, teacher_headers
):
    exam = create_exam(client, teacher_headers)
    response = client.post(
        f"/api/exams/{exam['exam_id']}/questions/manual",
        headers=teacher_headers,
        json={
            "question_type": "essay",
            "content": "Trình bày lời giải.",
            "points": "2.00",
            "topic_ids": ["topic-writing"],
            "expected_version": 1,
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "topic_not_allowed"


def test_rejects_invalid_answer_patch_and_bank_topic_edit(client, teacher_headers):
    exam = create_exam(client, teacher_headers)
    manual = client.post(
        f"/api/exams/{exam['exam_id']}/questions/manual",
        headers=teacher_headers,
        json={
            "question_type": "single_choice",
            "content": "Chọn đáp án.",
            "points": "2.00",
            "topic_ids": ["topic-linear-equations"],
            "choices": [
                {"choice_id": "a", "content": "A"},
                {"choice_id": "b", "content": "B"},
            ],
            "correct_choice_id": "a",
            "expected_version": 1,
        },
    ).json()
    invalid_answer = client.patch(
        f"/api/exams/{exam['exam_id']}/questions/{manual['exam_question_id']}",
        headers=teacher_headers,
        json={"correct_choice_id": "missing", "expected_version": 2},
    )
    assert invalid_answer.status_code == 422
    assert invalid_answer.json()["error"]["code"] == "invalid_choice_set"

    bank = client.post(
        f"/api/exams/{exam['exam_id']}/questions/from-bank",
        headers=teacher_headers,
        json={
            "question_id": "bank-math-1",
            "points": "2.00",
            "expected_version": 2,
        },
    ).json()
    immutable = client.patch(
        f"/api/exams/{exam['exam_id']}/questions/{bank['exam_question_id']}",
        headers=teacher_headers,
        json={
            "topic_ids": ["topic-fractions"],
            "expected_version": 3,
        },
    )
    assert immutable.status_code == 409
    assert immutable.json()["error"]["code"] == "bank_topics_immutable"


def test_rejects_choices_on_essay_patch(client, teacher_headers):
    exam = create_exam(client, teacher_headers)
    essay = client.post(
        f"/api/exams/{exam['exam_id']}/questions/manual",
        headers=teacher_headers,
        json={
            "question_type": "essay",
            "content": "Trình bày lời giải.",
            "points": "2.00",
            "topic_ids": ["topic-linear-equations"],
            "expected_version": 1,
        },
    ).json()
    response = client.patch(
        f"/api/exams/{exam['exam_id']}/questions/{essay['exam_question_id']}",
        headers=teacher_headers,
        json={
            "choices": [
                {"choice_id": "a", "content": "A"},
                {"choice_id": "b", "content": "B"},
            ],
            "correct_choice_id": "a",
            "expected_version": 2,
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "essay_choices_not_allowed"
