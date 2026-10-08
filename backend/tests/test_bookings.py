import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.database import SessionLocal
from app.models import Booking, BookingStatus
from tests.conftest import (
    INDIRANAGAR,
    Headers,
    Json,
    book,
    days_from_today,
    insert_booking,
    register,
    user_id,
)


def test_quote_breaks_down_price_in_rupees(client: TestClient, listing: Json) -> None:
    response = client.get(
        f"/api/listings/{listing['id']}/quote",
        params={"check_in": days_from_today(3), "check_out": days_from_today(6), "guests": 2},
    )
    assert response.status_code == 200
    assert response.json() == {
        "nights": 3,
        "nightly_rate": 2500,
        "subtotal": 7500,
        "discount": 0,
        "cleaning_fee": 500,
        "service_fee": 1120,
        "total": 9120,
        "available": True,
    }


def test_booking_snapshots_price_and_blocks_dates(
    client: TestClient, guest: Headers, listing: Json
) -> None:
    response = book(client, guest, listing["id"], 3, 6)
    assert response.status_code == 201
    booking = response.json()
    assert booking["status"] == "confirmed"
    assert booking["cancelled_at"] is None
    assert booking["nights"] == 3
    assert booking["subtotal"] == 7500
    assert booking["total"] == 9120
    assert booking["has_review"] is False
    assert booking["has_guest_review"] is False
    assert booking["listing"]["cover_image_url"] == "https://example.com/a.jpg"

    booked = client.get(f"/api/listings/{listing['id']}/booked-dates").json()
    assert booked == [{"check_in": days_from_today(3), "check_out": days_from_today(6)}]
    quote = client.get(
        f"/api/listings/{listing['id']}/quote",
        params={"check_in": days_from_today(4), "check_out": days_from_today(5)},
    )
    assert quote.json()["available"] is False


def test_booking_shares_exact_address_with_guest_and_host(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    booking_id = book(client, guest, listing["id"], 3, 6).json()["id"]
    for headers in (guest, host):
        place = client.get(f"/api/bookings/{booking_id}", headers=headers).json()["listing"]
        assert place["address"] == "12 HAL 2nd Stage"
        assert (place["latitude"], place["longitude"]) == INDIRANAGAR
        assert place["host"]["name"] == "Host"


def test_overlapping_booking_is_rejected(client: TestClient, guest: Headers, listing: Json) -> None:
    other = register(client, "Other")
    assert book(client, guest, listing["id"], 3, 6).status_code == 201
    assert book(client, other, listing["id"], 5, 8).status_code == 409
    assert book(client, other, listing["id"], 1, 4).status_code == 409
    assert book(client, other, listing["id"], 6, 8).status_code == 201


def test_booking_validation(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    assert book(client, host, listing["id"], 3, 6).status_code == 403
    assert book(client, guest, listing["id"], -2, 1).status_code == 422
    assert book(client, guest, listing["id"], 3, 3).status_code == 422
    assert book(client, guest, listing["id"], 3, 400).status_code == 422
    assert book(client, guest, listing["id"], 3, 6, guests=5).status_code == 422
    assert book(client, guest, 999, 3, 6).status_code == 404
    assert client.post("/api/bookings", json={"listing_id": listing["id"]}).status_code == 401


def test_trips_and_visibility(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    booking_id = book(client, guest, listing["id"], 3, 6).json()["id"]
    stranger = register(client, "Stranger")

    trips = client.get("/api/bookings", headers=guest).json()
    assert [trip["id"] for trip in trips] == [booking_id]
    assert client.get(f"/api/bookings/{booking_id}", headers=host).status_code == 200
    assert client.get(f"/api/bookings/{booking_id}", headers=stranger).status_code == 404

    reservations = client.get("/api/host/bookings", headers=host).json()
    assert reservations[0]["guest"]["name"] == "Guest"
    filtered = client.get("/api/host/bookings", params={"listing_id": 999}, headers=host)
    assert filtered.json() == []


def test_host_listings_count_upcoming_bookings(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    book(client, guest, listing["id"], 3, 6)
    host_listings = client.get("/api/host/listings", headers=host).json()
    assert host_listings[0]["id"] == listing["id"]
    assert host_listings[0]["upcoming_booking_count"] == 1
    assert "address" not in host_listings[0]


def test_cancel_records_time_and_frees_dates(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    booking_id = book(client, guest, listing["id"], 3, 6).json()["id"]
    url = f"/api/bookings/{booking_id}/cancel"
    assert client.post(url, headers=host).status_code == 404

    response = client.post(url, headers=guest)
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert response.json()["cancelled_at"] is not None
    assert client.post(url, headers=guest).status_code == 400
    assert client.get(f"/api/listings/{listing['id']}/booked-dates").json() == []
    assert book(client, guest, listing["id"], 3, 6).status_code == 201


def test_past_and_current_trips_cannot_be_cancelled(
    client: TestClient, guest: Headers, listing: Json
) -> None:
    guest_id = user_id(client, guest)
    for start, end in ((-10, -7), (0, 2)):
        booking_id = insert_booking(listing["id"], guest_id, start, end)
        assert client.post(f"/api/bookings/{booking_id}/cancel", headers=guest).status_code == 400


def test_status_and_cancelled_at_must_agree(
    client: TestClient, guest: Headers, listing: Json
) -> None:
    booking_id = insert_booking(listing["id"], user_id(client, guest), 3, 6)
    with SessionLocal() as db:
        booking = db.get(Booking, booking_id)
        assert booking is not None
        booking.status = BookingStatus.CANCELLED
        with pytest.raises(IntegrityError):
            db.commit()


def test_bookings_are_rate_limited_per_user(
    client: TestClient, guest: Headers, listing: Json
) -> None:
    for week in range(10):
        start = 7 * week + 1
        assert book(client, guest, listing["id"], start, start + 2).status_code == 201

    limited = book(client, guest, listing["id"], 100, 102)
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "3600"
    assert book(client, register(client, "Other"), listing["id"], 100, 102).status_code == 201
