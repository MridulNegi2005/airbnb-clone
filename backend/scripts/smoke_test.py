"""End-to-end smoke test against a running API.

Read-only by default. With --write it also signs up a throwaway user and walks through the
main flows: wishlist, upload, booking, cancellation and messaging. It uses only the standard
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


def write_checks(api: Client, state: dict[str, Any]) -> None:
    listing_id = state["listing"]["id"]
    email = f"smoke-{secrets.token_hex(6)}@example.com"

    def sign_up() -> None:
        auth = api.request(
            "POST",
            "/api/auth/register",
            {"name": "Smoke Test", "email": email, "password": secrets.token_urlsafe(16)},
            expect=201,
        )
        api.token = auth["access_token"]
        assert api.request("GET", "/api/auth/me")["email"] == email

    def wishlist() -> None:
        created = api.request("POST", "/api/wishlists", {"name": "Smoke"}, expect=201)
        api.request("PUT", f"/api/wishlists/{created['id']}/listings/{listing_id}", expect=204)
        saved = api.request("GET", "/api/wishlists/saved")
        assert {"wishlist_id": created["id"], "listing_id": listing_id} in saved

    def upload() -> None:
        body, content_type = _multipart("file", "smoke.png", _png(), "image/png")
        result = api.request(
            "POST", "/api/uploads", raw=body, content_type=content_type, expect=201
        )
        assert result["url"].endswith(".webp")
        api.request("PATCH", "/api/users/me", {"avatar_url": result["url"]})

    def book_and_cancel() -> None:
        for _ in range(5):
            start = date.today() + timedelta(days=200 + secrets.randbelow(150))
            stay = {
                "listing_id": listing_id,
                "check_in": str(start),
                "check_out": str(start + timedelta(days=1)),
                "guests": 1,
            }
            quote = api.request(
                "GET",
                f"/api/listings/{listing_id}/quote?check_in={stay['check_in']}"
                f"&check_out={stay['check_out']}&guests=1",
            )
            if quote["available"]:
                booking = api.request("POST", "/api/bookings", stay, expect=201)
                api.request("POST", "/api/bookings", stay, expect=409)
                cancelled = api.request("POST", f"/api/bookings/{booking['id']}/cancel")
                assert cancelled["status"] == "cancelled"
                return
        raise SmokeError("no free date found for the booking check")

    def message() -> None:
        thread = api.request(
            "POST",
            "/api/conversations",
            {"listing_id": listing_id, "body": "Smoke test"},
            expect=201,
        )
        messages = api.request("GET", f"/api/conversations/{thread['id']}/messages")
        assert messages[-1]["body"] == "Smoke test"

    for check in (sign_up, wishlist, upload, book_and_cancel, message):
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
        write_checks(api, state)
    print("Smoke test passed.")
    sys.exit(0)


if __name__ == "__main__":
    main()
