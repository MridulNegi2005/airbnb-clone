import ipaddress
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


class RateLimiter:
    """Sliding-window limiter kept in process memory, enough for a single-instance deploy."""

    def __init__(self, limit: int, window_seconds: int, max_keys: int = 100_000) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self._hits: defaultdict[str, deque[float]] = defaultdict(deque)
        self._last_sweep = time.monotonic()
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            since_sweep = now - self._last_sweep
            full = len(self._hits) >= self.max_keys
            if since_sweep >= self.window_seconds or (full and since_sweep >= 1):
                self._sweep(now)
            # When the table is full of active clients, refuse new ones instead of growing.
            if key not in self._hits and len(self._hits) >= self.max_keys:
                return False

            hits = self._hits[key]
            while hits and now - hits[0] >= self.window_seconds:
                hits.popleft()
            if len(hits) >= self.limit:
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()

    def _sweep(self, now: float) -> None:
        stale = [
            key
            for key, hits in self._hits.items()
            if not hits or now - hits[-1] >= self.window_seconds
        ]
        for key in stale:
            del self._hits[key]
        self._last_sweep = now


auth_limiter = RateLimiter(limit=20, window_seconds=300)


def client_key(request: Request) -> str:
    host = request.client.host if request.client else "unknown"
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return host
    # One IPv6 machine usually controls a whole /64, so count the network, not each address.
    if address.version == 6:
        return str(ipaddress.IPv6Network((address, 64), strict=False))
    return str(address)


def limit_auth_attempts(request: Request) -> None:
    if not auth_limiter.allow(client_key(request)):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Try again in a few minutes.",
            headers={"Retry-After": str(auth_limiter.window_seconds)},
        )
