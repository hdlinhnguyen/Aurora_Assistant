from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


def main() -> None:
    console_errors: list[str] = []
    screenshot_path = Path(tempfile.gettempdir()) / "aurora-question-tagging-demo.png"
    base_url = os.environ.get("TAGGING_DEMO_URL", "http://127.0.0.1:8123")

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(5000)
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.goto(base_url)
        page.wait_for_load_state("networkidle")
        page.locator("#question-select").select_option("q-essay-1")
        page.wait_for_load_state("networkidle")

        page.evaluate(
            """
            state.context.available_topics[0].name =
              '<img id="xss-probe" src="missing" onerror="window.xssRan=true">';
            render();
            """
        )
        assert page.locator("#xss-probe").count() == 0
        assert page.evaluate("window.xssRan") is None
        awaitable_context = page.locator("#question-select")
        awaitable_context.select_option("q-mcq-1")
        page.wait_for_load_state("networkidle")
        awaitable_context.select_option("q-essay-1")
        page.wait_for_load_state("networkidle")

        direct_list = page.locator('[data-scope-list="direct"]')
        add_direct = direct_list.locator('[data-add-scope="direct"]')
        assert direct_list.locator("[data-selected-topic]").count() == 0
        assert add_direct.inner_text() == "+ Thêm tag cho câu hỏi"
        assert direct_list.locator(":scope > *").last.get_attribute("data-add-scope") == "direct"

        add_direct.click()
        picker = page.locator("[data-tag-picker]")
        picker.wait_for()
        page.keyboard.press("Escape")
        picker.wait_for(state="detached")

        add_direct.click()
        picker.wait_for()
        picker.locator("[data-tag-search]").fill("Phân số")
        picker.locator('[data-pick-topic="topic-fractions"]').click()
        direct_list.locator('[data-selected-topic="topic-fractions"]').wait_for()
        assert direct_list.locator(":scope > *").last.get_attribute("data-add-scope") == "direct"

        add_direct = direct_list.locator('[data-add-scope="direct"]')
        add_direct.click()
        assert picker.locator('[data-pick-topic="topic-fractions"]').count() == 0
        picker.locator("[data-tag-search]").fill("Phương trình")
        picker.locator('[data-pick-topic="topic-equations"]').click()
        direct_equation = direct_list.locator(
            '[data-selected-topic="topic-equations"]'
        )
        direct_equation.wait_for()
        direct_list.locator(
            '[data-remove-topic="topic-equations"][data-scope="direct"]'
        ).click()
        direct_equation.wait_for(state="detached")

        rubric_list = page.locator('[data-scope-list="r-essay-1"]')
        rubric_list.locator('[data-add-scope="r-essay-1"]').click()
        picker.locator("[data-tag-search]").fill("Phương trình")
        picker.locator('[data-pick-topic="topic-equations"]').click()
        rubric_list.locator(
            '[data-selected-topic="topic-equations"]'
        ).wait_for()
        assert (
            rubric_list.locator(":scope > *").last.get_attribute("data-add-scope")
            == "r-essay-1"
        )

        topic_library = page.locator("[data-topic-library]")
        topic_library.wait_for()
        assert topic_library.locator('[data-topic-folder="6"]').count() == 1
        assert topic_library.locator('[data-topic-folder="7"]').count() == 1
        assert topic_library.locator('[data-topic-folder="8"]').count() == 1

        second_rubric_list = page.locator('[data-scope-list="r-essay-2"]')
        topic_library.locator(
            '[data-drag-topic="topic-polynomials"]'
        ).drag_to(second_rubric_list)
        second_rubric_list.locator(
            '[data-selected-topic="topic-polynomials"]'
        ).wait_for()
        assert (
            second_rubric_list.locator(":scope > *")
            .last.get_attribute("data-add-scope")
            == "r-essay-2"
        )

        effective_text = page.locator("#effective-topics").inner_text()
        assert "Phân số và phân thức" in effective_text
        assert "Phương trình bậc nhất" in effective_text
        assert "Đa thức" in effective_text
        assert not console_errors, console_errors

        page.screenshot(path=str(screenshot_path), full_page=True)
        result = {
            "version": page.locator("#version").inner_text(),
            "effective_topics": effective_text.splitlines(),
            "screenshot": str(screenshot_path),
            "console_errors": console_errors,
        }
        print(json.dumps(result))
        browser.close()


if __name__ == "__main__":
    main()
