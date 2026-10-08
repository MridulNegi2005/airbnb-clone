from collections import defaultdict
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.models import Booking, BookingStatus
from app.seed import seed
from app.seed_data import LISTINGS


def test_seed_creates_consistent_demo_data(client: TestClient) -> None:
    with SessionLocal() as db:
        seed(db, "demo-password")
        db.commit()
        confirmed = db.scalars(select(Booking).where(Booking.status == BookingStatus.CONFIRMED))
        stays: dict[int, list[tuple[date, date]]] = defaultdict(list)
        for booking in confirmed:
            stays[booking.listing_id].append((booking.check_in, booking.check_out))

    for ranges in stays.values():
        ranges.sort()
        for (_, previous_out), (next_in, _) in zip(ranges, ranges[1:], strict=False):
            assert previous_out <= next_in

    assert client.get("/api/listings").json()["total"] == len(LISTINGS)
    login = client.post(
        "/api/auth/login", json={"email": "rohan@example.com", "password": "demo-password"}
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    trips = client.get("/api/bookings", headers=headers).json()
    assert {trip["status"] for trip in trips} == {"confirmed", "cancelled"}
    assert any(not trip["has_review"] and trip["status"] == "confirmed" for trip in trips)
    assert len(client.get("/api/wishlist", headers=headers).json()) == 5
