from playwright.sync_api import sync_playwright


def login(page):
    page.goto("http://localhost:3000/login", wait_until="networkidle")
    page.locator("input[type=email]").fill("teacher@aurora.edu.vn")
    page.locator("input[type=password]").fill("demo123")
    page.locator("form button[type=submit]").click()
    page.wait_for_url("**/teacher")


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        login(page)

        page.locator("button:has(svg.lucide-file-pen-line)").click()
        exam_workspace = page.get_by_test_id("exam-workspace")
        exam_workspace.wait_for()
        assert exam_workspace.locator("aside").count() == 2
        assert exam_workspace.locator("main").count() == 1
        action = exam_workspace.locator("button:not(:disabled)").first
        assert action.evaluate("element => getComputedStyle(element).cursor") == "pointer"
        before = action.evaluate("element => getComputedStyle(element).transform")
        action.hover()
        page.wait_for_timeout(180)
        after = action.evaluate("element => getComputedStyle(element).transform")
        assert before != after
        exam_workspace.locator("aside").first.locator("button").nth(1).click()
        page.wait_for_timeout(700)
        assert exam_workspace.locator("aside").nth(1).locator("button").count() > 0

        page.locator("button:has(svg.lucide-clipboard-check)").first.click()
        scoring_workspace = page.get_by_test_id("scoring-workspace")
        scoring_workspace.wait_for()
        page.get_by_test_id("scoring-exam-step").wait_for()
        page.get_by_test_id("scoring-student-step").wait_for()
        assert page.get_by_test_id("scoring-grading-step").get_attribute("aria-disabled") == "true"
        assert scoring_workspace.locator("aside").count() == 2
        assert scoring_workspace.locator("main").count() == 1
        exam_step = page.get_by_test_id("scoring-exam-step")
        if exam_step.locator("button").count() > 0:
            exam_step.locator("button").first.click()
            page.wait_for_timeout(700)
            student_step = page.get_by_test_id("scoring-student-step")
            if student_step.locator("button").count() > 0:
                student_step.locator("button").first.click()
                page.wait_for_timeout(700)
                assert page.get_by_test_id("scoring-grading-step").get_attribute("aria-disabled") == "false"
        browser.close()
        print("Exam workspace UI smoke passed")


if __name__ == "__main__":
    main()
