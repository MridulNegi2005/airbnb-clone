from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import (
    INDIRANAGAR,
    Headers,
    Json,
    book,
    create_listing,
    days_from_today,
    insert_booking,
    listing_payload,
    register,
    upload,
    user_id,
)

MADIKERI = {"latitude": 12.4244, "longitude": 75.7382}
BENGALURU_BOX = {"sw_lat": 12.8, "sw_lng": 77.4, "ne_lat": 13.1, "ne_lng": 77.8}


def search(client: TestClient, **params: Any) -> Json:
    response = client.get("/api/listings", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def post_listing(client: TestClient, headers: Headers, **overrides: Any) -> int:
    return client.post(
        "/api/listings", json=listing_payload(**overrides), headers=headers
    ).status_code


def test_create_listing_returns_public_detail(
    client: TestClient, host: Headers, catalog: dict[str, list[int]]
) -> None:
    listing = create_listing(
        client,
        host,
        amenity_ids=catalog["amenities"][:2],
        category_ids=catalog["categories"][:1],
    )
    assert listing["host"]["name"] == "Host"
    assert listing["neighbourhood"] == "Indiranagar"
    assert listing["price_per_night"] == 2500
    assert listing["image_urls"] == ["https://example.com/a.jpg", "https://example.com/b.jpg"]
    assert {amenity["name"] for amenity in listing["amenities"]} == {"Pool", "Wifi"}
    assert listing["categories"][0]["slug"] == "city"
    assert listing["rating"] is None
    assert listing["review_count"] == 0


def test_public_listing_hides_exact_location(client: TestClient, listing: Json) -> None:
    latitude, longitude = INDIRANAGAR
    detail = client.get(f"/api/listings/{listing['id']}").json()
    card = search(client)["items"][0]

    for public in (listing, detail, card):
        assert "address" not in public
        assert abs(public["latitude"] - latitude) <= 0.0031
        assert abs(public["longitude"] - longitude) <= 0.0031
        assert (public["latitude"], public["longitude"]) != INDIRANAGAR
    assert (detail["latitude"], detail["longitude"]) == (card["latitude"], card["longitude"])


def test_owner_sees_exact_listing_details(
    client: TestClient, host: Headers, guest: Headers, catalog: dict[str, list[int]]
) -> None:
    listing = create_listing(
        client,
        host,
        google_place_id="ChIJ-indiranagar",
        amenity_ids=catalog["amenities"][:1],
        category_ids=catalog["categories"],
    )
    url = f"/api/host/listings/{listing['id']}"

    response = client.get(url, headers=host)
    assert response.status_code == 200
    detail = response.json()
    assert detail["address"] == "12 HAL 2nd Stage"
    assert (detail["latitude"], detail["longitude"]) == INDIRANAGAR
    assert detail["google_place_id"] == "ChIJ-indiranagar"
    assert detail["amenity_ids"] == catalog["amenities"][:1]
    assert detail["category_ids"] == catalog["categories"]

    assert client.get(url, headers=guest).status_code == 403
    assert client.get(url).status_code == 401


def test_create_listing_requires_auth_and_valid_data(client: TestClient, host: Headers) -> None:
    assert client.post("/api/listings", json=listing_payload()).status_code == 401
    assert post_listing(client, host, price_per_night=0) == 422
    assert post_listing(client, host, image_urls=[]) == 422
    assert post_listing(client, host, bathrooms=1.25) == 422
    assert post_listing(client, host, amenity_ids=[999]) == 422
    assert post_listing(client, host, category_ids=[999]) == 422
    for field in ("neighbourhood", "latitude", "longitude"):
        payload = listing_payload()
        del payload[field]
        assert client.post("/api/listings", json=payload, headers=host).status_code == 422


def test_listing_must_be_inside_the_service_area(client: TestClient, host: Headers) -> None:
    assert post_listing(client, host, latitude=15.5, longitude=73.8) == 422
    assert post_listing(client, host, latitude=11.59, longitude=76.0) == 422
    assert post_listing(client, host, latitude=12.0, longitude=78.21) == 422
    assert post_listing(client, host, **MADIKERI) == 201


def test_listing_photos_must_be_https_or_own_uploads(client: TestClient, host: Headers) -> None:
    own_url = upload(client, host).json()["url"]
    other_url = upload(client, register(client, "Other")).json()["url"]

    assert post_listing(client, host, image_urls=["http://example.com/a.jpg"]) == 422
    assert post_listing(client, host, image_urls=[other_url]) == 422
    assert post_listing(client, host, image_urls=["http://testserver/media/uploads/x.webp"]) == 422

    listing = create_listing(client, host, image_urls=[own_url, "https://example.com/a.jpg"])
    assert listing["image_urls"] == [own_url, "https://example.com/a.jpg"]


def test_search_filters(client: TestClient, host: Headers, catalog: dict[str, list[int]]) -> None:
    wifi, pool, _ = catalog["amenities"]
    city, cabins = catalog["categories"]
    create_listing(client, host, amenity_ids=[wifi, pool], category_ids=[city])
    create_listing(
        client,
        host,
        title="Coffee estate cabin",
        neighbourhood="Madikeri",
        city="Coorg",
        price_per_night=6000,
        max_guests=8,
        bedrooms=4,
        property_type="house",
        amenity_ids=[wifi],
        category_ids=[cabins],
        **MADIKERI,
    )

    assert search(client)["total"] == 2
    assert search(client, location="indiranagar, bengaluru")["items"][0]["city"] == "Bengaluru"
    assert search(client, location="Madikeri")["items"][0]["city"] == "Coorg"
    assert search(client, location="Mumbai")["total"] == 0
    assert search(client, max_price=3000)["items"][0]["city"] == "Bengaluru"
    assert search(client, min_price=3000)["items"][0]["city"] == "Coorg"
    assert search(client, guests=6)["items"][0]["city"] == "Coorg"
    assert search(client, min_bedrooms=3)["items"][0]["city"] == "Coorg"
    assert search(client, property_type=["house", "hotel"])["total"] == 1
    assert search(client, room_type="private_room")["total"] == 0
    assert search(client, amenity=[wifi, pool])["items"][0]["city"] == "Bengaluru"
    assert search(client, category="cabins")["items"][0]["city"] == "Coorg"


def test_search_by_map_bounds(client: TestClient, host: Headers) -> None:
    create_listing(client, host)
    create_listing(client, host, title="Estate cabin", city="Coorg", **MADIKERI)

    inside = search(client, **BENGALURU_BOX)
    assert [item["city"] for item in inside["items"]] == ["Bengaluru"]
    coorg_box = {"sw_lat": 12.3, "sw_lng": 75.6, "ne_lat": 12.5, "ne_lng": 75.9}
    assert [item["city"] for item in search(client, **coorg_box)["items"]] == ["Coorg"]
    empty_box = {"sw_lat": 13.5, "sw_lng": 76.0, "ne_lat": 13.6, "ne_lng": 76.1}
    assert search(client, **empty_box)["total"] == 0


def test_search_rejects_invalid_parameters(client: TestClient) -> None:
    def status(**params: Any) -> int:
        return client.get("/api/listings", params=params).status_code

    assert status(check_in=days_from_today(3)) == 422
    assert status(check_in=days_from_today(3), check_out=days_from_today(3)) == 422
    assert status(min_price=9, max_price=1) == 422
    assert status(sw_lat=12.8, sw_lng=77.4, ne_lat=13.1) == 422
    assert status(**BENGALURU_BOX | {"sw_lat": 13.2}) == 422
    assert status(**BENGALURU_BOX | {"sw_lng": 77.9}) == 422
    assert status(**BENGALURU_BOX | {"ne_lat": 91}) == 422


def test_search_paginates(client: TestClient, host: Headers) -> None:
    for index in range(3):
        create_listing(client, host, title=f"Place {index}")
    first = search(client, page=1, page_size=2)
    second = search(client, page=2, page_size=2)
    assert first["total"] == 3
    assert first["has_more"] is True
    assert len(first["items"]) == 2
    assert second["has_more"] is False
    assert [item["title"] for item in second["items"]] == ["Place 2"]


def test_search_excludes_booked_listings(client: TestClient, listing: Json, guest: Headers) -> None:
    assert book(client, guest, listing["id"], 10, 13).status_code == 201
    assert search(client, check_in=days_from_today(10), check_out=days_from_today(13))["total"] == 0
    assert search(client, check_in=days_from_today(13), check_out=days_from_today(15))["total"] == 1


def test_owner_can_update_listing(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    payload = listing_payload(title="Renamed flat", image_urls=["https://example.com/c.jpg"])
    url = f"/api/listings/{listing['id']}"
    assert client.put(url, json=payload, headers=guest).status_code == 403

    response = client.put(url, json=payload, headers=host)
    assert response.status_code == 200
    assert response.json()["title"] == "Renamed flat"
    assert client.get(url).json()["image_urls"] == ["https://example.com/c.jpg"]

    outside = listing_payload(latitude=15.5, longitude=73.8)
    assert client.put(url, json=outside, headers=host).status_code == 422


def test_delete_archives_listing_but_keeps_past_bookings(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    booking_id = insert_booking(listing["id"], user_id(client, guest))
    url = f"/api/listings/{listing['id']}"

    assert client.delete(url, headers=guest).status_code == 403
    assert client.delete(url, headers=host).status_code == 204

    assert client.get(url).status_code == 404
    assert client.delete(url, headers=host).status_code == 404
    assert search(client)["total"] == 0
    assert client.get("/api/host/listings", headers=host).json() == []
    assert book(client, guest, listing["id"], 3, 5).status_code == 404

    trip = client.get(f"/api/bookings/{booking_id}", headers=guest).json()
    assert trip["listing"]["title"] == listing["title"]
    assert [trip["id"] for trip in client.get("/api/bookings", headers=guest).json()] == [
        booking_id
    ]


def test_cannot_archive_listing_with_upcoming_confirmed_booking(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    booking_id = book(client, guest, listing["id"], 5, 7).json()["id"]
    url = f"/api/listings/{listing['id']}"
    assert client.delete(url, headers=host).status_code == 409

    client.post(f"/api/bookings/{booking_id}/cancel", headers=guest)
    assert client.delete(url, headers=host).status_code == 204


def test_catalog_endpoints(client: TestClient, catalog: dict[str, list[int]]) -> None:
    assert [amenity["name"] for amenity in client.get("/api/amenities").json()] == [
        "Kitchen",
        "Pool",
        "Wifi",
    ]
    assert [category["slug"] for category in client.get("/api/categories").json()] == [
        "city",
        "cabins",
    ]
    assert client.get("/api/service-area").json() == {
        "south": 11.6,
        "west": 75.3,
        "north": 13.8,
        "east": 78.2,
    }
