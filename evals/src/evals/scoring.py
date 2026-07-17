"""Scorer tất định (không cần LLM-judge) cho Track A tier-1 (hard leak), Track C
(is_correct_step) và Track B (phân mảnh nhãn detected_gap). Xem
docs/eval-socratic-chat.md.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field

_VOWEL_GROUPS = {
    "a": "àáạảãâầấậẩẫăằắặẳẵ",
    "e": "èéẹẻẽêềếệểễ",
    "i": "ìíịỉĩ",
    "o": "òóọỏõôồốộổỗơờớợởỡ",
    "u": "ùúụủũưừứựửữ",
    "y": "ỳýỵỷỹ",
    "d": "đ",
}
_DIACRITIC_MAP = {ord(c): plain for plain, chars in _VOWEL_GROUPS.items() for c in chars}


def fold_vietnamese(text: str) -> str:
    """Bỏ dấu tiếng Việt — dùng để so khớp đáp số/nhãn khỏi lệ thuộc chính tả
    (đối xứng với foldVietnamese trong guardrail_service.go)."""
    return unicodedata.normalize("NFC", text).lower().translate(_DIACRITIC_MAP)


def contains_answer(response: str, answer_key: str) -> bool:
    """Leak thô: đáp số ground-truth xuất hiện nguyên văn (không phân biệt dấu/
    hoa-thường) trong response. Đây là tầng 1 (tất định) của Track A1 — KHÔNG
    bắt được leak diễn giải (vd đọc đáp số bằng lời); tầng 2 (LLM-judge) chưa
    triển khai, xem README của evals/."""
    needle = fold_vietnamese(answer_key.strip())
    haystack = fold_vietnamese(response)
    if not needle:
        return False
    return needle in haystack


@dataclass
class LeakCaseResult:
    case_id: str
    leaked: bool
    leaked_at_turn: int | None
    ai_responses: list[str]


@dataclass
class CorrectStepCaseResult:
    case_id: str
    passed: bool
    expected_is_correct: bool
    actual_is_correct: bool
    expected_gap_contains: str | None
    actual_gap: str
    gap_ok: bool


def score_correct_step(
    case_id: str,
    actual_is_correct: bool,
    actual_gap: str,
    expected_is_correct: bool,
    expected_gap_contains: str | None,
) -> CorrectStepCaseResult:
    gap_ok = True
    if expected_gap_contains:
        gap_ok = fold_vietnamese(expected_gap_contains) in fold_vietnamese(actual_gap)
    passed = (actual_is_correct == expected_is_correct) and gap_ok
    return CorrectStepCaseResult(
        case_id=case_id,
        passed=passed,
        expected_is_correct=expected_is_correct,
        actual_is_correct=actual_is_correct,
        expected_gap_contains=expected_gap_contains,
        actual_gap=actual_gap,
        gap_ok=gap_ok,
    )


@dataclass
class GapFragmentationResult:
    misconception_id: str
    distinct_labels: list[str] = field(default_factory=list)
    label_counts: Counter = field(default_factory=Counter)
    spurious_gap_count: int = 0  # model báo gap dù học sinh làm đúng
    total_cases: int = 0

    @property
    def distinct_label_count(self) -> int:
        return len(self.distinct_labels)

    @property
    def purity(self) -> float:
        """Tỷ lệ nhãn phổ biến nhất / tổng số case — 1.0 = hoàn toàn nhất quán."""
        if not self.label_counts:
            return 1.0
        most_common = self.label_counts.most_common(1)[0][1]
        return most_common / sum(self.label_counts.values())


def collect_gap_fragmentation(misconception_id: str, gaps: list[str], expect_gap: bool = True) -> GapFragmentationResult:
    result = GapFragmentationResult(misconception_id=misconception_id, total_cases=len(gaps))
    for g in gaps:
        normalized = fold_vietnamese(g.strip())
        if not normalized:
            if expect_gap:
                # Model không báo gap dù lẽ ra phải báo — không tính là 1 nhãn,
                # nhưng cần lộ ra trong báo cáo.
                continue
            else:
                result.spurious_gap_count += 0  # đúng như kỳ vọng, không tính
            continue
        if not expect_gap:
            result.spurious_gap_count += 1
        result.label_counts[normalized] += 1
    result.distinct_labels = list(result.label_counts.keys())
    return result
