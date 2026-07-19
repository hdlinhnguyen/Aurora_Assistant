from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TOUR = ROOT / "frontend" / "src" / "app" / "components" / "GuidedTour.tsx"
PAGE = ROOT / "frontend" / "src" / "app" / "teacher" / "page.tsx"


TEACHER_STEPS = [
    "teacher-student-mgmt",
    "teacher-graph-designer",
    "teacher-question-bank",
    "teacher-exam-builder",
    "teacher-students",
    "teacher-learning-path",
    "teacher-monitoring",
    "teacher-guardrail",
]


def test_teacher_tour_covers_every_tab_in_sidebar_order() -> None:
    source = TOUR.read_text(encoding="utf-8")
    positions = [source.index(f'id: "{step_id}"') for step_id in TEACHER_STEPS]

    assert positions == sorted(positions)
    for step_id in TEACHER_STEPS:
        tab = step_id.removeprefix("teacher-")
        assert f'targetSelector: \'[data-tour="teacher-tab-{tab}"]\'' in source


def test_teacher_tour_maps_each_step_to_an_active_tab_workspace() -> None:
    source = TOUR.read_text(encoding="utf-8")
    page = PAGE.read_text(encoding="utf-8")

    for tab in (
        "student-mgmt",
        "graph-designer",
        "question-bank",
        "exam-builder",
        "students",
        "learning-path",
        "monitoring",
        "guardrail",
    ):
        assert f'"teacher-{tab}": "{tab}"' in source
    assert 'data-tour={`teacher-tab-${activeTab}`}' in page
    assert '? "student-mgmt"' in page
