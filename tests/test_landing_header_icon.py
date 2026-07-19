from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "frontend" / "src" / "app" / "page.tsx"


def test_landing_header_uses_official_app_icon_and_keeps_hero_lightning() -> None:
    source = PAGE.read_text(encoding="utf-8")
    header, hero = source.split("{/* Hero Section */}", 1)

    assert 'src="/icon.png"' in header
    assert 'alt=""' in header
    assert '<svg className="h-5 w-5 text-white animate-pulse"' not in header
    assert 'd="M13 10V3L4 14h7v7l9-11h-7z"' in hero
