from fastapi.testclient import TestClient

from learning_path.api import create_app


def test_health_is_dependency_free():
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "learning-path"}
