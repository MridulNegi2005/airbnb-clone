from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import HTTPException, status

_GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
_GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"]


@dataclass(frozen=True)
class GoogleIdentity:
    subject: str
    email: str
    name: str
    picture: str | None


@lru_cache
def _signing_keys() -> jwt.PyJWKClient:
    # Caches Google's rotating public keys and refetches when an unknown key id appears.
    return jwt.PyJWKClient(_GOOGLE_CERTS_URL, cache_keys=True, lifespan=6 * 60 * 60)


def verify_google_credential(credential: str, client_id: str) -> GoogleIdentity:
    """Verify a Google Identity Services ID token the way Google's documentation requires:
    signature from Google's keys, our client id as audience, a Google issuer, not expired,
    and a verified email address."""
    try:
        key = _signing_keys().get_signing_key_from_jwt(credential)
        claims = jwt.decode(
            credential,
            key.key,
            algorithms=["RS256"],
            audience=client_id,
            issuer=_GOOGLE_ISSUERS,
            options={"require": ["sub", "email", "exp", "iss", "aud"]},
        )
    except jwt.PyJWTError:
        raise _invalid() from None
    if claims.get("email_verified") is not True:
        raise _invalid()
    return GoogleIdentity(
        subject=str(claims["sub"]),
        email=str(claims["email"]).lower(),
        name=str(claims.get("name") or claims["email"].split("@")[0])[:80],
        picture=claims.get("picture"),
    )


def _invalid() -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Google sign-in failed")
