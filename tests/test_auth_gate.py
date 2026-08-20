"""Password-gate checks: login, status, and locked API routes.

These hit FastAPI in-process (no Render, no browser). SITE_PASSWORD is set
per test so a local .env cannot change the result.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.service import _access_token, _secrets_match, create_app


def _client(monkeypatch, password: str) -> TestClient:
    monkeypatch.setenv("SITE_PASSWORD", password)
    return TestClient(create_app())


def test_open_when_password_unset(monkeypatch):
    client = _client(monkeypatch, "")
    status = client.get("/api/auth/status")
    assert status.status_code == 200
    assert status.json()["required"] is False
    snapshots = client.get("/api/snapshots")
    assert snapshots.status_code == 200


def test_status_reports_password_required(monkeypatch):
    client = _client(monkeypatch, "correct-horse")
    status = client.get("/api/auth/status")
    assert status.status_code == 200
    assert status.json()["required"] is True


def test_login_and_status_work_without_token(monkeypatch):
    client = _client(monkeypatch, "correct-horse")
    status = client.get("/api/auth/status")
    login = client.post("/api/auth/login", json={"password": "correct-horse"})
    assert status.status_code == 200
    assert login.status_code == 200
    assert login.json()["token"]
    assert login.json()["required"] is True


def test_protected_route_rejects_missing_token(monkeypatch):
    client = _client(monkeypatch, "correct-horse")
    response = client.get("/api/snapshots")
    assert response.status_code == 401
    assert response.json()["detail"] == "Password required"


def test_login_rejects_wrong_password(monkeypatch):
    client = _client(monkeypatch, "correct-horse")
    response = client.post("/api/auth/login", json={"password": "nope"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Wrong password"


def test_login_token_unlocks_protected_route(monkeypatch):
    password = "correct-horse"
    client = _client(monkeypatch, password)
    login = client.post("/api/auth/login", json={"password": password})
    token = login.json()["token"]
    assert token == _access_token(password)
    response = client.get(
        "/api/snapshots",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200


def test_garbage_token_is_rejected(monkeypatch):
    client = _client(monkeypatch, "correct-horse")
    response = client.get(
        "/api/snapshots",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert response.status_code == 401


def test_secrets_match_is_exact():
    assert _secrets_match("secret", "secret") is True
    assert _secrets_match("secret", "Secret") is False
    assert _secrets_match("", "secret") is False
    assert _secrets_match("secret", "") is False
