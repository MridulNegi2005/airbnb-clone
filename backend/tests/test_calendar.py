from fastapi.testclient import TestClient

from tests.conftest import (
    Headers,
    Json,
    book,
    create_listing,
    days_from_today,
    listing_payload,
    register,
)


def block(client: TestClient, headers: Headers, listing_id: int, start: int, end: int) -> object:
    return client.post(
        f"/api/host/listings/{listing_id}/blocked-dates",
        json={"start_date": days_from_today(start), "end_date": days_from_today(end)},
        headers=headers,
    )


def test_host_blocks_and_unblocks_dates(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    created = block(client, host, listing["id"], 10, 13)
    assert created.status_code == 201
    period = created.json()

    url = f"/api/host/listings/{listing['id']}/blocked-dates"
    assert client.get(url, headers=host).json() == [period]
    booked = client.get(f"/api/listings/{listing['id']}/booked-dates").json()
    assert {"check_in": days_from_today(10), "check_out": days_from_today(13)} in booked

    assert book(client, guest, listing["id"], 11, 12).status_code == 409
    assert book(client, guest, listing["id"], 13, 15).status_code == 201

    assert client.delete(f"{url}/{period['id']}", headers=host).status_code == 204
    assert book(client, guest, listing["id"], 10, 12).status_code == 201


def test_blocked_dates_hide_listing_from_date_search(
    client: TestClient, host: Headers, listing: Json
) -> None:
    block(client, host, listing["id"], 20, 25)
    stay = {"check_in": days_from_today(21), "check_out": days_from_today(23)}
    assert client.get("/api/listings", params=stay).json()["total"] == 0
    quote = client.get(f"/api/listings/{listing['id']}/quote", params=stay).json()
    assert quote["available"] is False


def test_cannot_block_booked_overlapping_or_past_nights(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    assert book(client, guest, listing["id"], 5, 8).status_code == 201
    assert block(client, host, listing["id"], 7, 9).status_code == 409
    assert block(client, host, listing["id"], 8, 10).status_code == 201
    assert block(client, host, listing["id"], 9, 12).status_code == 409
    assert block(client, host, listing["id"], -2, 1).status_code == 422
    assert block(client, host, listing["id"], 3, 3).status_code == 422


def test_only_the_owner_manages_the_calendar(
    client: TestClient, host: Headers, listing: Json
) -> None:
    intruder = register(client, "Intruder")
    url = f"/api/host/listings/{listing['id']}/blocked-dates"
    period = block(client, host, listing["id"], 4, 6).json()
    assert client.get(url, headers=intruder).status_code == 403
    assert block(client, intruder, listing["id"], 10, 12).status_code == 403
    assert client.delete(f"{url}/{period['id']}", headers=intruder).status_code == 403

    other = create_listing(client, intruder)
    assert (
        client.delete(
            f"/api/host/listings/{other['id']}/blocked-dates/{period['id']}", headers=intruder
        ).status_code
        == 404
    )


def test_minimum_and_maximum_nights_are_enforced(
    client: TestClient, host: Headers, guest: Headers
) -> None:
    listing = create_listing(client, host, min_nights=3, max_nights=5)
    assert listing["min_nights"] == 3
    assert book(client, guest, listing["id"], 5, 7).status_code == 422
    assert book(client, guest, listing["id"], 5, 11).status_code == 422
    assert book(client, guest, listing["id"], 5, 8).status_code == 201

    short = {"check_in": days_from_today(20), "check_out": days_from_today(22)}
    assert client.get("/api/listings", params=short).json()["total"] == 0
    fits = {"check_in": days_from_today(20), "check_out": days_from_today(24)}
    assert client.get("/api/listings", params=fits).json()["total"] == 1


def test_minimum_nights_cannot_exceed_maximum(client: TestClient, host: Headers) -> None:
    response = client.post(
        "/api/listings",
        json=listing_payload(min_nights=6, max_nights=5),
        headers=host,
    )
    assert response.status_code == 422
