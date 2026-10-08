from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.deps import CurrentUser, DbSession
from app.models import User
from app.rate_limit import limit_by_ip
from app.schemas.user import (
    AuthResponse,
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    UserPrivate,
)
from app.security import (
    create_access_token,
    dummy_password_hash,
    hash_password,
    verify_password,
)
from app.services.google_identity import verify_google_credential

router = APIRouter(prefix="/auth", tags=["auth"])

limit_auth_attempts = Depends(limit_by_ip(limit=20, window_seconds=300))


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user.id, user.token_version),
        user=UserPrivate.model_validate(user),
    )


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[limit_auth_attempts],
)
def register(payload: RegisterRequest, db: DbSession) -> AuthResponse:
    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="An account with this email already exists"
        ) from None
    return _auth_response(user)


@router.post("/login", response_model=AuthResponse, dependencies=[limit_auth_attempts])
def login(payload: LoginRequest, db: DbSession) -> AuthResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    # Hash even for unknown emails and Google-only accounts, so timing reveals nothing.
    stored_hash = user.password_hash if user and user.password_hash else dummy_password_hash()
    password_ok = verify_password(payload.password, stored_hash)
    if user is None or user.password_hash is None or not password_ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return _auth_response(user)


@router.post("/google", response_model=AuthResponse, dependencies=[limit_auth_attempts])
def google_login(payload: GoogleLoginRequest, db: DbSession) -> AuthResponse:
    client_id = get_settings().google_client_id
    if not client_id:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail="Google sign-in is not configured"
        )
    identity = verify_google_credential(payload.credential, client_id)

    user = db.scalar(select(User).where(User.google_sub == identity.subject))
    if user is None:
        user = db.scalar(select(User).where(User.email == identity.email))
        if user is None:
            user = User(
                name=identity.name,
                email=identity.email,
                google_sub=identity.subject,
                avatar_url=identity.picture,
            )
            db.add(user)
        elif user.google_sub is not None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="This email is linked to a different Google account",
            )
        elif not identity.vouches_for_email:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="An account with this email already exists. Log in with your password.",
            )
        else:
            _link_google(user, identity.subject)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Please try again") from None
    return _auth_response(user)


def _link_google(user: User, subject: str) -> None:
    # Google just proved this person owns the email. Anyone could have registered the address
    # first, so drop that password and sign out every existing session.
    user.google_sub = subject
    user.password_hash = None
    user.token_version += 1


@router.get("/me", response_model=UserPrivate)
def me(user: CurrentUser) -> User:
    return user
