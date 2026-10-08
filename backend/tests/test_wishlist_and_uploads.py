from typing import Any

from fastapi.testclient import TestClient

from tests.conftest import Headers

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def test_wishlist_save_and_remove(
    client: TestClient, guest: Headers, listing: dict[str, Any]
) -> None:
    url = f"/api/wishlist/{listing['id']}"
    assert client.put(url, headers=guest).status_code == 204
    assert client.put(url, headers=guest).status_code == 204
    saved = client.get("/api/wishlist", headers=guest).json()
    assert [item["id"] for item in saved] == [listing["id"]]

    assert client.delete(url, headers=guest).status_code == 204
    assert client.get("/api/wishlist", headers=guest).json() == []
    assert client.put("/api/wishlist/999", headers=guest).status_code == 404


def test_upload_accepts_images_only(client: TestClient, host: Headers) -> None:
    files = {"file": ("photo.png", PNG_BYTES, "image/png")}
    response = client.post("/api/uploads", files=files, headers=host)
    assert response.status_code == 201
    url = response.json()["url"]
    assert url.endswith(".png")
    assert client.get(url).content == PNG_BYTES

    disguised = {"file": ("photo.png", b"<script>alert(1)</script>", "image/png")}
    assert client.post("/api/uploads", files=disguised, headers=host).status_code == 415
    assert client.post("/api/uploads", files=files).status_code == 401


def test_uploaded_files_are_served_with_nosniff(client: TestClient, host: Headers) -> None:
    files = {"file": ("photo.png", PNG_BYTES, "image/png")}
    url = client.post("/api/uploads", files=files, headers=host).json()["url"]
    served = client.get(url)
    assert served.headers["x-content-type-options"] == "nosniff"
    assert served.headers["content-security-policy"] == "default-src 'none'"


def test_oversized_upload_is_rejected_before_parsing(client: TestClient, host: Headers) -> None:
    headers = {**host, "Content-Length": str(50 * 1024 * 1024)}
    response = client.post("/api/uploads", content=b"x", headers=headers)
    assert response.status_code == 413
