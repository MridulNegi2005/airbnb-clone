import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Settings
from tests.conftest import Headers

HUGE = "99999999999999999999"


def test_out_of_range_ids_return_422(client: TestClient, guest: Headers) -> None:
    assert client.get(f"/api/listings/{HUGE}").status_code == 422
    assert client.get("/api/listings", params={"min_price": HUGE}).status_code == 422
    assert client.get("/api/listings", params={"page": HUGE}).status_code == 422
    assert client.put(f"/api/wishlist/{HUGE}", headers=guest).status_code == 422
    booking = {"listing_id": int(HUGE), "check_in": "2030-01-01", "check_out": "2030-01-03"}
    assert client.post("/api/bookings", json=booking, headers=guest).status_code == 422


def test_settings_reject_placeholder_secret() -> None:
    with pytest.raises(ValidationError):
        Settings(secret_key="replace-with-at-least-32-random-characters")


def test_non_finite_json_numbers_return_422(client: TestClient, guest: Headers) -> None:
    body = '{"name": NaN, "email": "a@example.com", "password": "password123"}'
    headers = {"Content-Type": "application/json"}
    response = client.post("/api/auth/register", content=body, headers=headers)
    assert response.status_code == 422
    assert "input" not in response.json()["detail"][0]

    booking = '{"listing_id": 1e400, "check_in": "2030-01-01", "check_out": "2030-01-03"}'
    response = client.post("/api/bookings", content=booking, headers={**guest, **headers})
    assert response.status_code == 422
