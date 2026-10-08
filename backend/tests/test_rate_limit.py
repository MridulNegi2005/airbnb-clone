from types import SimpleNamespace

import pytest

from app import rate_limit
from app.rate_limit import RateLimiter, client_key


class FakeClock:
    def __init__(self) -> None:
        self.now = 1_000.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def clock(monkeypatch: pytest.MonkeyPatch) -> FakeClock:
    fake = FakeClock()
    monkeypatch.setattr(rate_limit.time, "monotonic", fake)
    return fake


def test_limit_resets_after_the_window(clock: FakeClock) -> None:
    limiter = RateLimiter(limit=2, window_seconds=60)
    assert limiter.allow("a") and limiter.allow("a")
    assert not limiter.allow("a")
    clock.now += 60
    assert limiter.allow("a")


def test_stale_keys_are_swept_and_table_is_capped(clock: FakeClock) -> None:
    limiter = RateLimiter(limit=5, window_seconds=60, max_keys=2)
    assert limiter.allow("a") and limiter.allow("b")
    assert not limiter.allow("c")

    clock.now += 61
    assert limiter.allow("c")
    assert set(limiter._hits) == {"c"}


def test_ipv6_clients_are_grouped_by_network() -> None:
    def request(host: str) -> SimpleNamespace:
        return SimpleNamespace(client=SimpleNamespace(host=host))

    assert client_key(request("2001:db8::1")) == client_key(request("2001:db8::ffff"))
    assert client_key(request("2001:db8::1")) != client_key(request("2001:db8:0:1::1"))
    assert client_key(request("203.0.113.7")) == "203.0.113.7"
    assert client_key(request("::ffff:203.0.113.7")) == "203.0.113.7"
    assert client_key(request("::ffff:198.51.100.9")) == "198.51.100.9"
