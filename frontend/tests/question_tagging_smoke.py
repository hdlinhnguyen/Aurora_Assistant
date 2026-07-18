import os
from pathlib import Path
from tempfile import gettempdir

from playwright.sync_api import sync_playwright

FRONTEND_URL = os.environ.get("AURORA_SMOKE_FRONTEND_URL", "http://localhost:3000")
API_URL = os.environ.get("AURORA_SMOKE_API_URL", "http://localhost:8081/api")


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        console_errors: list[str] = []
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )

        page.goto(f"{FRONTEND_URL}/login")
        page.wait_for_load_state("networkidle")
        page.locator("button", has_text="synthetic.teacher@").click()
        try:
            page.wait_for_url("**/teacher", timeout=10_000)
        except Exception as error:
            body_text = page.locator("body").inner_text()
            raise AssertionError(
                f"teacher demo login did not navigate; url={page.url}; body={body_text}"
            ) from error
        page.wait_for_load_state("networkidle")

        selected_subject = page.evaluate(
            """
            async (apiUrl) => {
              const token = localStorage.getItem("aurora_token");
              const response = await fetch(`${apiUrl}/subjects`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!response.ok) throw new Error(`subjects ${response.status}`);
              const subjects = await response.json();
              for (const subject of subjects) {
                const questions = await fetch(
                  `${apiUrl}/teacher/question-bank/questions?subject=${encodeURIComponent(subject)}`,
                  { headers: { Authorization: `Bearer ${token}` } },
                );
                if (!questions.ok) throw new Error(`question bank ${questions.status}`);
                const payload = await questions.json();
                if (payload.length > 0) return subject;
              }
              return null;
            }
            """,
            API_URL,
        )
        if not selected_subject:
            raise AssertionError("teacher has no subject containing questions")

        page.evaluate(
            """(subject) => {
              localStorage.setItem("aurora_teacher_tab", "question-bank");
              localStorage.setItem("aurora_teacher_subject", subject);
            }""",
            selected_subject,
        )
        page.reload()
        page.wait_for_load_state("networkidle")

        tag_buttons = page.locator('button[title="Gắn topic thủ công"]')
        tag_buttons.first.wait_for()
        tag_buttons.first.click()

        page.get_by_text("Bản đồ kiến thức", exact=True).wait_for()
        page.get_by_text("Topic hiệu lực", exact=False).wait_for()
        checkboxes = page.locator('[role="checkbox"]')
        if checkboxes.count() == 0:
            raise AssertionError("tagging panel rendered no available topics")

        screenshot = Path(gettempdir()) / "aurora-question-tagging-smoke.png"
        page.screenshot(path=str(screenshot), full_page=True)
        if console_errors:
            raise AssertionError(f"browser console errors: {console_errors}")

        browser.close()
        print(f"question tagging smoke passed; screenshot={screenshot}")


if __name__ == "__main__":
    main()
