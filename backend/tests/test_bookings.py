from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import Headers, days_from_today, insert_past_booking, register

REVIEW = {
    "rating": 5,
    "cleanliness": 5,
    "accuracy": 4,
    "check_in": 5,
    "communication": 5,
    "location": 4,
    "value": 5,
    "comment": "Lovely stay.",
}


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


def test_quote_breaks_down_price(client: TestClient, listing: dict[str, Any]) -> None:
    response = client.get(
        f"/api/listings/{listing['id']}/quote",
        params={"check_in": days_from_today(3), "check_out": days_from_today(6), "guests": 2},
    )
    assert response.status_code == 200
    assert response.json() == {
        "nights": 3,
        "nightly_rate": 100,
        "subtotal": 300,
        "cleaning_fee": 20,
        "service_fee": 45,
        "total": 365,
        "available": True,
    }


def test_booking_snapshots_price_and_blocks_dates(
    client: TestClient, guest: Headers, listing: dict[str, Any]
) -> None:
    response = book(client, guest, listing["id"], 3, 6)
    assert response.status_code == 201
    booking = response.json()
    assert booking["status"] == "confirmed"
    assert booking["nights"] == 3
    assert booking["total"] == 365
    assert booking["listing"]["cover_image_url"] == "https://example.com/a.jpg"

    booked = client.get(f"/api/listings/{listing['id']}/booked-dates").json()
    assert booked == [{"check_in": days_from_today(3), "check_out": days_from_today(6)}]


def test_overlapping_booking_is_rejected(
    client: TestClient, guest: Headers, listing: dict[str, Any]
) -> None:
    other = register(client, "Other")
    assert book(client, guest, listing["id"], 3, 6).status_code == 201
    assert book(client, other, listing["id"], 5, 8).status_code == 409
    assert book(client, other, listing["id"], 1, 4).status_code == 409
    assert book(client, other, listing["id"], 6, 8).status_code == 201


def test_booking_validation(
    client: TestClient, host: Headers, guest: Headers, listing: dict[str, Any]
) -> None:
    assert book(client, host, listing["id"], 3, 6).status_code == 403
    assert book(client, guest, listing["id"], -2, 1).status_code == 422
    assert book(client, guest, listing["id"], 3, 3).status_code == 422
    assert book(client, guest, listing["id"], 3, 6, guests=9).status_code == 422
    assert book(client, guest, 999, 3, 6).status_code == 404


def test_trips_and_visibility(
    client: TestClient, host: Headers, guest: Headers, listing: dict[str, Any]
) -> None:
    booking_id = book(client, guest, listing["id"], 3, 6).json()["id"]
    stranger = register(client, "Stranger")

    trips = client.get("/api/bookings", headers=guest).json()
    assert [trip["id"] for trip in trips] == [booking_id]
    assert client.get(f"/api/bookings/{booking_id}", headers=host).status_code == 200
    assert client.get(f"/api/bookings/{booking_id}", headers=stranger).status_code == 404

    reservations = client.get("/api/host/bookings", headers=host).json()
    assert reservations[0]["guest"]["name"] == "Guest"
    host_listings = client.get("/api/host/listings", headers=host).json()
    assert host_listings[0]["upcoming_booking_count"] == 1


def test_cancel_frees_dates(client: TestClient, guest: Headers, listing: dict[str, Any]) -> None:
    booking_id = book(client, guest, listing["id"], 3, 6).json()["id"]
    response = client.post(f"/api/bookings/{booking_id}/cancel", headers=guest)
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"
    assert client.post(f"/api/bookings/{booking_id}/cancel", headers=guest).status_code == 400
    assert book(client, guest, listing["id"], 3, 6).status_code == 201


def test_review_after_stay_updates_rating(
    client: TestClient, guest: Headers, listing: dict[str, Any]
) -> None:
    guest_id = client.get("/api/auth/me", headers=guest).json()["id"]
    upcoming_id = book(client, guest, listing["id"], 3, 6).json()["id"]
    past_id = insert_past_booking(listing["id"], guest_id)

    assert (
        client.post(f"/api/bookings/{upcoming_id}/review", json=REVIEW, headers=guest).status_code
        == 400
    )
    response = client.post(f"/api/bookings/{past_id}/review", json=REVIEW, headers=guest)
    assert response.status_code == 201
    assert response.json()["author"]["name"] == "Guest"
    assert (
        client.post(f"/api/bookings/{past_id}/review", json=REVIEW, headers=guest).status_code
        == 409
    )

    detail = client.get(f"/api/listings/{listing['id']}").json()
    assert detail["rating"] == 5.0
    assert detail["review_count"] == 1

    reviews = client.get(f"/api/listings/{listing['id']}/reviews").json()
    assert reviews["total"] == 1
    assert reviews["summary"]["accuracy"] == 4.0
    assert reviews["items"][0]["comment"] == "Lovely stay."
