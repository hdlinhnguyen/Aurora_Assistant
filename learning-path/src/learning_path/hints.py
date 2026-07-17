"""Thang gợi ý 3 bậc có trần — addendum 2026-07-17 mục 3.

Học sinh không gõ text: em "trả lời" câu hỏi gợi mở bằng cách làm lại bài; mỗi lần
bấm gợi ý là leo một bậc. Socratic là hình thức (câu hỏi dẫn dắt), first-principles
là nội dung (xây từ YCCĐ của node nền — nguyên văn chương trình, không bịa).

Quá trần 3 bậc → KHÔNG descent tiếp xuống cây tiên quyết (đó là việc của engine
chẩn đoán/Path Planner): trả escalation đề xuất node nền cần ôn lại. Người gọi
ghi evidence với hints_used > 0 → evidence_weight nhân hint_factor (spec mục 5)
→ BKT hạ mastery → lộ trình tự điều chỉnh.

Nội dung v1 = template tất định. LLM diễn đạt lại là extension point (pre-generate
+ verifier + fallback), không nằm trong v1.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from learning_path.adapters import CurriculumGraph
from learning_path.schemas import Topic

MAX_LEVEL = 3


class HintEscalation(BaseModel):
    recommended_topic_ids: list[str] = Field(default_factory=list)
    reason: str


class Hint(BaseModel):
    topic_id: str
    level: int = Field(ge=1, le=MAX_LEVEL)
    text: str
    exhausted: bool = False
    escalation: HintEscalation | None = None


class HintLadder:
    def __init__(self, curriculum: CurriculumGraph):
        self.curriculum = curriculum
        self._g = curriculum.to_networkx()

    def _prerequisites(self, topic_id: str) -> list[Topic]:
        """Node nền trực tiếp, ưu tiên node có nội dung, thứ tự tất định (lớp ↑, id)."""
        preds = [self.curriculum.topics[p] for p in self._g.predecessors(topic_id)]
        return sorted(preds, key=lambda t: (not t.content_available, t.grade_level, t.topic_id))

    def _outcome(self, topic: Topic) -> str:
        return topic.learning_outcomes[0] if topic.learning_outcomes else topic.name

    def request_hint(
        self, topic_id: str, *, press_count: int, chosen_misconception: str | None = None
    ) -> Hint:
        topic = self.curriculum.topics[topic_id]
        prereqs = self._prerequisites(topic_id)
        anchor = prereqs[0] if prereqs else topic  # gốc cây → neo vào chính nó

        if press_count > MAX_LEVEL:
            recommended = [p.topic_id for p in prereqs] or [topic_id]
            return Hint(
                topic_id=topic_id,
                level=MAX_LEVEL,
                text=(
                    f"Em đã dùng hết gợi ý cho bài này. Có vẻ em cần ôn lại "
                    f"“{anchor.name}” trước khi tiếp tục."
                ),
                exhausted=True,
                escalation=HintEscalation(
                    recommended_topic_ids=recommended,
                    reason=(
                        f"Dùng quá {MAX_LEVEL} gợi ý ở “{topic.name}” — đề xuất ôn lại "
                        f"kiến thức nền thay vì gợi ý tiếp."
                    ),
                ),
            )

        level = press_count
        if level == 1:
            # Socratic nudge: hỏi, không lộ phương pháp
            if chosen_misconception:
                text = (
                    f"Em vừa chọn theo cách “{chosen_misconception}”. "
                    f"Thử tự hỏi: cách đó có luôn đúng với “{topic.name}” không? "
                    f"Điều kiện nào phải thỏa mãn trước khi làm bước đó?"
                )
            else:
                text = (
                    f"Trước khi làm tiếp, em tự hỏi: với “{topic.name}”, "
                    f"bước đầu tiên cần kiểm tra điều gì?"
                )
        elif level == 2:
            # First-principles: nguyên lý của node nền, neo YCCĐ nguyên văn
            text = (
                f"Nhớ lại nền tảng “{anchor.name}”: {self._outcome(anchor)} "
                f"Từ nguyên lý đó, em suy ra bước làm cho bài này xem."
            )
        else:
            # Bottom-out: hướng dẫn làm ví dụ tối giản của kỹ năng nền
            text = (
                f"Làm thử ví dụ nhỏ nhất của “{anchor.name}” rồi áp dụng y hệt "
                f"các bước đó vào bài đang làm. Gợi ý cụ thể: {self._outcome(anchor)}"
            )

        return Hint(topic_id=topic_id, level=level, text=text)
