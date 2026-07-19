from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LANDING = ROOT / "frontend" / "src" / "app" / "page.tsx"
GUIDED_TOUR = ROOT / "frontend" / "src" / "app" / "components" / "GuidedTour.tsx"
TUTOR = ROOT / "frontend" / "src" / "app" / "tutor" / "page.tsx"


def test_landing_starts_a_student_only_demo_tour() -> None:
    source = LANDING.read_text(encoding="utf-8")

    assert 'localStorage.setItem("aurora_tour_demo_session", "true")' in source
    assert 'localStorage.setItem("aurora_tour_mode", "student")' in source
    assert 'localStorage.setItem("aurora_tour_step", "1")' in source
    assert 'if (!res.ok)' in source
    assert "setTourError" in source


def test_demo_tour_completion_and_early_exit_clear_the_demo_session() -> None:
    source = GUIDED_TOUR.read_text(encoding="utf-8")

    assert "const clearDemoTourSession" in source
    assert "const completeTour" in source
    assert "const requestExitTour" in source
    assert 'localStorage.removeItem("aurora_token")' in source
    assert 'localStorage.removeItem("aurora_user")' in source
    assert 'localStorage.removeItem("aurora_tour_demo_session")' in source
    assert "window.confirm" in source
    assert 'router.replace("/")' in source
    assert 'onClick={requestExitTour}' in source
    assert "completeTour();" in source


def test_student_page_mounts_the_guided_tour() -> None:
    source = TUTOR.read_text(encoding="utf-8")

    assert 'import GuidedTour from "@/app/components/GuidedTour"' in source
    assert "<GuidedTour />" in source
    assert 'data-tour="socratic-chat"' in source
    assert 'data-tour="feynman-notebook"' in source
    assert 'localStorage.getItem("aurora_tour_demo_session") !== "true"' in source
    assert 'window.addEventListener("aurora-tour-switch-student-tab"' in source


def test_guided_tour_switches_to_and_scrolls_to_each_student_target() -> None:
    source = GUIDED_TOUR.read_text(encoding="utf-8")

    assert 'new CustomEvent("aurora-tour-switch-student-tab"' in source
    assert 'currentStep.id === "socratic-chat" ? "chat" : "practice"' in source
    assert "scrollIntoView" in source
