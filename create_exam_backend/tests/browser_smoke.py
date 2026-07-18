import os
from pathlib import Path
import tempfile

from playwright.sync_api import sync_playwright


BASE_URL = os.getenv("AURORA_EXAM_BASE_URL", "http://127.0.0.1:8130")


def main() -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(accept_downloads=True)
        browser_errors: list[str] = []
        page.on(
            "console",
            lambda message: (
                browser_errors.append(message.text) if message.type == "error" else None
            ),
        )
        page.on("pageerror", lambda error: browser_errors.append(str(error)))
        page.on(
            "response",
            lambda response: (
                browser_errors.append(f"HTTP {response.status}: {response.url}")
                if response.status >= 400
                else None
            ),
        )
        try:
            page.goto(BASE_URL)
            page.wait_for_load_state("networkidle")
            page.locator("#total").fill("4")
            page.get_by_role("button", name="Tạo đề mới").click()
            page.locator("#version-badge").get_by_text("v1").wait_for()

            add_buttons = page.get_by_role("button", name="Thêm câu")
            if add_buttons.count() == 0:
                print(
                    "UI state:",
                    page.evaluate(
                        """() => ({
                          bankCount: bank.length,
                          topicCount: topics.length,
                          bankHtml: document.getElementById("bank-list").innerHTML,
                          error: document.getElementById("error-box").textContent
                        })"""
                    ),
                )
            add_buttons.nth(0).click()
            page.locator("#version-badge").get_by_text("v2").wait_for()

            page.locator("#manual-content").fill("Giải <b>phương trình</b> x + 1 = 3.")
            page.locator("#manual-points").fill("2")
            page.locator("#manual-topic").select_option("topic-linear-equations")
            page.locator("#manual-question-form").get_by_role(
                "button", name="Thêm vào đề"
            ).click()
            page.locator("#version-badge").get_by_text("v3").wait_for()
            assert page.locator(".question-card").nth(1).locator("b").count() == 0

            page.locator("#rubric-description").fill("Kết luận x = 2")
            page.locator("#rubric-points").fill("2")
            page.locator("#rubric-topic").select_option("topic-linear-equations")
            page.get_by_role("button", name="Thêm ý barem").click()
            page.locator("#version-badge").get_by_text("v4").wait_for()

            page.locator("#editor-content").fill(
                "Giải và trình bày phương trình x + 1 = 3."
            )
            page.get_by_role("button", name="Lưu câu").click()
            page.locator("#version-badge").get_by_text("v5").wait_for()

            cards = page.locator(".question-card")
            cards.nth(1).drag_to(cards.nth(0))
            page.locator("#version-badge").get_by_text("v6").wait_for()

            page.get_by_role("button", name="Kiểm tra đề").click()
            page.get_by_text("Đề hợp lệ").wait_for()
            page.get_by_role("button", name="Chuẩn bị phát đề").click()
            page.locator("#status-badge").get_by_text(
                "preparing_exam", exact=True
            ).wait_for()
            page.get_by_role("button", name="Đưa về bản nháp").click()
            page.locator("#status-badge").get_by_text("drafting", exact=True).wait_for()
            page.get_by_role("button", name="Chuẩn bị phát đề").click()
            page.locator("#status-badge").get_by_text(
                "preparing_exam", exact=True
            ).wait_for()

            with page.expect_download() as download_info:
                page.get_by_role("button", name="Tải DOCX").click()
            assert download_info.value.suggested_filename.endswith(".docx")

            page.get_by_role("button", name="Nhận bài đầu tiên").click()
            page.get_by_text("Đã khóa đề").wait_for()
            assert page.locator("#manual-content").is_disabled()
            assert page.get_by_role("button", name="Chuẩn bị phát đề").is_disabled()
            page.get_by_role("button", name="Chấm xong toàn bộ").click()
            page.locator("#status-badge").get_by_text("done", exact=True).wait_for()
            page.get_by_role("button", name="Tạo đề khác").click()
            page.get_by_text("Chưa có đề", exact=True).wait_for()
            page.locator("#exam-picker").select_option(index=1)
            page.locator("#status-badge").get_by_text("done", exact=True).wait_for()
            evidence_path = os.getenv("AURORA_EXAM_SCREENSHOT")
            if evidence_path:
                page.screenshot(path=evidence_path, full_page=True)
        except Exception:
            screenshot = Path(tempfile.gettempdir()) / "aurora-exam-smoke-failure.png"
            page.screenshot(path=str(screenshot), full_page=True)
            if browser_errors:
                print("Browser errors:")
                for error in browser_errors:
                    print(f"- {error}")
            raise
        finally:
            browser.close()
    print("Create exam browser smoke test passed")


if __name__ == "__main__":
    main()
