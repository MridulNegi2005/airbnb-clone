"""Security probe for a running API, safe to point at production.

It acts like an outside attacker with two throwaway accounts: forged tokens, other users' data,
mass assignment, injection, dangerous uploads, path traversal, CORS and data leaks. It touches
only its own accounts and its own listing, which it archives at the end.

    python scripts/security_probe.py --base-url https://airbnb-api.example.com
    python scripts/security_probe.py --base-url ... --rate-limit

--rate-limit also checks the login limit, which locks your IP out of login for 5 minutes.
"""

import argparse
import base64
import io
import json
import secrets
import urllib.error
import urllib.request
from datetime import date, timedelta
from typing import Any

from PIL import Image
from smoke_test import Client, _multipart, _png, _run

ALLOWED_ORIGIN = "https://airbnb.mridulnegi.dev"
PRIVATE_FIELDS = {"email", "password_hash", "google_sub", "token_version"}


def _keys(value: Any) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {key for item in value.values() for key in _keys(item)}
    if isinstance(value, list):
        return {key for item in value for key in _keys(item)}
    return set()


def _raw(
    base_url: str, method: str, path: str, headers: dict[str, str], body: bytes | None = None
) -> tuple[int, dict]:
    request = urllib.request.Request(base_url + path, data=body, method=method, headers=headers)
    request.add_header("User-Agent", "airbnb-clone-security-probe/1.0")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return response.status, dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers)
    except (urllib.error.URLError, TimeoutError) as error:
        raise AssertionError(f"{method} {path} got no response: {error}") from None


def probe(base_url: str, check_rate_limit: bool) -> None:
    owner, intruder = Client(base_url), Client(base_url)
    created: dict[str, Any] = {}

    def accounts() -> None:
        for client, role in ((owner, "owner"), (intruder, "intruder")):
            email = f"probe-{role}-{secrets.token_hex(6)}@example.com"
            auth = client.request(
                "POST",
                "/api/auth/register",
                {"name": f"Probe {role}", "email": email, "password": secrets.token_urlsafe(16)},
                expect=201,
            )
            client.token = auth["access_token"]

    def forged_tokens() -> None:
        header, payload, _ = (owner.token or "").split(".")
        claims = json.loads(base64.urlsafe_b64decode(payload + "=="))
        forged = base64.urlsafe_b64encode(json.dumps({**claims, "sub": "1"}).encode())
        none_header = base64.urlsafe_b64encode(b'{"alg":"none","typ":"JWT"}').rstrip(b"=")
        attacker = Client(base_url)
        for token in (
            f"{header}.{forged.rstrip(b'=').decode()}.{owner.token.split('.')[2]}",  # type: ignore[union-attr]
            f"{none_header.decode()}.{payload}.",
            "not.a.jwt",
        ):
            attacker.token = token
            attacker.request("GET", "/api/auth/me", expect=401)

    def owner_listing_and_booking() -> None:
        body, content_type = _multipart("file", "probe.png", _png(), "image/png")
        photo = owner.request(
            "POST", "/api/uploads", raw=body, content_type=content_type, expect=201
        )
        listing = owner.request(
            "POST",
            "/api/listings",
            {
                "title": "Security probe flat",
                "description": "Created by the security probe and archived at the end.",
                "property_type": "apartment",
                "room_type": "entire_home",
                "address": "2 Probe Street",
                "neighbourhood": "Probepur",
                "city": "Bengaluru",
                "country": "India",
                "latitude": 12.97,
                "longitude": 77.64,
                "price_per_night": 1500,
                "max_guests": 2,
                "bedrooms": 1,
                "beds": 1,
                "bathrooms": 1,
                "image_urls": [photo["url"]],
            },
            expect=201,
        )
        created.update(listing=listing, photo=photo["url"])
        created["wishlist"] = owner.request(
            "POST", "/api/wishlists", {"name": "Private"}, expect=201
        )

    def no_access_to_other_users_data() -> None:
        listing_id = created["listing"]["id"]
        intruder.request("GET", f"/api/host/listings/{listing_id}", expect=403)
        intruder.request("DELETE", f"/api/listings/{listing_id}", expect=403)
        intruder.request("GET", f"/api/wishlists/{created['wishlist']['id']}", expect=404)
        intruder.request(
            "PUT",
            f"/api/wishlists/{created['wishlist']['id']}/listings/{listing_id}",
            expect=404,
        )
        intruder.request("GET", f"/api/host/listings/{listing_id}/blocked-dates", expect=403)
        assert intruder.request("GET", "/api/host/bookings") == []

    def no_reuse_of_other_users_uploads() -> None:
        intruder.request("PATCH", "/api/users/me", {"avatar_url": created["photo"]}, expect=422)

    def mass_assignment_is_ignored() -> None:
        me = intruder.request(
            "PATCH",
            "/api/users/me",
            {"about": "probe", "is_superhost": True, "token_version": 99, "email": "x@y.z"},
        )
        assert me["is_superhost"] is False and me["email"].startswith("probe-intruder-")

    def injection_is_inert() -> None:
        for payload in ("' OR 1=1 --", "%", "_", "%' UNION SELECT password_hash FROM users --"):
            query = urllib.request.quote(payload)
            assert intruder.request("GET", f"/api/listings?location={query}")["total"] == 0

    def dangerous_uploads_are_rejected() -> None:
        svg = b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'
        html_as_png = b"\x89PNG\r\n\x1a\n<html><script>alert(1)</script></html>"
        for name, data, mime in (
            ("evil.svg", svg, "image/svg+xml"),
            ("evil.png", html_as_png, "image/png"),
        ):
            body, content_type = _multipart("file", name, data, mime)
            intruder.request(
                "POST", "/api/uploads", raw=body, content_type=content_type, expect=415
            )
        bomb = io.BytesIO()
        Image.new("1", (12_000, 12_000)).save(bomb, "PNG")
        body, content_type = _multipart("file", "bomb.png", bomb.getvalue(), "image/png")
        intruder.request("POST", "/api/uploads", raw=body, content_type=content_type, expect=413)

    def oversized_uploads_are_refused_early() -> None:
        status, _ = _raw(
            base_url,
            "POST",
            "/api/uploads",
            {
                "Authorization": f"Bearer {intruder.token}",
                "Content-Length": str(50 * 1024 * 1024),
                "Content-Type": "multipart/form-data; boundary=x",
            },
        )
        assert status in (413, 400), status

    def no_path_traversal() -> None:
        for path in ("/media/../app/config.py", "/media/%2e%2e/app/config.py", "/.env"):
            status, _ = _raw(base_url, "GET", path, {})
            assert status == 404, (path, status)

    def cors_only_for_the_frontend() -> None:
        preflight = {"Access-Control-Request-Method": "GET"}
        _, allowed = _raw(
            base_url, "OPTIONS", "/api/listings", {**preflight, "Origin": ALLOWED_ORIGIN}
        )
        _, blocked = _raw(
            base_url, "OPTIONS", "/api/listings", {**preflight, "Origin": "https://evil.example"}
        )
        allowed_headers = {key.lower(): value for key, value in allowed.items()}
        blocked_headers = {key.lower() for key in blocked}
        assert allowed_headers.get("access-control-allow-origin") == ALLOWED_ORIGIN
        assert "access-control-allow-origin" not in blocked_headers
        assert "access-control-allow-credentials" not in allowed_headers

    def no_private_data_in_public_responses() -> None:
        listing_id = created["listing"]["id"]
        host_id = created["listing"]["host"]["id"]
        public = Client(base_url)
        bodies = [
            public.request("GET", f"/api/listings/{listing_id}"),
            public.request("GET", "/api/listings?page_size=5"),
            public.request("GET", f"/api/users/{host_id}"),
            public.request("GET", f"/api/users/{host_id}/listings"),
        ]
        for body in bodies:
            assert not (_keys(body) & PRIVATE_FIELDS), _keys(body) & PRIVATE_FIELDS
        assert "address" not in bodies[0]

    def errors_do_not_leak_internals() -> None:
        for path in ("/api/listings/abc", "/api/listings/0", "/api/listings?page=-1"):
            status, _ = _raw(base_url, "GET", path, {})
            assert status in (404, 422), (path, status)

    def booking_dates_cannot_be_abused() -> None:
        listing_id = created["listing"]["id"]
        past = date.today() - timedelta(days=3)
        intruder.request(
            "POST",
            "/api/bookings",
            {"listing_id": listing_id, "check_in": str(past), "check_out": str(date.today())},
            expect=422,
        )
        owner.request(
            "POST",
            "/api/bookings",
            {
                "listing_id": listing_id,
                "check_in": str(date.today() + timedelta(days=10)),
                "check_out": str(date.today() + timedelta(days=12)),
            },
            expect=403,
        )

    def clean_up() -> None:
        owner.request("DELETE", f"/api/wishlists/{created['wishlist']['id']}", expect=204)
        owner.request("DELETE", f"/api/listings/{created['listing']['id']}", expect=204)

    def login_is_rate_limited() -> None:
        attempt = json.dumps({"email": "nobody@example.com", "password": "wrong-password"})
        headers = {"Content-Type": "application/json"}
        statuses = [
            _raw(base_url, "POST", "/api/auth/login", headers, attempt.encode())[0]
            for _ in range(25)
        ]
        assert 429 in statuses, statuses

    checks = [
        accounts,
        forged_tokens,
        owner_listing_and_booking,
        no_access_to_other_users_data,
        no_reuse_of_other_users_uploads,
        mass_assignment_is_ignored,
        injection_is_inert,
        dangerous_uploads_are_rejected,
        oversized_uploads_are_refused_early,
        no_path_traversal,
        cors_only_for_the_frontend,
        no_private_data_in_public_responses,
        errors_do_not_leak_internals,
        booking_dates_cannot_be_abused,
        clean_up,
    ]
    if check_rate_limit:
        checks.append(login_is_rate_limited)
    for check in checks:
        _run(check)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--rate-limit", action="store_true", help="also check the login rate limit")
    args = parser.parse_args()
    probe(args.base_url, args.rate_limit)
    print("Security probe passed.")


if __name__ == "__main__":
    main()
