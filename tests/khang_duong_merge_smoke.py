from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
CONFLICT_MARKERS = ("<<<<<<<", "=======", ">>>>>>>")


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def tracked_files() -> set[str]:
    output = subprocess.check_output(["git", "ls-files"], cwd=ROOT, text=True)
    return set(output.splitlines())


def test_no_unresolved_conflict_markers() -> None:
    paths = [
        ".gitignore",
        "frontend/src/app/components/KnowledgeTree.tsx",
        "frontend/src/app/teacher/components/QuestionBankTab.tsx",
        "frontend/src/app/teacher/page.tsx",
        "frontend/src/app/tutor/page.tsx",
    ]
    for path in paths:
        source = read(path)
        assert not any(marker in source for marker in CONFLICT_MARKERS), path


def test_server_keeps_mastery_exam_scoring_and_tagging_wiring() -> None:
    source = read("backend/cmd/server/main.go")
    for marker in [
        "masteryprofile.NewService",
        "NewExamHandler",
        "NewScoringHandler",
        "NewTaggingHandler",
    ]:
        assert marker in source


def test_khang_support_tools_and_assets_are_present_without_generated_artifacts() -> None:
    files = tracked_files()
    for path in [
        "backend/cmd/check_questions/main.go",
        "backend/cmd/dump_mock/main.go",
        "backend/cmd/import_bank/main.go",
        "de1_bank.json",
        "frontend/public/mock_knowledge_tree.json",
    ]:
        assert path in files
    server_binary_diff = subprocess.run(
        ["git", "diff", "--quiet", "HEAD", "--", "backend/server.exe"],
        cwd=ROOT,
    )
    assert server_binary_diff.returncode == 0
    assert not any(path.startswith("tmp/pdfs/") for path in files)


def test_knowledge_tree_uses_khang_ui_and_persisted_mastery() -> None:
    source = read("frontend/src/app/components/KnowledgeTree.tsx")
    assert "LayoutGrid" in source
    assert "masteryByTopic" in source
    assert '"BKT "' in source
    assert "onFocusedNodeChange" in source


def test_question_bank_keeps_import_rubric_and_tagging_features() -> None:
    source = read("frontend/src/app/teacher/components/QuestionBankTab.tsx")
    assert "handleExcelImport" in source
    assert "handleTagQuestion" in source
    assert "rubric" in source.lower()


def test_teacher_page_keeps_khang_mock_ui_and_all_duong_modules() -> None:
    source = read("frontend/src/app/teacher/page.tsx")
    for marker in [
        "mock_knowledge_tree.json",
        "StudentMasteryProfile",
        "ExamBuilderTab",
        "ExamScoringTab",
        "QuestionTaggingPanel",
        "LearningPathTab",
        "MonitoringTab",
    ]:
        assert marker in source


def test_tutor_page_keeps_socratic_ui_and_real_mastery() -> None:
    source = read("frontend/src/app/tutor/page.tsx")
    for marker in [
        "StudentMasteryDashboard",
        "masteryByTopic={masteryByTopic}",
        "/student/mastery?subject=",
        "Socratic",
        "dangerouslySetInnerHTML",
    ]:
        assert marker in source
    forbidden = [
        "mastery: 0.94",
        "mastery: 0.28",
        "mastery: 0.45",
        "return { mastery: 0.15",
    ]
    assert not any(marker in source for marker in forbidden)


def test_api_client_keeps_structured_errors() -> None:
    source = read("frontend/src/lib/api.ts")
    assert "export class ApiError" in source
    assert "latestContext" in source
    assert "maxRetries" in source
