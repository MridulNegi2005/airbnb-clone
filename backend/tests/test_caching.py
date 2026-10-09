from fastapi.testclient import TestClient

from tests.conftest import Headers


def test_public_reads_are_cacheable_by_any_origin(client: TestClient) -> None:
    response = client.get("/api/categories", headers={"Origin": "http://localhost:3000"})
    assert response.headers["cache-control"].startswith("public")
    assert response.headers["access-control-allow-origin"] == "*"
    listings = client.get("/api/listings")
    assert "s-maxage=30" in listings.headers["cache-control"]


def test_signed_in_and_private_reads_are_not_cached(client: TestClient, guest: Headers) -> None:
    signed_in = client.get("/api/listings", headers=guest)
    assert "cache-control" not in signed_in.headers
    me = client.get("/api/auth/me", headers=guest)
    assert "cache-control" not in me.headers
