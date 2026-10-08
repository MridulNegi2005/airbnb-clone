from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from PIL import ExifTags, Image

from app.config import get_settings
from app.main import app
from tests.conftest import Headers, image_bytes, media_path, upload, user_id


def jpeg_with_gps(size: tuple[int, int] = (40, 20), orientation: int = 1) -> bytes:
    exif = Image.Exif()
    exif[ExifTags.Base.Make] = "PhoneCam"
    exif[ExifTags.Base.Orientation] = orientation
    exif[ExifTags.Base.GPSInfo] = {
        ExifTags.GPS.GPSLatitudeRef: "N",
        ExifTags.GPS.GPSLatitude: (12.0, 58.0, 17.0),
        ExifTags.GPS.GPSLongitudeRef: "E",
        ExifTags.GPS.GPSLongitude: (77.0, 38.0, 28.0),
    }
    return image_bytes("JPEG", size, exif=exif)


def test_upload_reencodes_to_webp(client: TestClient, host: Headers) -> None:
    response = upload(client, host, image_bytes("PNG", (64, 48)))
    assert response.status_code == 201
    body = response.json()
    assert (body["width"], body["height"]) == (64, 48)
    assert body["url"].startswith(f"http://testserver/media/uploads/{user_id(client, host)}/")
    assert body["url"].endswith(".webp")

    served = client.get(body["url"])
    assert served.status_code == 200
    with Image.open(BytesIO(served.content)) as image:
        assert image.format == "WEBP"
        assert image.size == (64, 48)


def test_upload_strips_exif_and_gps(client: TestClient, host: Headers) -> None:
    original = jpeg_with_gps()
    with Image.open(BytesIO(original)) as source:
        assert source.getexif().get_ifd(ExifTags.IFD.GPSInfo)

    response = upload(client, host, original)
    assert response.status_code == 201

    stored_path = media_path(response.json()["url"])
    stored = stored_path.read_bytes()
    with Image.open(stored_path) as image:
        assert image.format == "WEBP"
        assert "exif" not in image.info
        assert len(image.getexif()) == 0
        assert not image.getexif().get_ifd(ExifTags.IFD.GPSInfo)
    assert b"EXIF" not in stored
    assert b"Exif" not in stored
    assert b"PhoneCam" not in stored


def test_upload_applies_exif_orientation(client: TestClient, host: Headers) -> None:
    body = upload(client, host, jpeg_with_gps((40, 20), orientation=6)).json()
    assert (body["width"], body["height"]) == (20, 40)


def test_upload_is_resized_to_the_maximum_dimension(client: TestClient, host: Headers) -> None:
    body = upload(client, host, image_bytes("JPEG", (3000, 1500))).json()
    assert (body["width"], body["height"]) == (2048, 1024)
    with Image.open(media_path(body["url"])) as image:
        assert image.size == (2048, 1024)


def test_upload_rejects_non_images(client: TestClient, host: Headers) -> None:
    assert upload(client, host, b"<script>alert(1)</script>").status_code == 415
    assert upload(client, host, b"\x89PNG\r\n\x1a\n" + b"\x00" * 32).status_code == 415
    assert upload(client, host, image_bytes("GIF")).status_code == 415
    assert upload(client, {}).status_code == 401


def test_uploads_are_capped_per_user(
    client: TestClient, host: Headers, guest: Headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "max_uploads_per_user", 2)
    assert upload(client, host).status_code == 201
    assert upload(client, host).status_code == 201
    assert upload(client, host).status_code == 403
    assert upload(client, guest).status_code == 201


def test_uploaded_files_are_served_with_nosniff(client: TestClient, host: Headers) -> None:
    served = client.get(upload(client, host).json()["url"])
    assert served.headers["x-content-type-options"] == "nosniff"
    assert served.headers["content-security-policy"] == "default-src 'none'"


def test_oversized_upload_is_rejected_before_parsing(client: TestClient, host: Headers) -> None:
    headers = {**host, "Content-Length": str(50 * 1024 * 1024)}
    assert client.post("/api/uploads", content=b"x", headers=headers).status_code == 413


def test_oversized_file_is_rejected_after_reading(
    client: TestClient, host: Headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "max_upload_bytes", 100)
    assert upload(client, host, image_bytes("PNG", (200, 200))).status_code == 413


def test_upload_guard_works_behind_a_path_prefix(host: Headers) -> None:
    with TestClient(app, root_path="/backend") as prefixed:
        headers = {**host, "Content-Length": str(50 * 1024 * 1024)}
        assert prefixed.post("/api/uploads", content=b"x", headers=headers).status_code == 413
