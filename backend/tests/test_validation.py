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
