import os
import tempfile
from collections.abc import Iterator
from datetime import date, timedelta
from pathlib import Path
from typing import Any

_tmp = Path(tempfile.mkdtemp(prefix="airbnb-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_tmp / 'test.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(_tmp / "uploads")
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-hs256"

import pytest
from fastapi.testclient import TestClient

from app import security
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Amenity, Booking, Category, Listing
from app.rate_limit import auth_limiter

Headers = dict[str, str]


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(security, "_PBKDF2_ITERATIONS", 1_000)
    auth_limiter.reset()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def catalog() -> dict[str, list[int]]:
    with SessionLocal() as db:
        amenities = [Amenity(name=name, icon=name.lower()) for name in ("Wifi", "Pool", "Kitchen")]
        categories = [
            Category(slug="beachfront", name="Beachfront", icon="beach"),
            Category(slug="cabins", name="Cabins", icon="cabin"),
        ]
        db.add_all([*amenities, *categories])
        db.commit()
        return {
            "amenities": [amenity.id for amenity in amenities],
            "categories": [category.id for category in categories],
        }


def register(client: TestClient, name: str) -> Headers:
    response = client.post(
        "/api/auth/register",
        json={"name": name, "email": f"{name.lower()}@example.com", "password": "password123"},
    )
    assert response.status_code == 201
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def host(client: TestClient) -> Headers:
    return register(client, "Host")


@pytest.fixture
def guest(client: TestClient) -> Headers:
    return register(client, "Guest")


def listing_payload(**overrides: Any) -> dict[str, Any]:
    payload = {
        "title": "Sunny loft near the beach",
        "description": "A bright loft two minutes from the sand.",
        "property_type": "apartment",
        "room_type": "entire_home",
        "address": "12 Ocean Drive",
        "city": "Goa",
        "country": "India",
        "latitude": 15.5,
        "longitude": 73.8,
        "price_per_night": 100,
        "cleaning_fee": 20,
        "max_guests": 4,
        "bedrooms": 2,
        "beds": 2,
        "bathrooms": 1.5,
        "image_urls": ["https://example.com/a.jpg", "https://example.com/b.jpg"],
        "amenity_ids": [],
        "category_ids": [],
    }
    return payload | overrides


def create_listing(client: TestClient, headers: Headers, **overrides: Any) -> dict[str, Any]:
    response = client.post("/api/listings", json=listing_payload(**overrides), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def listing(client: TestClient, host: Headers) -> dict[str, Any]:
    return create_listing(client, host)


def days_from_today(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def insert_past_booking(listing_id: int, guest_id: int) -> int:
    with SessionLocal() as db:
        listing = db.get(Listing, listing_id)
        assert listing is not None
        booking = Booking(
            listing_id=listing_id,
            guest_id=guest_id,
            check_in=date.today() - timedelta(days=10),
            check_out=date.today() - timedelta(days=7),
            guests=2,
            nightly_rate=listing.price_per_night,
            cleaning_fee=listing.cleaning_fee,
            service_fee=0,
            total=listing.price_per_night * 3 + listing.cleaning_fee,
        )
        db.add(booking)
        db.commit()
        return booking.id
