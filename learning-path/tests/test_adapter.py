"""Adapter: knowledge-graph/data/graph.json (Chắc Gốc) → Topic/PrerequisiteEdge (spec mục 8.3)."""

from pathlib import Path

import networkx as nx
import pytest

from learning_path.adapters import load_chac_goc_graph

GRAPH_JSON = Path(__file__).resolve().parents[2] / "knowledge-graph" / "data" / "graph.json"


@pytest.fixture(scope="module")
def data():
    return load_chac_goc_graph(GRAPH_JSON)


def test_loads_all_38_topics_keyed_by_id(data):
    assert len(data.topics) == 38
    assert all(tid == t.topic_id for tid, t in data.topics.items())


def test_topic_fields_follow_spec(data):
    for t in data.topics.values():
        assert t.subject_id == "toan"
        assert 1 <= t.grade_level <= 12
        assert t.name.strip()
        assert t.estimated_learning_time > 0


def test_loads_all_64_edges_and_endpoints_resolve(data):
    assert len(data.edges) == 64
    for e in data.edges:
        assert e.prerequisite_topic_id in data.topics
        assert e.dependent_topic_id in data.topics


def test_graph_is_dag(data):
    assert nx.is_directed_acyclic_graph(data.to_networkx())


def test_demo_chain_l7_to_l5_is_in_prerequisite_closure(data):
    g = data.to_networkx()
    ancestors = nx.ancestors(g, "l7-phep-tinh-so-huu-ti")
    assert "l6-phep-tinh-phan-so" in ancestors
    assert "l5-quy-dong-phan-so" in ancestors


def test_dim_nodes_map_to_content_unavailable(data):
    available = [t for t in data.topics.values() if t.content_available]
    assert len(available) == 24  # 24 node thật, 14 node mờ (mo=true)
