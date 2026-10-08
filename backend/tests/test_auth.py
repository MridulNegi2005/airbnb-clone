from fastapi.testclient import TestClient

from tests.conftest import Headers, register


def test_register_returns_token_and_normalised_email(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"name": "  Ana  ", "email": "Ana@Example.com", "password": "password123"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["user"]["name"] == "Ana"
    assert body["user"]["email"] == "ana@example.com"
    assert "password_hash" not in body["user"]


def test_register_rejects_duplicate_email(client: TestClient) -> None:
    register(client, "Ana")
    response = client.post(
        "/api/auth/register",
        json={"name": "Other", "email": "ANA@example.com", "password": "password123"},
    )
    assert response.status_code == 409


def test_register_rejects_short_password(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"name": "Ana", "email": "ana@example.com", "password": "short"},
    )
    assert response.status_code == 422


def test_login_and_me(client: TestClient) -> None:
    register(client, "Ana")
    response = client.post(
        "/api/auth/login", json={"email": "ana@example.com", "password": "password123"}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "ana@example.com"


def test_login_rejects_wrong_password(client: TestClient) -> None:
    register(client, "Ana")
    response = client.post(
        "/api/auth/login", json={"email": "ana@example.com", "password": "wrong-password"}
    )
    assert response.status_code == 401


def test_me_requires_valid_token(client: TestClient, guest: Headers) -> None:
    assert client.get("/api/auth/me").status_code == 401
    bad = {"Authorization": "Bearer not-a-real-token"}
    assert client.get("/api/auth/me", headers=bad).status_code == 401
    assert client.get("/api/auth/me", headers=guest).status_code == 200


def test_login_with_unknown_email_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"email": "nobody@example.com", "password": "password123"}
    )
    assert response.status_code == 401


def test_auth_endpoints_are_rate_limited(client: TestClient) -> None:
    attempt = {"email": "ana@example.com", "password": "wrong-password"}
    statuses = [client.post("/api/auth/login", json=attempt).status_code for _ in range(21)]
    assert statuses[:20] == [401] * 20
    assert statuses[20] == 429
