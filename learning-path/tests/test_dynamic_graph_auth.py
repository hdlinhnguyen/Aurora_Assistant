import json

from learning_path.api import fetch_dynamic_graph


class GraphResponse:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps({"nodes": []}).encode("utf-8")


def test_dynamic_graph_sends_internal_service_token(monkeypatch):
    captured = {}

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
