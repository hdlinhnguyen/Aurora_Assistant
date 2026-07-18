"""Playwright smoke test for the embedded backend demo."""

import json
import os
from io import BytesIO

from PIL import Image, ImageDraw
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.getenv("DEMO_BASE_URL", "http://127.0.0.1:8877")
SCREENSHOT_PATH = os.getenv("DEMO_SCREENSHOT_PATH")


def sample_image() -> bytes:
    image = Image.new("RGB", (900, 1200), "white")
    draw = ImageDraw.Draw(image)
    draw.text((100, 180), "1/2 = 2/4", fill="black")
    draw.text((100, 280), "2/4 + 1/4 = 3/4", fill="black")
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def wait_until_ready(page) -> None:
    try:
        page.locator("#status").get_by_text("Sẵn sàng để giảng viên duyệt.").wait_for(
            timeout=15_000
        )
    except PlaywrightTimeoutError:
        raise AssertionError(
            "Demo did not reach review state. "
            f"status={page.locator('#status').inner_text()!r}; "
            f"output={page.locator('#output').inner_text()!r}"
        ) from None


def wait_until_manual_approved(page) -> None:
    try:
        page.locator("#status").get_by_text(
            "Đã phê duyệt 2 câu. Tổng điểm: 4/5."
        ).wait_for(timeout=10_000)
    except PlaywrightTimeoutError:
        raise AssertionError(
            "Manual grading did not complete. "
            f"status={page.locator('#status').inner_text()!r}; "
            f"output={page.locator('#output').inner_text()!r}"
        ) from None


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    console_errors: list[str] = []
    page_errors: list[str] = []
    page.on(
        "console",
        lambda message: (
            console_errors.append(message.text) if message.type == "error" else None
        ),
    )
    page.on("pageerror", lambda error: page_errors.append(str(error)))

    page.goto(f"{BASE_URL}/demo")
    page.wait_for_load_state("networkidle")
    assert page.locator("#mode").input_value() == "full_manual"
    assert page.locator("#upload-panel").is_hidden()
    assert page.locator(".manual-rubric-checkbox").count() == 4
    page.locator("#student").select_option("student-an")
    page.locator('[data-rubric="q1-r1"]').check()
    page.locator('[data-rubric="q1-r2"]').check()
    page.locator('[data-rubric="q2-r2"]').check()
    assert page.locator("#score-live").inner_text() == "4 / 5"
    if SCREENSHOT_PATH:
        page.screenshot(path=SCREENSHOT_PATH, full_page=True)
    page.locator("#approve-manual").click()
    wait_until_manual_approved(page)
    manual_output = json.loads(page.locator("#output").inner_text())
    assert manual_output["score"] == 4
    assert len(manual_output["approved_questions"]) == 2
    assert all(item["version"] == 1 for item in manual_output["approved_questions"])

    page.goto(f"{BASE_URL}/demo")
    page.wait_for_load_state("networkidle")
    assert page.locator("#mode").input_value() == "full_manual"
    page.locator("#student").select_option("student-binh")
    page.locator("#mode").select_option("ai_assisted")
    assert page.locator("#upload-panel").is_visible()
    assert page.locator("#manual-workspace").is_hidden()
    page.locator("#file").set_input_files(
        {
            "name": "answer.png",
            "mimeType": "image/png",
            "buffer": sample_image(),
        }
    )
    page.locator("#run").click()
    wait_until_ready(page)
    assert page.locator("#preview img").count() == 1
    rubrics = page.locator(".rubric")
    assert rubrics.count() == 2
    for index in range(rubrics.count()):
        rubrics.nth(index).get_by_role("button", name="Đúng").click()
    page.locator("#review > button").click()
    page.locator("#status").get_by_text("Đã phê duyệt version 1.").wait_for(
        timeout=10_000
    )
    assert '"mapping_method": "ai_reviewed"' in page.locator("#output").inner_text()

    assert not console_errors, console_errors
    assert not page_errors, page_errors
    print("PLAYWRIGHT_DEMO_E2E=PASS")
    browser.close()
