from __future__ import annotations

import hashlib
import shutil
from io import BytesIO
from pathlib import Path

from PIL import (
    Image,
    ImageFilter,
    ImageOps,
    ImageStat,
    UnidentifiedImageError,
)


ALLOWED_MEDIA_TYPES = {"image/png", "image/jpeg", "image/webp", "application/pdf"}


class LocalStorage:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.files_dir = self.root / "files"
        self.parts_dir = self.root / "parts"
        self.raw_dir = self.root / "raw"
        for directory in (self.files_dir, self.parts_dir, self.raw_dir):
            directory.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def checksum(data: bytes) -> str:
        return hashlib.sha256(data).hexdigest()

    @staticmethod
    def image_quality_warnings(data: bytes, media_type: str) -> list[str]:
        if media_type == "application/pdf":
            return []
        try:
            with Image.open(BytesIO(data)) as image:
                image = ImageOps.exif_transpose(image)
                width, height = image.size
                warnings: list[str] = []
                if width < 600 or height < 600:
                    warnings.append("warning_low_resolution")
                if width > height:
                    warnings.append("warning_wrong_orientation")

                grayscale = image.convert("L")
                margin_x = max(1, width // 20)
                margin_y = max(1, height // 20)
                interior = grayscale.crop(
                    (margin_x, margin_y, width - margin_x, height - margin_y)
                )
                edges = interior.filter(ImageFilter.FIND_EDGES)
                if edges.width > 4 and edges.height > 4:
                    edges = edges.crop((2, 2, edges.width - 2, edges.height - 2))
                if ImageStat.Stat(edges).var[0] < 80:
                    warnings.append("warning_blurry")

                border_width = max(2, min(width, height) // 50)
                border = Image.new("L", (width, height), 255)
                border.paste(grayscale.crop((0, 0, width, border_width)), (0, 0))
                border.paste(
                    grayscale.crop((0, height - border_width, width, height)),
                    (0, height - border_width),
                )
                border.paste(grayscale.crop((0, 0, border_width, height)), (0, 0))
                border.paste(
                    grayscale.crop((width - border_width, 0, width, height)),
                    (width - border_width, 0),
                )
                histogram = border.histogram()
                dark_pixels = sum(histogram[:100])
                border_pixels = 2 * width * border_width + 2 * height * border_width
                if border_pixels and dark_pixels / border_pixels > 0.08:
                    warnings.append("warning_possible_crop")
                return warnings
        except (UnidentifiedImageError, OSError):
            return ["warning_unreadable_preview"]

    @classmethod
    def image_quality(cls, data: bytes, media_type: str) -> str:
        if media_type == "application/pdf":
            return "not_applicable"
        warnings = cls.image_quality_warnings(data, media_type)
        return warnings[0] if warnings else "acceptable"

    def save_file(self, file_id: str, data: bytes) -> str:
        path = self.files_dir / file_id
        path.write_bytes(data)
        return str(path.relative_to(self.root))

    def read_file(self, storage_key: str) -> bytes:
        return (self.root / storage_key).read_bytes()

    def save_part(self, upload_id: str, part_number: int, data: bytes) -> None:
        directory = self.parts_dir / upload_id
        directory.mkdir(parents=True, exist_ok=True)
        (directory / f"{part_number:08d}.part").write_bytes(data)

    def combine_parts(self, upload_id: str, total_parts: int) -> bytes:
        directory = self.parts_dir / upload_id
        return b"".join(
            (directory / f"{part_number:08d}.part").read_bytes()
            for part_number in range(1, total_parts + 1)
        )

    def remove_parts(self, upload_id: str) -> None:
        shutil.rmtree(self.parts_dir / upload_id, ignore_errors=True)

    def save_raw_response(self, job_id: str, content: str) -> str:
        path = self.raw_dir / f"{job_id}.json"
        path.write_text(content, encoding="utf-8")
        return str(path.relative_to(self.root))
