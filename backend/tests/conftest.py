import os
import tempfile
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Any

_tmp = Path(tempfile.mkdtemp(prefix="airbnb-tests-"))
MEDIA_DIR = _tmp / "media"
os.environ.update(
    DATABASE_URL=f"sqlite:///{(_tmp / 'test.db').as_posix()}",
    SECRET_KEY="test-secret-key-that-is-long-enough-for-hs256",
    STORAGE_BACKEND="local",
    LOCAL_MEDIA_DIR=str(MEDIA_DIR),
    PUBLIC_BASE_URL="http://testserver",
    GOOGLE_CLIENT_ID="test-client-id.cache",
    SERVICE_FEE_RATE="0.14",
    MAX_UPLOAD_BYTES=str(8 * 1024 * 1024),
    RATE_LIMIT_PER_MINUTE="300",
)

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app import rate_limit, security
from app.database import Base, SessionLocal, engine
from app.main import app
from app.models import Amenity, Booking, BookingStatus, Category, Listing

Headers = dict[str, str]
Json = dict[str, Any]

INDIRANAGAR = (12.9716, 77.6411)


@pytest.fixture(autouse=True)
def fresh_db(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(security, "_PBKDF2_ITERATIONS", 1_000)
    rate_limit.reset_all()
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
            Category(slug="city", name="City", icon="city"),
            Category(slug="cabins", name="Cabins", icon="cabin"),
        ]
        db.add_all([*amenities, *categories])
        db.commit()
        return {
            "amenities": [amenity.id for amenity in amenities],
            "categories": [category.id for category in categories],
        }


def bearer(token: str) -> Headers:
    return {"Authorization": f"Bearer {token}"}


def register(client: TestClient, name: str) -> Headers:
    response = client.post(
        "/api/auth/register",
        json={"name": name, "email": f"{name.lower()}@example.com", "password": "password123"},
    )
    assert response.status_code == 201, response.text
    return bearer(response.json()["access_token"])


def user_id(client: TestClient, headers: Headers) -> int:
    return client.get("/api/auth/me", headers=headers).json()["id"]


@pytest.fixture
def host(client: TestClient) -> Headers:
    return register(client, "Host")


@pytest.fixture
def guest(client: TestClient) -> Headers:
    return register(client, "Guest")


def listing_payload(**overrides: Any) -> Json:
    latitude, longitude = INDIRANAGAR
    payload = {
        "title": "Sunny flat near 100 Feet Road",
        "description": "A bright flat close to cafes and the metro.",
        "property_type": "apartment",
        "room_type": "entire_home",
        "address": "12 HAL 2nd Stage",
        "neighbourhood": "Indiranagar",
        "city": "Bengaluru",
        "country": "India",
        "latitude": latitude,
        "longitude": longitude,
        "price_per_night": 2500,
        "cleaning_fee": 500,
        "max_guests": 4,
        "bedrooms": 2,
        "beds": 2,
        "bathrooms": 1.5,
        "image_urls": ["https://example.com/a.jpg", "https://example.com/b.jpg"],
        "amenity_ids": [],
        "category_ids": [],
    }
    return payload | overrides


def create_listing(client: TestClient, headers: Headers, **overrides: Any) -> Json:
    response = client.post("/api/listings", json=listing_payload(**overrides), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def listing(client: TestClient, host: Headers) -> Json:
    return create_listing(client, host)


def days_from_today(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def book(
    client: TestClient, headers: Headers, listing_id: int, start: int, end: int, guests: int = 2
) -> Any:
    return client.post(
        "/api/bookings",
        json={
            "listing_id": listing_id,
            "check_in": days_from_today(start),
            "check_out": days_from_today(end),
            "guests": guests,
        },
        headers=headers,
    )


def insert_booking(
    listing_id: int,
    guest_id: int,
    start: int = -10,
    end: int = -7,
    status: BookingStatus = BookingStatus.CONFIRMED,
) -> int:
    with SessionLocal() as db:
        listing = db.get(Listing, listing_id)
        assert listing is not None
        nights = end - start
        booking = Booking(
            listing_id=listing_id,
            guest_id=guest_id,
            check_in=date.today() + timedelta(days=start),
            check_out=date.today() + timedelta(days=end),
            guests=2,
            nightly_rate=listing.price_per_night,
            cleaning_fee=listing.cleaning_fee,
            service_fee=0,
            total=listing.price_per_night * nights + listing.cleaning_fee,
            status=status,
            cancelled_at=datetime.now(UTC) if status == BookingStatus.CANCELLED else None,
        )
        db.add(booking)
        db.commit()
        return booking.id


def image_bytes(
    image_format: str = "PNG", size: tuple[int, int] = (32, 24), **save_options: Any
) -> bytes:
    mode = "RGBA" if image_format == "PNG" else "RGB"
    buffer = BytesIO()
    Image.new(mode, size, (200, 80, 40)).save(buffer, image_format, **save_options)
    return buffer.getvalue()


def upload(client: TestClient, headers: Headers, data: bytes | None = None) -> Any:
    files = {"file": ("photo.png", data if data is not None else image_bytes(), "image/png")}
    return client.post("/api/uploads", files=files, headers=headers)


def media_path(url: str) -> Path:
    return MEDIA_DIR / url.removeprefix("http://testserver/media/")
