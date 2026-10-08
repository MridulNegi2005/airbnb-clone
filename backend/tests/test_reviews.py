from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.models import BookingStatus
from tests.conftest import Headers, Json, book, insert_booking, register, user_id

LISTING_REVIEW = {
    "rating": 5,
    "cleanliness": 5,
    "accuracy": 4,
    "check_in": 5,
    "communication": 5,
    "location": 4,
    "value": 5,
    "comment": "Lovely stay.",
}
GUEST_REVIEW = {"rating": 4, "comment": "Tidy and friendly guest."}


def review_stay(client: TestClient, headers: Headers, booking_id: int, **overrides: Any) -> Any:
    return client.post(
        f"/api/bookings/{booking_id}/review", json=LISTING_REVIEW | overrides, headers=headers
    )


def review_guest(client: TestClient, headers: Headers, booking_id: int, **overrides: Any) -> Any:
    return client.post(
        f"/api/bookings/{booking_id}/guest-review", json=GUEST_REVIEW | overrides, headers=headers
    )


@pytest.fixture
def past_stay(client: TestClient, guest: Headers, listing: Json) -> int:
    return insert_booking(listing["id"], user_id(client, guest))


def test_guest_reviews_listing_after_check_out(
    client: TestClient, guest: Headers, listing: Json, past_stay: int
) -> None:
    response = review_stay(client, guest, past_stay)
    assert response.status_code == 201
    assert response.json()["author"]["name"] == "Guest"
    assert response.json()["accuracy"] == 4

    trip = client.get(f"/api/bookings/{past_stay}", headers=guest).json()
    assert trip["has_review"] is True
    assert trip["has_guest_review"] is False

    detail = client.get(f"/api/listings/{listing['id']}").json()
    assert detail["rating"] == 5.0
    assert detail["review_count"] == 1

    reviews = client.get(f"/api/listings/{listing['id']}/reviews").json()
    assert reviews["total"] == 1
    assert reviews["summary"]["count"] == 1
    assert reviews["summary"]["accuracy"] == 4.0
    assert reviews["summary"]["location"] == 4.0
    assert reviews["items"][0]["comment"] == "Lovely stay."


def test_listing_review_rules(
    client: TestClient, host: Headers, guest: Headers, listing: Json, past_stay: int
) -> None:
    upcoming = book(client, guest, listing["id"], 3, 6).json()["id"]
    cancelled = insert_booking(
        listing["id"], user_id(client, guest), status=BookingStatus.CANCELLED
    )

    assert review_stay(client, guest, upcoming).status_code == 400
    assert review_stay(client, guest, cancelled).status_code == 400
    assert review_stay(client, host, past_stay).status_code == 404
    assert review_stay(client, register(client, "Stranger"), past_stay).status_code == 404
    assert review_stay(client, guest, past_stay, rating=6).status_code == 422
    assert review_stay(client, guest, past_stay, cleanliness=0).status_code == 422
    assert review_stay(client, guest, past_stay, comment="   ").status_code == 422

    assert review_stay(client, guest, past_stay).status_code == 201
    assert review_stay(client, guest, past_stay).status_code == 409


def test_host_reviews_guest_after_check_out(
    client: TestClient, host: Headers, guest: Headers, listing: Json, past_stay: int
) -> None:
    response = review_guest(client, host, past_stay)
    assert response.status_code == 201
    assert response.json()["author"]["name"] == "Host"
    assert response.json()["rating"] == 4

    reservation = client.get(f"/api/bookings/{past_stay}", headers=host).json()
    assert reservation["has_guest_review"] is True
    assert reservation["has_review"] is False
    assert review_guest(client, host, past_stay).status_code == 409


def test_guest_review_rules(
    client: TestClient, host: Headers, guest: Headers, listing: Json, past_stay: int
) -> None:
    upcoming = book(client, guest, listing["id"], 3, 6).json()["id"]
    cancelled = insert_booking(
        listing["id"], user_id(client, guest), status=BookingStatus.CANCELLED
    )

    assert review_guest(client, host, upcoming).status_code == 400
    assert review_guest(client, host, cancelled).status_code == 400
    assert review_guest(client, guest, past_stay).status_code == 404
    assert review_guest(client, register(client, "Stranger"), past_stay).status_code == 404
    assert review_guest(client, host, past_stay, rating=0).status_code == 422
    assert review_guest(client, host, 999).status_code == 404


def test_both_sides_can_review_the_same_stay(
    client: TestClient, host: Headers, guest: Headers, past_stay: int
) -> None:
    assert review_stay(client, guest, past_stay).status_code == 201
    assert review_guest(client, host, past_stay).status_code == 201
    trip = client.get(f"/api/bookings/{past_stay}", headers=guest).json()
    assert (trip["has_review"], trip["has_guest_review"]) == (True, True)


def test_reviews_are_paginated_newest_first(
    client: TestClient, guest: Headers, listing: Json
) -> None:
    guest_id = user_id(client, guest)
    for index, rating in enumerate((3, 5)):
        booking_id = insert_booking(listing["id"], guest_id, -20 + index * 5, -18 + index * 5)
        review_stay(client, guest, booking_id, rating=rating, comment=f"Stay {index}")

    page = client.get(f"/api/listings/{listing['id']}/reviews", params={"page_size": 1}).json()
    assert page["total"] == 2
    assert page["has_more"] is True
    assert page["items"][0]["comment"] == "Stay 1"
    assert page["summary"]["rating"] == 4.0
    assert client.get(f"/api/listings/{listing['id']}").json()["rating"] == 4.0
