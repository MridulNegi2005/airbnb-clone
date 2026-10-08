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


def key_for(host: str) -> str:
    return client_key(SimpleNamespace(client=SimpleNamespace(host=host)))  # type: ignore[arg-type]


def test_limit_resets_after_the_window(clock: FakeClock) -> None:
    limiter = RateLimiter(limit=2, window_seconds=60)
    assert limiter.allow("a") and limiter.allow("a")
    assert not limiter.allow("a")
    clock.now += 60
    assert limiter.allow("a")


def test_full_table_evicts_the_least_recently_seen_client(clock: FakeClock) -> None:
    limiter = RateLimiter(limit=1, window_seconds=60, max_keys=2)
    assert limiter.allow("a") and limiter.allow("b")
    assert not limiter.allow("a")

    assert limiter.allow("c")
    assert list(limiter._hits) == ["a", "c"]
    assert not limiter.allow("a")


def test_ipv6_clients_are_grouped_by_network() -> None:
    assert key_for("2001:db8::1") == key_for("2001:db8::ffff") == "2001:db8::/64"
    assert key_for("2001:db8::1") != key_for("2001:db8:0:1::1")
    assert key_for("203.0.113.7") == "203.0.113.7"


@pytest.mark.parametrize(
    ("host", "expected"),
    [
        ("::ffff:203.0.113.7", "203.0.113.7"),
        ("2001:0:4136:e378:8000:63bf:3fff:fdd2", "192.0.2.45"),
        ("2002:cb00:7107::1", "203.0.113.7"),
        ("64:ff9b::cb00:7107", "203.0.113.7"),
        ("::cb00:7107", "203.0.113.7"),
    ],
)
def test_transition_addresses_are_keyed_by_their_ipv4_client(host: str, expected: str) -> None:
    assert key_for(host) == expected
