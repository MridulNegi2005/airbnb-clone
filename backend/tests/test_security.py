"""Security tests: authentication, authorisation, input handling, uploads and data exposure."""

import base64
import io
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import rate_limit
from app.config import get_settings
from app.models import LISTING_RATING_FIELDS
from tests.conftest import (
    Headers,
    bearer,
    create_listing,
    days_from_today,
    image_bytes,
    insert_booking,
    listing_payload,
    register,
    upload,
    user_id,
)

SECRET_FIELDS = {"password_hash", "google_sub", "email"}


def _keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {key for item in value.values() for key in _keys(item)}
    if isinstance(value, list):
        return {key for item in value for key in _keys(item)}
    return set()


# --- Tokens -------------------------------------------------------------------------------


def test_tampered_and_forged_tokens_are_rejected(client: TestClient, guest: Headers) -> None:
    token = guest["Authorization"].removeprefix("Bearer ")
    header, payload, signature = token.split(".")
    claims = json.loads(base64.urlsafe_b64decode(payload + "=="))
    forged_payload = base64.urlsafe_b64encode(json.dumps({**claims, "sub": "1"}).encode()).rstrip(
        b"="
    )

    tampered = f"{header}.{forged_payload.decode()}.{signature}"
    none_header = base64.urlsafe_b64encode(b'{"alg":"none","typ":"JWT"}').rstrip(b"=").decode()
    unsigned = f"{none_header}.{payload}."
    wrong_key = jwt.encode(claims, "x" * 48, algorithm="HS256")
    for bad in (tampered, unsigned, wrong_key, "", "not.a.jwt"):
        assert client.get("/api/auth/me", headers=bearer(bad)).status_code == 401


def test_expired_and_incomplete_tokens_are_rejected(client: TestClient, guest: Headers) -> None:
    secret = get_settings().secret_key
    subject = str(user_id(client, guest))
    expired = jwt.encode(
        {"sub": subject, "exp": datetime.now(UTC) - timedelta(seconds=1)},
        secret,
        algorithm="HS256",
    )
    no_expiry = jwt.encode({"sub": subject}, secret, algorithm="HS256")
    unknown_user = jwt.encode(
        {"sub": "999999", "exp": datetime.now(UTC) + timedelta(hours=1)}, secret, algorithm="HS256"
    )
    for bad in (expired, no_expiry, unknown_user):
        assert client.get("/api/auth/me", headers=bearer(bad)).status_code == 401


# --- Authorisation (IDOR) -----------------------------------------------------------------


def test_users_cannot_touch_other_users_listings(
    client: TestClient, host: Headers, listing: dict[str, Any]
) -> None:
    intruder = register(client, "Intruder")
    url = f"/api/listings/{listing['id']}"
    assert client.get(f"/api/host/listings/{listing['id']}", headers=intruder).status_code == 403
    assert client.put(url, json={}, headers=intruder).status_code in (403, 422)
    assert client.delete(url, headers=intruder).status_code == 403
    assert client.get(url).status_code == 200


def test_users_cannot_read_or_change_other_users_bookings(
    client: TestClient, host: Headers, guest: Headers, listing: dict[str, Any]
) -> None:
    intruder = register(client, "Intruder")
    stay = {
        "listing_id": listing["id"],
        "check_in": days_from_today(5),
        "check_out": days_from_today(7),
    }
    booking_id = client.post("/api/bookings", json=stay, headers=guest).json()["id"]
    past_id = insert_booking(listing["id"], user_id(client, guest))
    guest_review = {"rating": 1, "comment": "fake"}
    stay_review = {field: 1 for field in LISTING_RATING_FIELDS} | {"comment": "fake"}

    def post(path: str, headers: Headers, body: Any = None) -> int:
        return client.post(f"/api/bookings/{path}", json=body, headers=headers).status_code

    assert client.get(f"/api/bookings/{booking_id}", headers=intruder).status_code == 404
    assert post(f"{booking_id}/cancel", intruder) == 404
    assert post(f"{booking_id}/cancel", host) == 404
    assert post(f"{past_id}/guest-review", intruder, guest_review) == 404
    assert post(f"{past_id}/guest-review", guest, guest_review) == 404
    assert post(f"{past_id}/review", host, stay_review) == 404
    assert all(b["id"] != booking_id for b in client.get("/api/bookings", headers=intruder).json())
    assert client.get("/api/host/bookings", headers=intruder).json() == []


def test_users_cannot_read_or_change_other_users_wishlists(
    client: TestClient, guest: Headers, listing: dict[str, Any]
) -> None:
    intruder = register(client, "Intruder")
    wishlist_id = client.post("/api/wishlists", json={"name": "Mine"}, headers=guest).json()["id"]
    base = f"/api/wishlists/{wishlist_id}"
    assert client.get(base, headers=intruder).status_code == 404
    assert client.patch(base, json={"name": "Hacked"}, headers=intruder).status_code == 404
    assert client.put(f"{base}/listings/{listing['id']}", headers=intruder).status_code == 404
    assert client.delete(base, headers=intruder).status_code == 404
    assert client.get(base, headers=guest).json()["name"] == "Mine"


def test_users_cannot_read_or_post_in_other_conversations(
    client: TestClient, guest: Headers, listing: dict[str, Any]
) -> None:
    intruder = register(client, "Intruder")
    thread = client.post(
        "/api/conversations", json={"listing_id": listing["id"], "body": "Hi"}, headers=guest
    ).json()
    base = f"/api/conversations/{thread['id']}"
    assert client.get(f"{base}/messages", headers=intruder).status_code == 404
    assert (
        client.post(f"{base}/messages", json={"body": "spam"}, headers=intruder).status_code == 404
    )
    assert client.post(f"{base}/read", headers=intruder).status_code == 404
    assert client.get("/api/conversations", headers=intruder).json() == []


def test_users_cannot_use_other_users_uploads(client: TestClient, host: Headers) -> None:
    url = upload(client, host).json()["url"]
    intruder = register(client, "Intruder")
    assert (
        client.patch("/api/users/me", json={"avatar_url": url}, headers=intruder).status_code == 422
    )
    response = client.post(
        "/api/listings", json=listing_payload(image_urls=[url]), headers=intruder
    )
    assert response.status_code == 422


# --- Mass assignment ----------------------------------------------------------------------


def test_listing_payload_cannot_set_protected_fields(client: TestClient, host: Headers) -> None:
    other_id = user_id(client, register(client, "Other"))
    listing = create_listing(
        client, host, host_id=other_id, rating=5, archived_at="2020-01-01T00:00:00Z", id=999
    )
    assert listing["host"]["name"] == "Host"
    assert listing["rating"] is None
    assert listing["id"] != 999
    assert client.get(f"/api/listings/{listing['id']}").status_code == 200


def test_profile_update_cannot_set_protected_fields(client: TestClient, guest: Headers) -> None:
    response = client.patch(
        "/api/users/me",
        json={
            "about": "hello",
            "is_superhost": True,
            "email": "admin@example.com",
            "identity_verified_at": "2020-01-01T00:00:00Z",
            "password_hash": "x",
        },
        headers=guest,
    )
    assert response.status_code == 200
    me = response.json()
    assert me["about"] == "hello"
    assert me["is_superhost"] is False
    assert me["email"] == "guest@example.com"
    assert me["is_identity_verified"] is False


# --- Injection and stored content ---------------------------------------------------------


@pytest.mark.parametrize(
    "payload", ["' OR 1=1 --", "%", "_", "%' UNION SELECT password_hash FROM users --", "\\"]
)
def test_search_input_is_never_interpreted(
    client: TestClient, listing: dict[str, Any], payload: str
) -> None:
    response = client.get("/api/listings", params={"location": payload})
    assert response.status_code == 200
    assert response.json()["total"] == 0


def test_html_in_user_text_is_returned_as_inert_json(
    client: TestClient, guest: Headers, listing: dict[str, Any]
) -> None:
    script = "<script>alert(document.cookie)</script>"
    response = client.post(
        "/api/conversations", json={"listing_id": listing["id"], "body": script}, headers=guest
    )
    assert response.headers["content-type"].startswith("application/json")
    assert response.json()["last_message"]["body"] == script


def test_validation_errors_do_not_echo_input(client: TestClient) -> None:
    secret_looking = "s3cr3t-" + "x" * 40
    response = client.post(
        "/api/auth/register", json={"name": "", "email": secret_looking, "password": "1"}
    )
    assert response.status_code == 422
    assert secret_looking not in response.text


# --- Uploads ------------------------------------------------------------------------------

SVG = b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>'
HTML_AS_PNG = b"\x89PNG\r\n\x1a\n<html><script>alert(1)</script></html>"


@pytest.mark.parametrize(
    ("filename", "data", "mime"),
    [
        ("evil.svg", SVG, "image/svg+xml"),
        ("evil.png", HTML_AS_PNG, "image/png"),
        ("evil.html", b"<html></html>", "text/html"),
        ("evil.gif", b"GIF89a" + b"\x00" * 64, "image/gif"),
    ],
)
def test_non_image_and_unsupported_uploads_are_rejected(
    client: TestClient, host: Headers, filename: str, data: bytes, mime: str
) -> None:
    files = {"file": (filename, data, mime)}
    assert client.post("/api/uploads", files=files, headers=host).status_code == 415


def test_decompression_bomb_is_rejected(client: TestClient, host: Headers) -> None:
    buffer = io.BytesIO()
    Image.new("1", (12_000, 12_000)).save(buffer, "PNG")
    assert len(buffer.getvalue()) < 1_000_000
    files = {"file": ("bomb.png", buffer.getvalue(), "image/png")}
    assert client.post("/api/uploads", files=files, headers=host).status_code == 415


def test_upload_filename_cannot_choose_the_storage_path(client: TestClient, host: Headers) -> None:
    files = {"file": ("../../../app/main.py", image_bytes(), "image/png")}
    url = client.post("/api/uploads", files=files, headers=host).json()["url"]
    assert "/media/uploads/" in url
    assert ".." not in url
    assert url.endswith(".webp")


def test_uploads_require_content_length(client: TestClient, host: Headers) -> None:
    def chunks() -> Any:
        yield b"x" * 10

    response = client.post(
        "/api/uploads", content=chunks(), headers={**host, "Content-Type": "image/png"}
    )
    assert response.status_code == 411


@pytest.mark.parametrize("path", ["/media/../app/config.py", "/media/%2e%2e/app/config.py"])
def test_media_paths_cannot_escape_the_media_folder(client: TestClient, path: str) -> None:
    response = client.get(path)
    assert response.status_code == 404
    assert "secret_key" not in response.text


# --- Data exposure ------------------------------------------------------------------------


def test_public_responses_never_expose_private_user_fields(
    client: TestClient, host: Headers, guest: Headers, listing: dict[str, Any]
) -> None:
    host_id = listing["host"]["id"]
    insert_booking(listing["id"], user_id(client, guest))
    public = [
        client.get("/api/listings").json(),
        client.get(f"/api/listings/{listing['id']}").json(),
        client.get(f"/api/listings/{listing['id']}/reviews").json(),
        client.get(f"/api/users/{host_id}").json(),
        client.get(f"/api/users/{host_id}/listings").json(),
        client.get(f"/api/users/{host_id}/reviews", params={"about": "host"}).json(),
    ]
    for body in public:
        assert not (_keys(body) & SECRET_FIELDS)
    assert "address" not in client.get(f"/api/listings/{listing['id']}").json()


def test_map_search_cannot_reveal_the_exact_location(
    client: TestClient, host: Headers, listing: dict[str, Any]
) -> None:
    exact = client.get(f"/api/host/listings/{listing['id']}", headers=host).json()
    tiny_box = {
        "sw_lat": exact["latitude"] - 0.0001,
        "sw_lng": exact["longitude"] - 0.0001,
        "ne_lat": exact["latitude"] + 0.0001,
        "ne_lng": exact["longitude"] + 0.0001,
    }
    assert client.get("/api/listings", params=tiny_box).json()["total"] == 0
    public = client.get(f"/api/listings/{listing['id']}").json()
    around_public = {
        "sw_lat": public["latitude"] - 0.0001,
        "sw_lng": public["longitude"] - 0.0001,
        "ne_lat": public["latitude"] + 0.0001,
        "ne_lng": public["longitude"] + 0.0001,
    }
    assert client.get("/api/listings", params=around_public).json()["total"] == 1


def test_public_coordinates_are_approximate(
    client: TestClient, host: Headers, listing: dict[str, Any]
) -> None:
    exact = client.get(f"/api/host/listings/{listing['id']}", headers=host).json()
    public = client.get(f"/api/listings/{listing['id']}").json()
    assert (public["latitude"], public["longitude"]) != (exact["latitude"], exact["longitude"])
    assert abs(public["latitude"] - exact["latitude"]) <= 0.0031
    assert abs(public["longitude"] - exact["longitude"]) <= 0.0031


def test_errors_do_not_leak_internals(client: TestClient) -> None:
    for response in (
        client.get("/api/listings/0"),
        client.get("/api/listings/abc"),
        client.post(
            "/api/bookings", content=b"{not json", headers={"Content-Type": "application/json"}
        ),
    ):
        assert "Traceback" not in response.text
        assert "sqlalchemy" not in response.text.lower()


# --- CORS and rate limits -----------------------------------------------------------------


def test_cors_allows_only_configured_origins(client: TestClient) -> None:
    preflight = {"Access-Control-Request-Method": "GET"}
    allowed = client.options(
        "/api/listings", headers={**preflight, "Origin": "http://localhost:3000"}
    )
    blocked = client.options(
        "/api/listings", headers={**preflight, "Origin": "https://evil.example"}
    )
    assert allowed.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert "access-control-allow-origin" not in blocked.headers
    assert "access-control-allow-credentials" not in allowed.headers


def test_global_rate_limit_applies_to_every_api_route(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(rate_limit.global_limiter, "limit", 5)
    statuses = [client.get("/api/categories").status_code for _ in range(6)]
    assert statuses == [200] * 5 + [429]
    blocked = client.get("/api/categories")
    assert blocked.headers["retry-after"] == "60"
