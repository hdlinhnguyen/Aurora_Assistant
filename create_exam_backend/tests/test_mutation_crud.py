from test_rubric_and_validation import make_essay_exam


def test_edits_and_deletes_manual_question_and_rubrics(client, teacher_headers):
    exam, question = make_essay_exam(client, teacher_headers)
    first = client.post(
        f"/api/exams/{exam['exam_id']}/questions/{question['exam_question_id']}/rubric-items",
        headers=teacher_headers,
        json={
            "description": "Ý đầu",
            "points": "4.00",
            "topic_ids": ["topic-linear-equations"],
            "expected_version": 2,
        },
    ).json()
    second = client.post(
        f"/api/exams/{exam['exam_id']}/questions/{question['exam_question_id']}/rubric-items",
        headers=teacher_headers,
        json={
            "description": "Ý sau",
            "points": "6.00",
            "topic_ids": ["topic-linear-equations"],
            "expected_version": 3,
        },
    ).json()

    invalid_topic = client.patch(
        f"/api/exams/{exam['exam_id']}/questions/{question['exam_question_id']}/rubric-items/{first['rubric_item_id']}",
        headers=teacher_headers,
        json={
            "topic_ids": ["topic-writing"],
            "expected_version": 4,
        },
    )
    assert invalid_topic.status_code == 422
    assert invalid_topic.json()["error"]["code"] == "topic_not_allowed"

    patched_rubric = client.patch(
        f"/api/exams/{exam['exam_id']}/questions/{question['exam_question_id']}/rubric-items/{first['rubric_item_id']}",
        headers=teacher_headers,
        json={
            "description": "Ý đầu đã sửa",
            "expected_version": 4,
        },
    )
    assert patched_rubric.status_code == 200
    assert patched_rubric.json()["description"] == "Ý đầu đã sửa"

    invalid_reorder = client.put(
        f"/api/exams/{exam['exam_id']}/questions/{question['exam_question_id']}/rubric-items/reorder",
        headers=teacher_headers,
        json={
            "rubric_item_ids": [first["rubric_item_id"]],
            "expected_version": 5,
        },
    )
    assert invalid_reorder.status_code == 422
    assert invalid_reorder.json()["error"]["code"] == "invalid_reorder"

    reordered = client.put(
        f"/api/exams/{exam['exam_id']}/questions/{question['exam_question_id']}/rubric-items/reorder",
        headers=teacher_headers,
        json={
            "rubric_item_ids": [
                second["rubric_item_id"],
                first["rubric_item_id"],
            ],
            "expected_version": 5,
        },
    )
    assert reordered.status_code == 200
    assert (
        reordered.json()["rubric_items"][0]["rubric_item_id"]
        == second["rubric_item_id"]
    )

    patched = client.patch(
        f"/api/exams/{exam['exam_id']}/questions/{question['exam_question_id']}",
        headers=teacher_headers,
        json={
            "content": "Nội dung đã sửa",
            "points": "9.00",
            "expected_version": 6,
        },
    )
    assert patched.status_code == 200
    assert patched.json()["content"] == "Nội dung đã sửa"

    deleted_rubric = client.delete(
        f"/api/exams/{exam['exam_id']}/questions/{question['exam_question_id']}/rubric-items/{first['rubric_item_id']}",
        headers=teacher_headers,
        params={"expected_version": 7},
    )
    assert deleted_rubric.status_code == 204

    deleted_question = client.delete(
        f"/api/exams/{exam['exam_id']}/questions/{question['exam_question_id']}",
        headers=teacher_headers,
        params={"expected_version": 8},
    )
    assert deleted_question.status_code == 204
