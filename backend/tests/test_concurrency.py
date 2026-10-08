from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Amenity
from app.services import images
from tests.conftest import Headers, upload


def test_a_write_after_another_request_committed_waits_instead_of_failing() -> None:
    # Request A reads, request B commits a write, then A writes: A must succeed.
    with SessionLocal() as first, SessionLocal() as second:
        first.scalars(select(Amenity)).all()
        second.add(Amenity(name="Sauna", icon="sauna"))
        second.commit()
        first.add(Amenity(name="Fire pit", icon="fire-pit"))
        first.commit()

    with SessionLocal() as db:
        names = set(db.scalars(select(Amenity.name)))
    assert {"Sauna", "Fire pit"} <= names


def test_uploads_get_503_instead_of_queueing_when_the_image_slot_is_busy(
    client: TestClient, host: Headers, monkeypatch
) -> None:
    monkeypatch.setattr(images, "_SLOT_WAIT_SECONDS", 0)
    assert images._decode_slot.acquire(timeout=1)
    try:
        response = upload(client, host)
    finally:
        images._decode_slot.release()
    assert response.status_code == 503
    assert response.headers["retry-after"] == "5"
    assert upload(client, host).status_code == 201
