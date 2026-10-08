import pytest
from fastapi.testclient import TestClient

from tests.conftest import Headers, book, create_listing, days_from_today, listing_payload


@pytest.mark.parametrize(
    ("nights", "discount"),
    [(6, 0), (7, 3500), (30, 15000)],
)
def test_weekly_discount_applies_from_seven_nights(
    client: TestClient, host: Headers, nights: int, discount: int
) -> None:
    listing = create_listing(
        client, host, price_per_night=2500, cleaning_fee=500, weekly_discount_percent=20
    )
    quote = client.get(
        f"/api/listings/{listing['id']}/quote",
        params={"check_in": days_from_today(10), "check_out": days_from_today(10 + nights)},
    ).json()

    subtotal = 2500 * nights
    service_fee = round((subtotal - discount + 500) * 0.14)
    assert quote["subtotal"] == subtotal
    assert quote["discount"] == discount
    assert quote["service_fee"] == service_fee
    assert quote["total"] == subtotal - discount + 500 + service_fee


def test_booking_snapshots_the_discount(client: TestClient, host: Headers, guest: Headers) -> None:
    listing = create_listing(client, host, price_per_night=2000, weekly_discount_percent=10)
    booking = book(client, guest, listing["id"], 10, 17).json()
    assert booking["discount"] == 1400
    expected_total = booking["subtotal"] - 1400 + booking["cleaning_fee"] + booking["service_fee"]
    assert booking["total"] == expected_total
    assert client.get(f"/api/listings/{listing['id']}").json()["weekly_discount_percent"] == 10


@pytest.mark.parametrize("percent", [-1, 91])
def test_weekly_discount_must_be_a_sane_percentage(
    client: TestClient, host: Headers, percent: int
) -> None:
    response = client.post(
        "/api/listings", json=listing_payload(weekly_discount_percent=percent), headers=host
    )
    assert response.status_code == 422
