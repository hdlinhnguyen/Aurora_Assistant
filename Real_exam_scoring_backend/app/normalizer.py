from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class NormalizedBlock:
    block_id: str
    page_number: int
    reading_order: int
    content: str
    content_type: str
    bounding_box: list[float]
    ocr_confidence: float | None


TYPE_MAP = {
    "equation": "math",
    "inlineequation": "math",
    "math": "math",
    "table": "table",
    "figure": "figure",
    "picture": "figure",
    "image": "figure",
}
CONTAINER_TYPES = {"document", "page", "group", "section"}


def _plain_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"<[^>]+>", "", value).strip()


def normalize_datalab(raw: dict[str, Any]) -> list[NormalizedBlock]:
    root = raw.get("json") or raw
    blocks: list[NormalizedBlock] = []
    counter = 0

    def visit(node: Any, page_number: int = 1) -> None:
        nonlocal counter
        if isinstance(node, list):
            for child in node:
                visit(child, page_number)
            return
        if not isinstance(node, dict):
            return

        node_type = str(node.get("block_type") or node.get("type") or "text").lower()
        if node_type == "page":
            raw_page = node.get("page_id", node.get("page", page_number - 1))
            try:
                page_number = int(raw_page) + 1
            except (TypeError, ValueError):
                pass

        content = next(
            (
                _plain_text(node.get(key))
                for key in ("latex", "text", "content", "html", "markdown")
                if _plain_text(node.get(key))
            ),
            "",
        )
        if content and node_type not in CONTAINER_TYPES:
            counter += 1
            bbox = node.get("bbox") or node.get("bounding_box") or [0, 0, 0, 0]
            if not isinstance(bbox, list) or len(bbox) != 4:
                bbox = [0, 0, 0, 0]
            confidence = node.get("confidence", node.get("ocr_confidence"))
            if not isinstance(confidence, (int, float)) or isinstance(confidence, bool):
                confidence = None
            try:
                normalized_bbox = [float(value) for value in bbox]
            except (TypeError, ValueError):
                normalized_bbox = [0.0, 0.0, 0.0, 0.0]
            blocks.append(
                NormalizedBlock(
                    block_id=str(node.get("id") or f"block-{counter}"),
                    page_number=page_number,
                    reading_order=counter,
                    content=content,
                    content_type=TYPE_MAP.get(node_type, "text"),
                    bounding_box=normalized_bbox,
                    ocr_confidence=float(confidence)
                    if confidence is not None
                    else None,
                )
            )
        visit(node.get("children", []), page_number)

    visit(root)
    return blocks
