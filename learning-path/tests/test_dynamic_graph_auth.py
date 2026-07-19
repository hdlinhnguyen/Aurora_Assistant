import json

from learning_path.api import fetch_dynamic_graph


class GraphResponse:
    nodes = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps({"nodes": self.nodes}).encode("utf-8")


def test_dynamic_graph_sends_internal_service_token(monkeypatch):
    captured = {}
    GraphResponse.nodes = None

    def fake_urlopen(request, timeout):
        captured["request"] = request
        captured["timeout"] = timeout
        return GraphResponse()

    monkeypatch.setenv("GO_BACKEND_GRAPH_URL", "http://aurora-go.railway.internal:8080/api/internal/graph")
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "shared-secret")
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    graph = fetch_dynamic_graph()

    assert graph.topics == {}
    assert captured["timeout"] == 5
    assert captured["request"].get_header("X-internal-token") == "shared-secret"


def test_dynamic_graph_can_scope_by_subject(monkeypatch):
    captured = {}
    GraphResponse.nodes = []

    def fake_urlopen(request, timeout):
        captured["request"] = request
        return GraphResponse()

    monkeypatch.setenv("GO_BACKEND_GRAPH_URL", "http://aurora-go/api/internal/graph")
    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    graph = fetch_dynamic_graph("Toán 7 - Đại số")

    assert graph.topics == {}
    assert captured["request"].full_url == "http://aurora-go/api/internal/graph?subject=To%C3%A1n+7+-+%C4%90%E1%BA%A1i+s%E1%BB%91"


def test_dynamic_graph_accepts_null_lists_from_go(monkeypatch):
    GraphResponse.nodes = [
        {
            "id": "topic-1",
            "ten": "Topic 1",
            "lop": 7,
            "cap": "THCS",
            "tienQuyet": None,
            "mo": False,
            "yccd": None,
        }
    ]
    monkeypatch.setattr("urllib.request.urlopen", lambda *_args, **_kwargs: GraphResponse())

    graph = fetch_dynamic_graph()

    assert list(graph.topics) == ["topic-1"]
    assert graph.topics["topic-1"].learning_outcomes == []
    assert graph.edges == []
