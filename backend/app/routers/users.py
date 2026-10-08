from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import CurrentUser, DbSession, PathId
from app.models import Listing, User
from app.rate_limit import limit_by_user
from app.schemas.common import Page
from app.schemas.listing import ListingCard
from app.schemas.review import ProfileReview, ProfileReviewQuery
from app.schemas.user import ProfileUpdate, PublicProfile, UserPrivate
from app.services.listings import active_listings
from app.services.profiles import (
    get_user,
    profile_reviews,
    public_profile,
    update_profile,
    verify_identity,
)

router = APIRouter(prefix="/users", tags=["users"])

limit_profile_writes = Depends(limit_by_user(limit=30, window_seconds=3600))


@router.patch("/me", response_model=UserPrivate, dependencies=[limit_profile_writes])
def update_me(payload: ProfileUpdate, user: CurrentUser, db: DbSession) -> User:
    return update_profile(db, user, payload)


@router.post(
    "/me/identity-verification", response_model=UserPrivate, dependencies=[limit_profile_writes]
)
def verify_me(user: CurrentUser, db: DbSession) -> User:
    return verify_identity(db, user)


@router.get("/{user_id}", response_model=PublicProfile)
def read_profile(user_id: PathId, db: DbSession) -> PublicProfile:
    return public_profile(db, user_id)


@router.get("/{user_id}/listings", response_model=list[ListingCard])
def read_user_listings(user_id: PathId, db: DbSession) -> list[Listing]:
    get_user(db, user_id)
    stmt = active_listings().where(Listing.host_id == user_id).order_by(Listing.id)
    return list(db.scalars(stmt))


@router.get("/{user_id}/reviews", response_model=Page[ProfileReview])
def read_user_reviews(
    user_id: PathId, query: Annotated[ProfileReviewQuery, Query()], db: DbSession
) -> Page[ProfileReview]:
    return profile_reviews(db, user_id, query)
