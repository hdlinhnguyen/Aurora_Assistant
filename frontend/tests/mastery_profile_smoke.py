from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_knowledge_tree_accepts_bkt_mastery_map() -> None:
    source = read("frontend/src/app/components/KnowledgeTree.tsx")
    assert "masteryByTopic" in source
    assert '"BKT "' in source


def test_mastery_panel_exposes_history_ranges() -> None:
    source = read("frontend/src/app/components/MasteryTopicPanel.tsx")
    assert '"30d"' in source
    assert '"90d"' in source
    assert '"all"' in source
    assert "LineChart" in source


def test_mastery_types_keep_confidence_separate() -> None:
    source = read("frontend/src/lib/mastery.ts")
    assert "masteryProbability" in source
    assert "confidenceScore" in source
    assert "masteryStatus" in source


def test_teacher_profile_uses_teacher_scoped_mastery_api() -> None:
    source = read("frontend/src/app/teacher/components/StudentMasteryProfile.tsx")
    assert "/teacher/students/" in source
    assert "/mastery/recalculate" in source
    assert "MasteryTopicPanel" in source
    assert "masteryByTopic" in source


def test_teacher_page_mounts_student_mastery_profile() -> None:
    source = read("frontend/src/app/teacher/page.tsx")
    assert 'import StudentMasteryProfile from "./components/StudentMasteryProfile"' in source
    assert "<StudentMasteryProfile" in source
