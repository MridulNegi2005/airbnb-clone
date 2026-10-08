import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from app.rate_limit import global_limiter
from tests.conftest import Headers

HUGE = "99999999999999999999"


def test_out_of_range_ids_return_422(client: TestClient, guest: Headers) -> None:
    assert client.get(f"/api/listings/{HUGE}").status_code == 422
    assert client.get("/api/listings/0").status_code == 422
    assert client.get("/api/listings", params={"min_price": HUGE}).status_code == 422
    assert client.get("/api/listings", params={"page": HUGE}).status_code == 422
    assert client.get("/api/listings", params={"page_size": 51}).status_code == 422
    assert client.get(f"/api/users/{HUGE}").status_code == 422
    assert client.put(f"/api/wishlists/{HUGE}/listings/1", headers=guest).status_code == 422
    assert client.put(f"/api/wishlists/1/listings/{HUGE}", headers=guest).status_code == 422
    assert client.get(f"/api/conversations/{HUGE}/messages", headers=guest).status_code == 422
    assert (
        client.get("/api/host/bookings", params={"listing_id": HUGE}, headers=guest).status_code
        == 422
    )
    booking = {"listing_id": int(HUGE), "check_in": "2030-01-01", "check_out": "2030-01-03"}
    assert client.post("/api/bookings", json=booking, headers=guest).status_code == 422
    start = {"listing_id": int(HUGE), "body": "Hi"}
    assert client.post("/api/conversations", json=start, headers=guest).status_code == 422


def test_settings_reject_placeholder_secret() -> None:
    with pytest.raises(ValidationError):
        Settings(secret_key="replace-with-at-least-32-random-characters")
    with pytest.raises(ValidationError):
        Settings(secret_key="too-short")


def test_settings_require_a_bucket_for_gcs() -> None:
    with pytest.raises(ValidationError):
        Settings(secret_key="x" * 40, storage_backend="gcs", gcs_bucket=None)


def test_non_finite_json_numbers_return_422(client: TestClient, guest: Headers) -> None:
    body = '{"name": NaN, "email": "a@example.com", "password": "password123"}'
    headers = {"Content-Type": "application/json"}
    response = client.post("/api/auth/register", content=body, headers=headers)
    assert response.status_code == 422
    assert "input" not in response.json()["detail"][0]

    booking = '{"listing_id": 1e400, "check_in": "2030-01-01", "check_out": "2030-01-03"}'
    response = client.post("/api/bookings", content=booking, headers={**guest, **headers})
    assert response.status_code == 422

    bounds = {"sw_lat": "NaN", "sw_lng": 77.4, "ne_lat": 13.1, "ne_lng": 77.8}
    assert client.get("/api/listings", params=bounds).status_code == 422


def test_health(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_global_rate_limit_applies_to_api_routes_only(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(global_limiter, "limit", 3)
    assert [client.get("/api/health").status_code for _ in range(4)] == [200, 200, 200, 429]
    assert client.get("/api/health").headers["retry-after"] == "60"
    assert client.get("/media/missing.webp").status_code == 404
