from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.deps import CurrentUser, DbSession
from app.models import User
from app.rate_limit import limit_auth_attempts
from app.schemas.user import AuthResponse, LoginRequest, RegisterRequest, UserPrivate
from app.security import (
    create_access_token,
    dummy_password_hash,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user.id), user=UserPrivate.model_validate(user)
    )


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limit_auth_attempts)],
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


@router.post("/login", response_model=AuthResponse, dependencies=[Depends(limit_auth_attempts)])
def login(payload: LoginRequest, db: DbSession) -> AuthResponse:
    user = db.scalar(select(User).where(User.email == payload.email))
    # Hash even for unknown emails so the response time does not reveal which accounts exist.
    stored_hash = user.password_hash if user else dummy_password_hash()
    if not verify_password(payload.password, stored_hash) or user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    return _auth_response(user)


@router.get("/me", response_model=UserPrivate)
def me(user: CurrentUser) -> User:
    return user
