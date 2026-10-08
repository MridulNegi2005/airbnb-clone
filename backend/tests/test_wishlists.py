from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import Headers, Json, create_listing, register


def create_wishlist(client: TestClient, headers: Headers, name: str) -> Any:
    return client.post("/api/wishlists", json={"name": name}, headers=headers)


def save(client: TestClient, headers: Headers, wishlist_id: int, listing_id: int) -> int:
    url = f"/api/wishlists/{wishlist_id}/listings/{listing_id}"
    return client.put(url, headers=headers).status_code


def test_create_and_list_wishlists(client: TestClient, guest: Headers) -> None:
    response = create_wishlist(client, guest, "  Weekend getaways  ")
    assert response.status_code == 201
    assert response.json() == {
        "id": response.json()["id"],
        "name": "Weekend getaways",
        "listings": [],
    }

    summaries = client.get("/api/wishlists", headers=guest).json()
    assert [(item["name"], item["item_count"]) for item in summaries] == [("Weekend getaways", 0)]
    assert summaries[0]["cover_image_url"] is None
    assert client.get("/api/wishlists").status_code == 401


def test_wishlist_names_are_unique_per_user(client: TestClient, guest: Headers) -> None:
    assert create_wishlist(client, guest, "Goa").status_code == 201
    assert create_wishlist(client, guest, "Goa").status_code == 409
    assert create_wishlist(client, guest, "   ").status_code == 422
    assert create_wishlist(client, guest, "x" * 51).status_code == 422
    assert create_wishlist(client, register(client, "Other"), "Goa").status_code == 201


def test_rename_and_delete_wishlist(client: TestClient, guest: Headers) -> None:
    first = create_wishlist(client, guest, "First").json()["id"]
    create_wishlist(client, guest, "Second")
    url = f"/api/wishlists/{first}"

    assert client.patch(url, json={"name": "Second"}, headers=guest).status_code == 409
    renamed = client.patch(url, json={"name": "Renamed"}, headers=guest)
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"

    assert client.delete(url, headers=guest).status_code == 204
    assert client.get(url, headers=guest).status_code == 404
    assert [item["name"] for item in client.get("/api/wishlists", headers=guest).json()] == [
        "Second"
    ]


def test_save_and_remove_listings(client: TestClient, guest: Headers, listing: Json) -> None:
    wishlist_id = create_wishlist(client, guest, "Bengaluru").json()["id"]
    assert save(client, guest, wishlist_id, listing["id"]) == 204
    assert save(client, guest, wishlist_id, listing["id"]) == 204

    detail = client.get(f"/api/wishlists/{wishlist_id}", headers=guest).json()
    assert [card["id"] for card in detail["listings"]] == [listing["id"]]
    assert "address" not in detail["listings"][0]
    summary = client.get("/api/wishlists", headers=guest).json()[0]
    assert summary["item_count"] == 1
    assert summary["cover_image_url"] == "https://example.com/a.jpg"
    assert client.get("/api/wishlists/saved", headers=guest).json() == [
        {"wishlist_id": wishlist_id, "listing_id": listing["id"]}
    ]

    url = f"/api/wishlists/{wishlist_id}/listings/{listing['id']}"
    assert client.delete(url, headers=guest).status_code == 204
    assert client.delete(url, headers=guest).status_code == 204
    assert client.get("/api/wishlists/saved", headers=guest).json() == []
    assert save(client, guest, wishlist_id, 999) == 404


def test_a_listing_can_be_in_several_wishlists(
    client: TestClient, guest: Headers, listing: Json
) -> None:
    ids = [create_wishlist(client, guest, name).json()["id"] for name in ("A", "B")]
    for wishlist_id in ids:
        save(client, guest, wishlist_id, listing["id"])
    saved = client.get("/api/wishlists/saved", headers=guest).json()
    assert sorted(item["wishlist_id"] for item in saved) == sorted(ids)

    client.delete(f"/api/wishlists/{ids[0]}", headers=guest)
    assert client.get("/api/wishlists/saved", headers=guest).json() == [
        {"wishlist_id": ids[1], "listing_id": listing["id"]}
    ]


def test_other_users_cannot_see_or_change_a_wishlist(
    client: TestClient, guest: Headers, listing: Json
) -> None:
    wishlist_id = create_wishlist(client, guest, "Private").json()["id"]
    other = register(client, "Other")
    url = f"/api/wishlists/{wishlist_id}"

    assert client.get(url, headers=other).status_code == 404
    assert client.patch(url, json={"name": "Mine"}, headers=other).status_code == 404
    assert client.delete(url, headers=other).status_code == 404
    assert save(client, other, wishlist_id, listing["id"]) == 404
    assert client.delete(f"{url}/listings/{listing['id']}", headers=other).status_code == 404
    assert client.get("/api/wishlists", headers=other).json() == []
    assert client.get(url, headers=guest).json()["name"] == "Private"


def test_archived_listings_are_hidden_from_wishlists(
    client: TestClient, host: Headers, guest: Headers
) -> None:
    kept = create_listing(client, host, title="Kept")
    archived = create_listing(client, host, title="Archived")
    wishlist_id = create_wishlist(client, guest, "Stays").json()["id"]
    save(client, guest, wishlist_id, kept["id"])
    save(client, guest, wishlist_id, archived["id"])

    assert client.delete(f"/api/listings/{archived['id']}", headers=host).status_code == 204

    detail = client.get(f"/api/wishlists/{wishlist_id}", headers=guest).json()
    assert [card["title"] for card in detail["listings"]] == ["Kept"]
    assert client.get("/api/wishlists", headers=guest).json()[0]["item_count"] == 1
    assert save(client, guest, wishlist_id, archived["id"]) == 404
