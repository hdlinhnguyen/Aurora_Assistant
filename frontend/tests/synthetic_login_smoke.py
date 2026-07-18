from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_one_click_login_uses_seeded_synthetic_accounts() -> None:
    source = (ROOT / "src/app/login/page.tsx").read_text(encoding="utf-8")
    assert "synthetic.teacher@aurora.local" in source
    assert "synthetic.student.b@aurora.local" in source
    assert "Synthetic Teacher" in source
    assert "syntheticQuickLogin" in source
    assert 'password: "demo123"' in source
