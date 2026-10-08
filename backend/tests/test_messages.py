from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import Headers, Json, create_listing, register, user_id


def start(client: TestClient, headers: Headers, listing_id: int, body: str = "Hello!") -> Any:
    return client.post(
        "/api/conversations", json={"listing_id": listing_id, "body": body}, headers=headers
    )


def send(client: TestClient, headers: Headers, conversation_id: int, body: str) -> Any:
    return client.post(
        f"/api/conversations/{conversation_id}/messages", json={"body": body}, headers=headers
    )


def unread(client: TestClient, headers: Headers) -> int:
    return client.get("/api/conversations/unread-count", headers=headers).json()["count"]


def messages(client: TestClient, headers: Headers, conversation_id: int, **params: Any) -> Any:
    return client.get(
        f"/api/conversations/{conversation_id}/messages", params=params, headers=headers
    )


def test_guest_starts_a_conversation(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    response = start(client, guest, listing["id"], "  Is parking available?  ")
    assert response.status_code == 201
    summary = response.json()
    assert summary["role"] == "guest"
    assert summary["other_user"]["id"] == user_id(client, host)
    assert summary["listing"] == {
        "id": listing["id"],
        "title": listing["title"],
        "cover_image_url": "https://example.com/a.jpg",
    }
    assert summary["last_message"]["body"] == "Is parking available?"
    assert summary["unread_count"] == 0


def test_one_thread_per_guest_and_listing(
    client: TestClient, guest: Headers, listing: Json
) -> None:
    first = start(client, guest, listing["id"], "First").json()
    second = start(client, guest, listing["id"], "Second").json()
    assert second["id"] == first["id"]
    assert [message["body"] for message in messages(client, guest, first["id"]).json()] == [
        "First",
        "Second",
    ]

    other = start(client, register(client, "Other"), listing["id"]).json()
    assert other["id"] != first["id"]


def test_conversation_cannot_be_started_by_host_or_for_missing_listing(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    assert start(client, host, listing["id"]).status_code == 403
    assert start(client, guest, 999).status_code == 404
    assert start(client, guest, listing["id"], "   ").status_code == 422
    assert start(client, guest, listing["id"], "x" * 2001).status_code == 422
    client.delete(f"/api/listings/{listing['id']}", headers=host)
    assert start(client, guest, listing["id"]).status_code == 404


def test_inbox_and_unread_counts(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    conversation_id = start(client, guest, listing["id"], "Hi there").json()["id"]
    assert unread(client, guest) == 0
    assert unread(client, host) == 1

    inbox = client.get("/api/conversations", headers=host).json()
    assert len(inbox) == 1
    assert inbox[0]["id"] == conversation_id
    assert inbox[0]["role"] == "host"
    assert inbox[0]["other_user"]["name"] == "Guest"
    assert inbox[0]["last_message"]["body"] == "Hi there"
    assert inbox[0]["unread_count"] == 1

    read_url = f"/api/conversations/{conversation_id}/read"
    assert client.post(read_url, headers=host).status_code == 204
    assert unread(client, host) == 0

    assert send(client, host, conversation_id, "Welcome!").status_code == 201
    assert unread(client, host) == 0
    assert unread(client, guest) == 1
    guest_inbox = client.get("/api/conversations", headers=guest).json()
    assert guest_inbox[0]["last_message"]["body"] == "Welcome!"
    assert guest_inbox[0]["unread_count"] == 1


def test_inbox_lists_most_recent_conversation_first(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    second_listing = create_listing(client, host, title="Second flat")
    older = start(client, guest, listing["id"]).json()["id"]
    newer = start(client, guest, second_listing["id"]).json()["id"]
    assert [item["id"] for item in client.get("/api/conversations", headers=guest).json()] == [
        newer,
        older,
    ]

    send(client, guest, older, "Bump")
    assert [item["id"] for item in client.get("/api/conversations", headers=guest).json()] == [
        older,
        newer,
    ]


def test_message_pagination(
    client: TestClient, host: Headers, guest: Headers, listing: Json
) -> None:
    conversation_id = start(client, guest, listing["id"], "m1").json()["id"]
    for index, sender in ((2, guest), (3, host), (4, guest)):
        send(client, sender, conversation_id, f"m{index}")
    everything = messages(client, host, conversation_id).json()
    ids = [message["id"] for message in everything]
    assert [message["body"] for message in everything] == ["m1", "m2", "m3", "m4"]

    def bodies(**params: Any) -> list[str]:
        return [
            message["body"] for message in messages(client, guest, conversation_id, **params).json()
        ]

    assert bodies(limit=2) == ["m3", "m4"]
    assert bodies(before_id=ids[2], limit=2) == ["m1", "m2"]
    assert bodies(after_id=ids[1]) == ["m3", "m4"]
    assert bodies(after_id=ids[0], limit=1) == ["m2"]
    assert bodies(after_id=ids[3]) == []
    assert messages(client, guest, conversation_id, limit=101).status_code == 422


def test_non_participants_get_404(client: TestClient, guest: Headers, listing: Json) -> None:
    conversation_id = start(client, guest, listing["id"]).json()["id"]
    stranger = register(client, "Stranger")

    assert messages(client, stranger, conversation_id).status_code == 404
    assert send(client, stranger, conversation_id, "Hi").status_code == 404
    read_url = f"/api/conversations/{conversation_id}/read"
    assert client.post(read_url, headers=stranger).status_code == 404
    assert client.get("/api/conversations", headers=stranger).json() == []
    assert unread(client, stranger) == 0
    assert messages(client, guest, 999).status_code == 404
    assert client.get("/api/conversations").status_code == 401
