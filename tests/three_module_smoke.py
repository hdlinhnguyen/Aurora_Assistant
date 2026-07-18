from playwright.sync_api import sync_playwright
from uuid import uuid4


FRONTEND = "http://localhost:3000"
API = "http://localhost:8081/api"


def expect_ok(response, label):
    if not response.ok:
        raise AssertionError(f"{label}: {response.status} {response.text()}")
    return response.json()


def main():
    run_id = uuid4().hex[:10]
    exam_title = f"Smoke exam {run_id}"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"{FRONTEND}/login", wait_until="networkidle")
        page.locator("input[type=email]").fill("teacher@aurora.edu.vn")
        page.locator("input[type=password]").fill("demo123")
        page.locator("form button[type=submit]").click()
        page.wait_for_timeout(2500)
        if not page.url.endswith("/teacher"):
            raise AssertionError(f"teacher login did not navigate: {page.url}")
        page.wait_for_load_state("networkidle")

        token = page.evaluate("localStorage.getItem('aurora_token')")
        if not token:
            raise AssertionError("teacher login did not persist a token")
        headers = {"Authorization": f"Bearer {token}"}

        # Question tagging flow: read context and write the existing legacy topic.
        questions = expect_ok(
            page.request.get(f"{API}/teacher/question-bank/questions", headers=headers),
            "question bank",
        )
        question = (questions if isinstance(questions, list) else questions["items"])[0]
        context = expect_ok(
            page.request.get(
                f"{API}/teacher/question-bank/questions/{question['id']}/tagging-context",
                headers=headers,
            ),
            "tagging context",
        )
        topic_ids = context["directTopicIds"]
        expect_ok(
            page.request.put(
                f"{API}/teacher/question-bank/questions/{question['id']}/topics",
                headers={**headers, "Content-Type": "application/json"},
                data={"topicIds": topic_ids, "expectedVersion": context["version"]},
            ),
            "tagging update",
        )

        # The minimal teacher UI exposes both new workspaces.
        page.get_by_role("button", name="Tạo đề kiểm tra").click()
        page.get_by_placeholder("Tên đề").fill(exam_title)
        page.get_by_role("button", name="Tạo đề nháp").click()
        page.get_by_text(exam_title).first.wait_for()

        exams = expect_ok(page.request.get(f"{API}/teacher/exams", headers=headers), "exam list")
        exam = next(item for item in exams if item["title"] == exam_title)
        detail = expect_ok(
            page.request.post(
                f"{API}/teacher/exams/{exam['id']}/questions/manual",
                headers={**headers, "Content-Type": "application/json"},
                data={
                    "questionType": "single_choice",
                    "content": "Smoke question",
                    "points": "10.00",
                    "topicNodeIds": topic_ids,
                    "choices": [
                        {"choiceId": "a", "content": "A"},
                        {"choiceId": "b", "content": "B"},
                    ],
                    "correctChoiceId": "a",
                    "expectedVersion": exam["version"],
                },
            ),
            "manual exam question",
        )
        validated = expect_ok(
            page.request.post(
                f"{API}/teacher/exams/{exam['id']}/validate",
                headers=headers,
            ),
            "exam validation",
        )
        if validated.get("valid") is False:
            raise AssertionError(f"exam validation failed: {validated}")
        prepared = expect_ok(
            page.request.post(
                f"{API}/teacher/exams/{exam['id']}/prepare",
                headers={**headers, "Content-Type": "application/json"},
                data={"expectedVersion": detail["version"]},
            ),
            "exam prepare",
        )

        # Scoring flow: create one-student batch, score, approve, and verify done.
        students = expect_ok(
            page.request.get(f"{API}/teacher/scoring/students", headers=headers),
            "student list",
        )
        student = (students if isinstance(students, list) else students["items"])[0]
        batch = expect_ok(
            page.request.post(
                f"{API}/teacher/grading-batches",
                headers={
                    **headers,
                    "Content-Type": "application/json",
                    "Idempotency-Key": f"three-module-smoke-batch-{run_id}",
                },
                data={
                    "examId": exam["id"],
                    "studentIds": [student["id"]],
                    "expectedExamVersion": prepared["version"],
                },
            ),
            "grading batch",
        )
        submission = batch["submissions"][0]
        submission_detail = expect_ok(
            page.request.get(
                f"{API}/teacher/scoring-submissions/{submission['id']}",
                headers=headers,
            ),
            "submission",
        )
        result = submission_detail["questions"][0]
        scored = expect_ok(
            page.request.put(
                f"{API}/teacher/scoring-submissions/{submission['id']}/questions/{result['examQuestionId']}",
                headers={**headers, "Content-Type": "application/json"},
                data={"status": "correct", "expectedVersion": submission_detail["version"]},
            ),
            "score result",
        )
        approved = expect_ok(
            page.request.post(
                f"{API}/teacher/scoring-submissions/{submission['id']}/approve",
                headers={
                    **headers,
                    "Content-Type": "application/json",
                    "Idempotency-Key": f"three-module-smoke-approve-{run_id}",
                },
                data={"expectedVersion": scored["version"]},
            ),
            "approve submission",
        )
        if approved["status"] != "approved":
            raise AssertionError(f"submission was not approved: {approved}")
        final_exam = expect_ok(
            page.request.get(f"{API}/teacher/exams/{exam['id']}", headers=headers),
            "final exam",
        )
        if final_exam["status"] != "done":
            raise AssertionError(f"exam did not reach done: {final_exam}")
        page.get_by_role("button", name="Chấm bài kiểm tra").click()
        page.get_by_text("Chấm bài kiểm tra").first.wait_for()
        print("Three-module frontend/backend smoke passed")
        browser.close()


if __name__ == "__main__":
    main()
