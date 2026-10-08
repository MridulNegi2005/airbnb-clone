from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import (
    Headers,
    Json,
    create_listing,
    insert_booking,
    register,
    upload,
    user_id,
)


def patch_me(client: TestClient, headers: Headers, **changes: Any) -> Any:
    return client.patch("/api/users/me", json=changes, headers=headers)


def test_profile_update_is_partial(client: TestClient, guest: Headers) -> None:
    response = patch_me(
        client,
        guest,
        about="  I love filter coffee.  ",
        work="Designer",
        languages=["English", "Kannada"],
        lives_in="Bengaluru",
    )
    assert response.status_code == 200
    profile = response.json()
    assert profile["about"] == "I love filter coffee."
    assert profile["languages"] == ["English", "Kannada"]

    response = patch_me(client, guest, work=None)
    assert response.status_code == 200
    me = client.get("/api/auth/me", headers=guest).json()
    assert me["work"] is None
    assert me["name"] == "Guest"
    assert me["about"] == "I love filter coffee."
    assert me["lives_in"] == "Bengaluru"


def test_profile_update_validation(client: TestClient, guest: Headers) -> None:
    assert patch_me(client, guest, name=None).status_code == 422
    assert patch_me(client, guest, name="   ").status_code == 422
    assert patch_me(client, guest, about="x" * 1001).status_code == 422
    assert patch_me(client, guest, languages=["English"] * 11).status_code == 422
    assert patch_me(client, guest, name="Asha").json()["name"] == "Asha"
    assert client.patch("/api/users/me", json={"name": "Asha"}).status_code == 401


def test_avatar_must_be_https_or_own_upload(client: TestClient, guest: Headers) -> None:
    own_url = upload(client, guest).json()["url"]
    other_url = upload(client, register(client, "Other")).json()["url"]

    assert patch_me(client, guest, avatar_url="http://example.com/me.jpg").status_code == 422
    assert patch_me(client, guest, avatar_url=other_url).status_code == 422
    assert patch_me(client, guest, avatar_url="not a url").status_code == 422
    assert patch_me(client, guest, avatar_url=own_url).json()["avatar_url"] == own_url
    external = "https://example.com/me.jpg"
    assert patch_me(client, guest, avatar_url=external).json()["avatar_url"] == external
    assert patch_me(client, guest, avatar_url=None).json()["avatar_url"] is None


def test_identity_verification(client: TestClient, guest: Headers) -> None:
    assert client.get("/api/auth/me", headers=guest).json()["is_identity_verified"] is False
    url = "/api/users/me/identity-verification"
    assert client.post(url, headers=guest).json()["is_identity_verified"] is True
    assert client.post(url, headers=guest).json()["is_identity_verified"] is True
    public = client.get(f"/api/users/{user_id(client, guest)}").json()
    assert public["is_identity_verified"] is True


def test_public_profile_hides_private_fields(
    client: TestClient, host: Headers, listing: Json
) -> None:
    patch_me(client, host, work="Architect", languages=["Hindi"])
    response = client.get(f"/api/users/{user_id(client, host)}")
    assert response.status_code == 200
    profile = response.json()
    assert profile["name"] == "Host"
    assert profile["work"] == "Architect"
    assert profile["languages"] == ["Hindi"]
    assert profile["listing_count"] == 1
    assert profile["host_review_count"] == 0
    assert profile["host_rating"] is None
    assert profile["guest_review_count"] == 0
    assert "email" not in profile
    assert "has_password" not in profile
    assert client.get("/api/users/999").status_code == 404


def test_user_listings_exclude_archived(client: TestClient, host: Headers) -> None:
    kept = create_listing(client, host, title="Kept")
    archived = create_listing(client, host, title="Archived")
    client.delete(f"/api/listings/{archived['id']}", headers=host)
    host_id = user_id(client, host)

    cards = client.get(f"/api/users/{host_id}/listings").json()
    assert [card["id"] for card in cards] == [kept["id"]]
    assert "address" not in cards[0]
    assert client.get(f"/api/users/{host_id}").json()["listing_count"] == 1
    assert client.get("/api/users/999/listings").status_code == 404


def test_profile_reviews_about_host_and_guest(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    host_id, guest_id = user_id(client, host), user_id(client, guest)
    booking_id = insert_booking(listing["id"], guest_id)
    review = {
        "rating": 4,
        "cleanliness": 4,
        "accuracy": 4,
        "check_in": 4,
        "communication": 4,
        "location": 4,
        "value": 4,
        "comment": "Great host.",
    }
    client.post(f"/api/bookings/{booking_id}/review", json=review, headers=guest)
    client.post(
        f"/api/bookings/{booking_id}/guest-review",
        json={"rating": 5, "comment": "Great guest."},
        headers=host,
    )

    about_host = client.get(f"/api/users/{host_id}/reviews", params={"about": "host"}).json()
    assert about_host["total"] == 1
    item = about_host["items"][0]
    assert (item["rating"], item["comment"]) == (4, "Great host.")
    assert item["author"]["id"] == guest_id
    assert item["listing"] == {"id": listing["id"], "title": listing["title"]}

    about_guest = client.get(f"/api/users/{guest_id}/reviews", params={"about": "guest"}).json()
    assert [(item["comment"], item["author"]["id"]) for item in about_guest["items"]] == [
        ("Great guest.", host_id)
    ]
    assert (
        client.get(f"/api/users/{host_id}/reviews", params={"about": "guest"}).json()["total"] == 0
    )

    host_profile = client.get(f"/api/users/{host_id}").json()
    assert (host_profile["host_review_count"], host_profile["host_rating"]) == (1, 4.0)
    assert client.get(f"/api/users/{guest_id}").json()["guest_review_count"] == 1


def test_profile_reviews_require_a_valid_about(client: TestClient, guest: Headers) -> None:
    guest_id = user_id(client, guest)
    assert client.get(f"/api/users/{guest_id}/reviews").status_code == 422
    assert client.get(f"/api/users/{guest_id}/reviews", params={"about": "x"}).status_code == 422
    assert client.get("/api/users/999/reviews", params={"about": "host"}).status_code == 404


def test_null_languages_clear_the_list(client: TestClient, guest: Headers) -> None:
    assert patch_me(client, guest, languages=["English"]).status_code == 200
    assert patch_me(client, guest, languages=None).json()["languages"] == []
    assert client.get("/api/auth/me", headers=guest).json()["languages"] == []
