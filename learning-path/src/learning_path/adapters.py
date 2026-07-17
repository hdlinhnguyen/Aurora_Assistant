"""Adapter: đọc knowledge graph của Chắc Gốc (knowledge-graph/data/graph.json)
thành Topic/PrerequisiteEdge theo spec mục 8.3.

Module này là điểm duy nhất biết về định dạng KnowledgeNode (id/ten/lop/cap/tienQuyet/mo);
mọi phần còn lại của pipeline chỉ làm việc với Topic/PrerequisiteEdge.
"""

from __future__ import annotations

import json
from pathlib import Path

import networkx as nx

from learning_path.schemas import PrerequisiteEdge, Topic

# Thời lượng học mặc định theo cấp (phút) — placeholder, hiệu chỉnh bằng dữ liệu thực tế
# (cùng tinh thần mục 5 spec: "các hệ số này phải được hiệu chỉnh").
DEFAULT_MINUTES_BY_CAP = {"TH": 25, "THCS": 35, "THPT": 45}


class CurriculumGraph:
    """Đồ thị chương trình: topics theo id + cạnh tiên quyết, kèm view networkx."""

    def __init__(self, topics: dict[str, Topic], edges: list[PrerequisiteEdge]):
        self.topics = topics
        self.edges = edges

    def to_networkx(self) -> nx.DiGraph:
        g = nx.DiGraph()
        g.add_nodes_from(self.topics)
        g.add_edges_from((e.prerequisite_topic_id, e.dependent_topic_id) for e in self.edges)
        return g


def load_chac_goc_graph(path: str | Path) -> CurriculumGraph:
    raw = json.loads(Path(path).read_text(encoding="utf-8"))

    topics: dict[str, Topic] = {}
    edges: list[PrerequisiteEdge] = []
    for node in raw["nodes"]:
        topics[node["id"]] = Topic(
            topic_id=node["id"],
            subject_id="toan",
            grade_level=node["lop"],
            name=node["ten"],
            estimated_learning_time=DEFAULT_MINUTES_BY_CAP[node["cap"]],
            content_available=not node["mo"],
        )
        for prereq_id in node["tienQuyet"]:
            edges.append(
                PrerequisiteEdge(prerequisite_topic_id=prereq_id, dependent_topic_id=node["id"])
            )

    return CurriculumGraph(topics, edges)
