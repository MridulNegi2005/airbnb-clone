import ipaddress
import threading
import time
from collections import OrderedDict, deque
from collections.abc import Callable

from fastapi import HTTPException, Request, status

from app.config import get_settings
from app.deps import CurrentUser
from app.models import User


class RateLimiter:
    """Sliding-window limiter kept in process memory, enough for a single-instance deploy."""

    def __init__(self, limit: int, window_seconds: int, max_keys: int = 50_000) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        # Ordered from least to most recently seen client, so the table can evict the oldest.
        self._hits: OrderedDict[str, deque[float]] = OrderedDict()
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            hits = self._hits.get(key)
            if hits is None:
                hits = self._hits[key] = deque()
                # Bound memory by forgetting the least recently seen client, never by
                # refusing new ones: a flood of addresses cannot lock real users out.
                if len(self._hits) > self.max_keys:
                    self._hits.popitem(last=False)
            else:
                self._hits.move_to_end(key)

            while hits and now - hits[0] >= self.window_seconds:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


_NAT64 = ipaddress.IPv6Network("64:ff9b::/96")
_IPV4_COMPATIBLE = ipaddress.IPv6Network("::/96")

_registry: list[RateLimiter] = []


def _register(limit: int, window_seconds: int) -> RateLimiter:
    limiter = RateLimiter(limit=limit, window_seconds=window_seconds)
    _registry.append(limiter)
    return limiter


def reset_all() -> None:
    for limiter in _registry:
        limiter.reset()


def client_key(request: Request) -> str:
    host = request.client.host if request.client else "unknown"
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return host
    if isinstance(address, ipaddress.IPv6Address):
        if embedded := _embedded_ipv4(address):
            return str(embedded)
        # One IPv6 machine usually controls a whole /64, so count the network, not each address.
        return str(ipaddress.IPv6Network((address, 64), strict=False))
    return str(address)


def _embedded_ipv4(address: ipaddress.IPv6Address) -> ipaddress.IPv4Address | None:
    """The real IPv4 client behind transition addresses, which would otherwise share a /64."""
    if address.ipv4_mapped:
        return address.ipv4_mapped
    if address.teredo:
        return address.teredo[1]
    if address.sixtofour:
        return address.sixtofour
    if address in _NAT64 or address in _IPV4_COMPATIBLE:
        return ipaddress.IPv4Address(int(address) & 0xFFFF_FFFF)
    return None


def too_many_requests(retry_after_seconds: int) -> HTTPException:
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many requests. Try again in a few minutes.",
        headers={"Retry-After": str(retry_after_seconds)},
    )


def limit_by_ip(limit: int, window_seconds: int) -> Callable[[Request], None]:
    limiter = _register(limit, window_seconds)

    def dependency(request: Request) -> None:
        if not limiter.allow(client_key(request)):
            raise too_many_requests(window_seconds)

    return dependency


def limit_by_user(limit: int, window_seconds: int) -> Callable[[User], None]:
    limiter = _register(limit, window_seconds)

    def dependency(user: CurrentUser) -> None:
        if not limiter.allow(str(user.id)):
            raise too_many_requests(window_seconds)

    return dependency


global_limiter = _register(get_settings().rate_limit_per_minute, 60)
