import hashlib
import hmac
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import cache

import jwt

from app.config import get_settings

_ALGORITHM = "HS256"
_PBKDF2_ITERATIONS = 600_000


def _derive(password: str, salt: bytes, iterations: int) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations).hex()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = _derive(password, salt, _PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${_PBKDF2_ITERATIONS}${salt.hex()}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    _, iterations, salt, digest = stored_hash.split("$")
    candidate = _derive(password, bytes.fromhex(salt), int(iterations))
    return hmac.compare_digest(candidate, digest)


@cache
def dummy_password_hash() -> str:
    return hash_password(secrets.token_urlsafe(16))


def create_access_token(user_id: int, version: int) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "ver": version,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_ttl_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


@dataclass(frozen=True)
class AccessToken:
    user_id: int
    version: int


def decode_access_token(token: str) -> AccessToken | None:
    try:
        payload = jwt.decode(
            token,
            get_settings().secret_key,
            algorithms=[_ALGORITHM],
            options={"require": ["sub", "ver", "exp"]},
        )
        return AccessToken(int(payload["sub"]), int(payload["ver"]))
    except (jwt.PyJWTError, ValueError, TypeError):
        return None
