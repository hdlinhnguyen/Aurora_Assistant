import json
import os
import re
from pathlib import Path
from tempfile import gettempdir

from playwright.sync_api import sync_playwright

FRONTEND_URL = os.environ.get("AURORA_SMOKE_FRONTEND_URL", "http://localhost:3000")
API_URL = os.environ.get("AURORA_SMOKE_API_URL", "http://localhost:8081/api")


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1680, "height": 900})
        login = page.request.post(
            f"{API_URL}/auth/login",
            data={"email": "synthetic.teacher@aurora.local", "password": "demo123"},
        ).json()
        subject = "Synthetic - To\u00e1n \u0111\u1ea1i s\u1ed1"
        page.add_init_script(
            f"""localStorage.setItem('aurora_token', {json.dumps(login['token'])});
            localStorage.setItem('aurora_user', JSON.stringify({json.dumps(login['user'])}));
            localStorage.setItem('aurora_teacher_subject', {json.dumps(subject)});
            localStorage.setItem('aurora_teacher_tab', 'students');"""
        )
        page.goto(f"{FRONTEND_URL}/teacher")
        page.wait_for_load_state("networkidle")
        student_email = page.get_by_text("synthetic.student.b@aurora.local", exact=True)
        student_email.wait_for()
        student_email.locator("xpath=ancestor::tr").click()
        page.get_by_text("synthetic.student.b@aurora.local", exact=True).wait_for()
        page.wait_for_timeout(1000)

        badges = page.get_by_text(re.compile(r"BKT \d+%"))
        badge_count = badges.count()
        if badge_count < 3:
            raise AssertionError(f"expected at least 3 BKT badges, found {badge_count}")

        screenshot = Path(gettempdir()) / "aurora-teacher-mastery-smoke.png"
        page.screenshot(path=str(screenshot), full_page=True)
        browser.close()
        print(f"teacher mastery smoke passed; badges={badge_count}; screenshot={screenshot}")


if __name__ == "__main__":
    main()
