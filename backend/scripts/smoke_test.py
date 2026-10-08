"""End-to-end smoke test against a running API.

Read-only by default. With --write it also signs up a throwaway host and guest and walks
through every main flow on the host's own new listing, which it archives at the end, so it is
safe to run on production. It uses only the standard
library and Pillow, so it runs anywhere the backend runs.

    python scripts/smoke_test.py --base-url https://airbnb-api.example.com --write
"""

import argparse
import io
import json
import secrets
import sys
import time
import urllib.error
import urllib.request
import uuid
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

from PIL import Image


class SmokeError(Exception):
    pass


class Client:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.token: str | None = None

    def request(
        self,
        method: str,
        path: str,
        body: Any = None,
        *,
        expect: int = 200,
        raw: bytes | None = None,
        content_type: str | None = None,
    ) -> Any:
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        request = urllib.request.Request(self.base_url + path, data=data, method=method)
        # Cloudflare's browser integrity check rejects Python's default User-Agent.
        request.add_header("User-Agent", "airbnb-clone-smoke-test/1.0")
        if body is not None:
            request.add_header("Content-Type", "application/json")
        if content_type:
            request.add_header("Content-Type", content_type)
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                status, payload = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, payload = error.code, error.read()
        if status != expect:
            raise SmokeError(
                f"{method} {path} returned {status}, expected {expect}: {payload[:300]!r}"
            )
        return json.loads(payload) if payload else None


def _png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 48), (255, 56, 92)).save(buffer, "PNG")
    return buffer.getvalue()


def _multipart(field: str, filename: str, data: bytes, mime: str) -> tuple[bytes, str]:
    boundary = uuid.uuid4().hex
    body = (
        (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{field}"; '
            f'filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'
        ).encode()
        + data
        + f"\r\n--{boundary}--\r\n".encode()
    )
    return body, f"multipart/form-data; boundary={boundary}"


def read_checks(api: Client) -> dict[str, Any]:
    state: dict[str, Any] = {}

    def health() -> None:
        assert api.request("GET", "/api/health") == {"status": "ok"}

    def catalogue() -> None:
        assert api.request("GET", "/api/categories"), "no categories"
        assert api.request("GET", "/api/amenities"), "no amenities"
        state["area"] = api.request("GET", "/api/service-area")

    def search() -> None:
        page = api.request("GET", "/api/listings?page_size=5")
        assert page["total"] > 0 and page["items"], "no listings"
        state["listing"] = page["items"][0]

    def map_search() -> None:
        area = state["area"]
        query = (
            f"sw_lat={area['south']}&sw_lng={area['west']}"
            f"&ne_lat={area['north']}&ne_lng={area['east']}&page_size=1"
        )
        assert api.request("GET", f"/api/listings?{query}")["total"] > 0

    def detail_and_quote() -> None:
        listing_id = state["listing"]["id"]
        detail = api.request("GET", f"/api/listings/{listing_id}")
        assert "address" not in detail, "public detail leaks the exact address"
        api.request("GET", f"/api/listings/{listing_id}/reviews?page_size=1")
        api.request("GET", f"/api/listings/{listing_id}/booked-dates")
        start = date.today() + timedelta(days=300 + secrets.randbelow(60))
        quote = api.request(
            "GET",
            f"/api/listings/{listing_id}/quote?check_in={start}"
            f"&check_out={start + timedelta(days=2)}&guests=1",
        )
        assert quote["total"] == quote["subtotal"] + quote["cleaning_fee"] + quote["service_fee"]
        state["host_id"] = detail["host"]["id"]

    def profile() -> None:
        api.request("GET", f"/api/users/{state['host_id']}")
        api.request("GET", f"/api/users/{state['host_id']}/reviews?about=host&page_size=1")

    def rejects_bad_input() -> None:
        api.request("GET", "/api/listings/99999999999999999999", expect=422)
        api.request("GET", "/api/auth/me", expect=401)

    for check in (
        health,
        catalogue,
        search,
        map_search,
        detail_and_quote,
        profile,
        rejects_bad_input,
    ):
        _run(check)
    return state


def write_checks(base_url: str, state: dict[str, Any]) -> None:
    """Throwaway host and guest accounts that only ever touch the host's own listing,
    so the flows can run on production without changing any demo data."""
    host, guest = Client(base_url), Client(base_url)
    listing: dict[str, Any] = {}

    def sign_up() -> None:
        for client, role in ((host, "host"), (guest, "guest")):
            email = f"smoke-{role}-{secrets.token_hex(6)}@example.com"
            auth = client.request(
                "POST",
                "/api/auth/register",
                {"name": f"Smoke {role}", "email": email, "password": secrets.token_urlsafe(16)},
                expect=201,
            )
            client.token = auth["access_token"]
            assert client.request("GET", "/api/auth/me")["email"] == email

    def upload() -> None:
        body, content_type = _multipart("file", "smoke.png", _png(), "image/png")
        result = host.request(
            "POST", "/api/uploads", raw=body, content_type=content_type, expect=201
        )
        assert result["url"].endswith(".webp")
        host.request("PATCH", "/api/users/me", {"avatar_url": result["url"]})
        state["photo_url"] = result["url"]

    def create_listing() -> None:
        area = state["area"]
        created = host.request(
            "POST",
            "/api/listings",
            {
                "title": "Smoke test cottage",
                "description": "Created by the smoke test and archived at the end.",
                "property_type": "house",
                "room_type": "entire_home",
                "address": "1 Test Road",
                "neighbourhood": "Testpur",
                "city": "Bengaluru",
                "country": "India",
                "latitude": (area["south"] + area["north"]) / 2,
                "longitude": (area["west"] + area["east"]) / 2,
                "price_per_night": 2000,
                "max_guests": 2,
                "bedrooms": 1,
                "beds": 1,
                "bathrooms": 1,
                "min_nights": 2,
                "weekly_discount_percent": 10,
                "image_urls": [state["photo_url"]],
            },
            expect=201,
        )
        listing.update(created)
        assert "address" not in guest.request("GET", f"/api/listings/{created['id']}")

    def pricing_and_stay_limits() -> None:
        base = f"/api/listings/{listing['id']}/quote"
        start = date.today() + timedelta(days=30)
        week = guest.request(
            "GET", f"{base}?check_in={start}&check_out={start + timedelta(days=7)}"
        )
        assert week["discount"] == 1400, week
        guest.request(
            "GET", f"{base}?check_in={start}&check_out={start + timedelta(days=1)}", expect=422
        )

    def host_calendar() -> None:
        calendar = f"/api/host/listings/{listing['id']}/blocked-dates"
        start = date.today() + timedelta(days=60)
        period = host.request(
            "POST",
            calendar,
            {"start_date": str(start), "end_date": str(start + timedelta(days=3))},
            expect=201,
        )
        booked = guest.request("GET", f"/api/listings/{listing['id']}/booked-dates")
        assert {"check_in": str(start), "check_out": str(start + timedelta(days=3))} in booked
        stay = {
            "listing_id": listing["id"],
            "check_in": str(start),
            "check_out": str(start + timedelta(days=2)),
        }
        guest.request("POST", "/api/bookings", stay, expect=409)
        host.request("DELETE", f"{calendar}/{period['id']}", expect=204)

    def wishlist() -> None:
        created = guest.request("POST", "/api/wishlists", {"name": "Smoke"}, expect=201)
        path = f"/api/wishlists/{created['id']}/listings/{listing['id']}"
        guest.request("PUT", path, expect=204)
        saved = guest.request("GET", "/api/wishlists/saved")
        assert {"wishlist_id": created["id"], "listing_id": listing["id"]} in saved
        guest.request("DELETE", f"/api/wishlists/{created['id']}", expect=204)

    def book_and_cancel() -> None:
        start = date.today() + timedelta(days=90)
        stay = {
            "listing_id": listing["id"],
            "check_in": str(start),
            "check_out": str(start + timedelta(days=2)),
            "guests": 1,
        }
        booking = guest.request("POST", "/api/bookings", stay, expect=201)
        assert booking["listing"]["address"] == "1 Test Road"
        guest.request("POST", "/api/bookings", stay, expect=409)
        host.request("POST", "/api/bookings", stay, expect=403)
        reservations = host.request("GET", "/api/host/bookings")
        assert booking["id"] in [reservation["id"] for reservation in reservations]
        cancelled = guest.request("POST", f"/api/bookings/{booking['id']}/cancel")
        assert cancelled["status"] == "cancelled"

    def messaging() -> None:
        thread = guest.request(
            "POST",
            "/api/conversations",
            {"listing_id": listing["id"], "body": "Smoke test question"},
            expect=201,
        )
        assert host.request("GET", "/api/conversations/unread-count")["count"] == 1
        host.request(
            "POST",
            f"/api/conversations/{thread['id']}/messages",
            {"body": "Smoke reply"},
            expect=201,
        )
        host.request("POST", f"/api/conversations/{thread['id']}/read", expect=204)
        assert host.request("GET", "/api/conversations/unread-count")["count"] == 0
        messages = guest.request("GET", f"/api/conversations/{thread['id']}/messages")
        assert [message["body"] for message in messages] == ["Smoke test question", "Smoke reply"]

    def profiles() -> None:
        host.request("PATCH", "/api/users/me", {"about": "Smoke host", "languages": ["English"]})
        host.request("POST", "/api/users/me/identity-verification")
        profile = guest.request("GET", f"/api/users/{listing['host']['id']}")
        assert profile["is_identity_verified"] is True
        assert profile["listing_count"] == 1
        assert "email" not in profile

    def archive_listing() -> None:
        path = f"/api/listings/{listing['id']}"
        host.request("DELETE", path, expect=204)
        guest.request("GET", path, expect=404)

    for check in (
        sign_up,
        upload,
        create_listing,
        pricing_and_stay_limits,
        host_calendar,
        wishlist,
        book_and_cancel,
        messaging,
        profiles,
        archive_listing,
    ):
        _run(check)


def _run(check: Callable[[], None]) -> None:
    started = time.perf_counter()
    try:
        check()
    except (SmokeError, AssertionError, KeyError) as error:
        print(f"FAIL  {check.__name__}: {error}")
        raise SystemExit(1) from None
    print(f"ok    {check.__name__} ({(time.perf_counter() - started) * 1000:.0f} ms)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--write", action="store_true", help="also run flows that create data")
    args = parser.parse_args()

    api = Client(args.base_url)
    state = read_checks(api)
    if args.write:
        write_checks(args.base_url, state)
    print("Smoke test passed.")
    sys.exit(0)


if __name__ == "__main__":
    main()
