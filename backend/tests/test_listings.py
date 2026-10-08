from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import Headers, create_listing, days_from_today, listing_payload


def search(client: TestClient, **params: Any) -> dict[str, Any]:
    response = client.get("/api/listings", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_create_listing_returns_detail(
    client: TestClient, host: Headers, catalog: dict[str, list[int]]
) -> None:
    listing = create_listing(
        client,
        host,
        amenity_ids=catalog["amenities"][:2],
        category_ids=catalog["categories"][:1],
    )
    assert listing["host"]["name"] == "Host"
    assert listing["image_urls"] == ["https://example.com/a.jpg", "https://example.com/b.jpg"]
    assert {amenity["name"] for amenity in listing["amenities"]} == {"Pool", "Wifi"}
    assert listing["categories"][0]["slug"] == "beachfront"
    assert listing["rating"] is None
    assert listing["review_count"] == 0


def test_create_listing_requires_auth_and_valid_data(client: TestClient, host: Headers) -> None:
    assert client.post("/api/listings", json=listing_payload()).status_code == 401
    invalid = listing_payload(price_per_night=0, image_urls=[])
    assert client.post("/api/listings", json=invalid, headers=host).status_code == 422
    unknown_amenity = listing_payload(amenity_ids=[999])
    assert client.post("/api/listings", json=unknown_amenity, headers=host).status_code == 422


def test_search_filters(client: TestClient, host: Headers, catalog: dict[str, list[int]]) -> None:
    wifi, pool, _ = catalog["amenities"]
    beachfront, cabins = catalog["categories"]
    create_listing(client, host, amenity_ids=[wifi, pool], category_ids=[beachfront])
    create_listing(
        client,
        host,
        title="Mountain cabin",
        city="Manali",
        price_per_night=250,
        max_guests=8,
        property_type="house",
        amenity_ids=[wifi],
        category_ids=[cabins],
    )

    assert search(client)["total"] == 2
    assert search(client, location="manali, india")["items"][0]["city"] == "Manali"
    assert search(client, location="Paris")["total"] == 0
    assert search(client, max_price=150)["items"][0]["city"] == "Goa"
    assert search(client, guests=6)["items"][0]["city"] == "Manali"
    assert search(client, property_type=["house", "hotel"])["total"] == 1
    assert search(client, amenity=[wifi, pool])["items"][0]["city"] == "Goa"
    assert search(client, category="cabins")["items"][0]["city"] == "Manali"


def test_search_rejects_invalid_ranges(client: TestClient) -> None:
    assert client.get("/api/listings", params={"check_in": days_from_today(3)}).status_code == 422
    assert client.get("/api/listings", params={"min_price": 9, "max_price": 1}).status_code == 422


def test_search_paginates(client: TestClient, host: Headers) -> None:
    for index in range(3):
        create_listing(client, host, title=f"Place {index}")
    first = search(client, page=1, page_size=2)
    second = search(client, page=2, page_size=2)
    assert first["has_more"] is True
    assert len(first["items"]) == 2
    assert second["has_more"] is False
    assert [item["title"] for item in second["items"]] == ["Place 2"]


def test_search_excludes_booked_listings(
    client: TestClient, listing: dict[str, Any], guest: Headers
) -> None:
    stay = {"check_in": days_from_today(10), "check_out": days_from_today(13)}
    booked = client.post("/api/bookings", json={"listing_id": listing["id"], **stay}, headers=guest)
    assert booked.status_code == 201
    assert search(client, **stay)["total"] == 0
    later = {"check_in": days_from_today(13), "check_out": days_from_today(15)}
    assert search(client, **later)["total"] == 1


def test_owner_can_update_listing(
    client: TestClient, host: Headers, guest: Headers, listing: dict[str, Any]
) -> None:
    payload = listing_payload(title="Renamed loft", image_urls=["https://example.com/c.jpg"])
    url = f"/api/listings/{listing['id']}"
    assert client.put(url, json=payload, headers=guest).status_code == 403

    response = client.put(url, json=payload, headers=host)
    assert response.status_code == 200
    assert response.json()["title"] == "Renamed loft"
    assert client.get(url).json()["image_urls"] == ["https://example.com/c.jpg"]


def test_delete_listing(
    client: TestClient, host: Headers, guest: Headers, listing: dict[str, Any]
) -> None:
    url = f"/api/listings/{listing['id']}"
    assert client.delete(url, headers=guest).status_code == 403
    assert client.delete(url, headers=host).status_code == 204
    assert client.get(url).status_code == 404


def test_cannot_delete_listing_with_upcoming_booking(
    client: TestClient, host: Headers, guest: Headers, listing: dict[str, Any]
) -> None:
    stay = {
        "listing_id": listing["id"],
        "check_in": days_from_today(5),
        "check_out": days_from_today(7),
    }
    assert client.post("/api/bookings", json=stay, headers=guest).status_code == 201
    assert client.delete(f"/api/listings/{listing['id']}", headers=host).status_code == 409


def test_catalog_endpoints(client: TestClient, catalog: dict[str, list[int]]) -> None:
    assert [amenity["name"] for amenity in client.get("/api/amenities").json()] == [
        "Kitchen",
        "Pool",
        "Wifi",
    ]
    assert len(client.get("/api/categories").json()) == 2
