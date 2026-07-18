from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "icon.png"
APP_DIR = ROOT / "frontend" / "src" / "app"


def assert_resized_source(candidate_path: Path, expected_size: tuple[int, int]) -> None:
    with Image.open(SOURCE) as source, Image.open(candidate_path) as candidate:
        expected = source.convert("RGB").resize(expected_size, Image.Resampling.LANCZOS)
        actual = candidate.convert("RGB")

    assert actual.size == expected_size
    assert ImageChops.difference(actual, expected).getbbox() is None


def test_nextjs_icon_assets_are_derived_from_official_source() -> None:
    assert_resized_source(APP_DIR / "icon.png", (512, 512))
    assert_resized_source(APP_DIR / "apple-icon.png", (180, 180))


def test_favicon_contains_required_sizes_and_matches_source() -> None:
    required_sizes = {(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)}

    with Image.open(APP_DIR / "favicon.ico") as favicon:
        assert favicon.format == "ICO"
        assert required_sizes.issubset(set(favicon.info["sizes"]))

    assert_resized_source(APP_DIR / "favicon.ico", (256, 256))
