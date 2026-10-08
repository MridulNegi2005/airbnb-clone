from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.routers import auth as auth_router
from app.services.google_identity import GoogleIdentity
from tests.conftest import Headers, bearer, register, user_id


def sign_in_with_google(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    subject: str = "google-sub-1",
    email: str = "ana@example.com",
    picture: str | None = "https://lh3.googleusercontent.com/ana.jpg",
) -> Any:
    def fake_verify(credential: str, client_id: str) -> GoogleIdentity:
        assert (credential, client_id) == ("id-token", get_settings().google_client_id)
        return GoogleIdentity(subject=subject, email=email, name="Ana Google", picture=picture)

    monkeypatch.setattr(auth_router, "verify_google_credential", fake_verify)
    return client.post("/api/auth/google", json={"credential": "id-token"})


def password_login(client: TestClient, email: str, password: str = "password123") -> int:
    return client.post("/api/auth/login", json={"email": email, "password": password}).status_code


def test_register_returns_token_and_normalised_email(client: TestClient) -> None:
    response = client.post(
        "/api/auth/register",
        json={"name": "  Ana  ", "email": "Ana@Example.com", "password": "password123"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"
    assert body["user"]["name"] == "Ana"
    assert body["user"]["email"] == "ana@example.com"
    assert body["user"]["has_password"] is True
    assert body["user"]["has_google"] is False
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
        "/api/auth/login", json={"email": "ANA@example.com", "password": "password123"}
    )
    assert response.status_code == 200

    me = client.get("/api/auth/me", headers=bearer(response.json()["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == "ana@example.com"


def test_login_rejects_wrong_password_and_unknown_email(client: TestClient) -> None:
    register(client, "Ana")
    assert password_login(client, "ana@example.com", "wrong-password") == 401
    assert password_login(client, "nobody@example.com") == 401


def test_me_requires_valid_token(client: TestClient, guest: Headers) -> None:
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers=bearer("not-a-real-token")).status_code == 401
    assert client.get("/api/auth/me", headers=guest).status_code == 200


def test_google_sign_in_creates_a_new_user(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    response = sign_in_with_google(client, monkeypatch)
    assert response.status_code == 200
    user = response.json()["user"]
    assert user["email"] == "ana@example.com"
    assert user["name"] == "Ana Google"
    assert user["avatar_url"] == "https://lh3.googleusercontent.com/ana.jpg"
    assert user["has_google"] is True
    assert user["has_password"] is False

    again = sign_in_with_google(client, monkeypatch)
    assert again.json()["user"]["id"] == user["id"]


def test_google_sign_in_links_existing_password_account(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    original_id = user_id(client, register(client, "Ana"))

    response = sign_in_with_google(client, monkeypatch)
    assert response.status_code == 200
    user = response.json()["user"]
    assert user["id"] == original_id
    assert user["has_google"] is True
    assert user["has_password"] is True
    assert password_login(client, "ana@example.com") == 200


def test_google_sign_in_rejects_a_different_google_account_for_the_same_email(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    assert sign_in_with_google(client, monkeypatch, subject="first").status_code == 200
    assert sign_in_with_google(client, monkeypatch, subject="second").status_code == 409


def test_google_only_user_cannot_log_in_with_a_password(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sign_in_with_google(client, monkeypatch)
    assert password_login(client, "ana@example.com") == 401
    assert password_login(client, "ana@example.com", "") == 401


def test_google_sign_in_rejects_a_malformed_credential(client: TestClient) -> None:
    response = client.post("/api/auth/google", json={"credential": "not-a-jwt"})
    assert response.status_code == 401


def test_google_sign_in_is_unavailable_without_client_id(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "google_client_id", None)
    response = client.post("/api/auth/google", json={"credential": "id-token"})
    assert response.status_code == 503


def test_auth_endpoints_are_rate_limited_per_ip(client: TestClient) -> None:
    statuses = [password_login(client, "ana@example.com", "wrong-password") for _ in range(21)]
    assert statuses[:20] == [401] * 20
    assert statuses[20] == 429

    blocked = client.post(
        "/api/auth/register",
        json={"name": "Ana", "email": "ana@example.com", "password": "password123"},
    )
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == "300"
