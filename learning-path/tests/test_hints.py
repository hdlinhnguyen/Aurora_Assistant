"""Thang gợi ý 3 bậc có trần — addendum mục 3.

Bậc 1 Socratic nudge · bậc 2 first-principles node nền (neo YCCĐ) · bậc 3 ví dụ mẫu.
Quá trần → không descent tiếp: escalation đề xuất node nền cho Path Planner.
"""

from pathlib import Path

import pytest

from learning_path.adapters import load_chac_goc_graph
from learning_path.hints import HintLadder

GRAPH_JSON = Path(__file__).resolve().parents[2] / "knowledge-graph" / "data" / "graph.json"

# l6-phan-so-tinh-chat có cạnh tiên quyết TRỰC TIẾP từ l5-quy-dong-phan-so (chuỗi demo);
# anchor chọn tất định theo (có nội dung, lớp thấp nhất, id) → l5-quy-dong-phan-so.
TOPIC = "l6-phan-so-tinh-chat"
PREREQ = "l5-quy-dong-phan-so"


@pytest.fixture(scope="module")
def ladder():
    return HintLadder(load_chac_goc_graph(GRAPH_JSON))


def test_level_1_is_socratic_question_without_revealing_method(ladder):
    h = ladder.request_hint(TOPIC, press_count=1)
    assert h.level == 1
    assert not h.exhausted
    assert "?" in h.text


def test_level_1_anchors_on_chosen_misconception(ladder):
    h = ladder.request_hint(TOPIC, press_count=1, chosen_misconception="cộng tử với tử, mẫu với mẫu")
    assert "cộng tử với tử, mẫu với mẫu" in h.text


def test_level_2_grounds_on_prerequisite_yccd(ladder):
    h = ladder.request_hint(TOPIC, press_count=2)
    prereq_topic = ladder.curriculum.topics[PREREQ]
    assert h.level == 2
    assert prereq_topic.name in h.text
    assert prereq_topic.learning_outcomes, "adapter phải nạp YCCĐ"
    assert any(outcome[:30] in h.text for outcome in prereq_topic.learning_outcomes)


def test_level_3_is_bottom_out_and_differs_from_level_2(ladder):
    h2 = ladder.request_hint(TOPIC, press_count=2)
    h3 = ladder.request_hint(TOPIC, press_count=3)
    assert h3.level == 3
    assert h3.text != h2.text


def test_beyond_cap_escalates_instead_of_descending(ladder):
    h = ladder.request_hint(TOPIC, press_count=4)
    assert h.exhausted
    assert h.escalation is not None
    assert PREREQ in h.escalation.recommended_topic_ids
    assert "ôn lại" in h.escalation.reason.lower()


def test_escalation_is_stable_no_matter_how_many_presses(ladder):
    h4 = ladder.request_hint(TOPIC, press_count=4)
    h10 = ladder.request_hint(TOPIC, press_count=10)
    assert h4 == h10


def test_root_topic_without_prerequisites_falls_back_to_own_yccd(ladder):
    root = "l4-khai-niem-phan-so"
    h = ladder.request_hint(root, press_count=2)
    own = ladder.curriculum.topics[root]
    assert any(outcome[:30] in h.text for outcome in own.learning_outcomes)
    esc = ladder.request_hint(root, press_count=4)
    assert esc.escalation is not None
    assert esc.escalation.recommended_topic_ids == [root]  # ôn lại chính topic đó


def test_hints_are_deterministic(ladder):
    assert ladder.request_hint(TOPIC, press_count=1) == ladder.request_hint(TOPIC, press_count=1)
