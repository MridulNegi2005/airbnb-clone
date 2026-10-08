from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models import Booking, GuestReview, Listing, ListingReview, User
from app.schemas.common import Page
from app.schemas.review import ProfileReview, ProfileReviewQuery, ReviewedListing
from app.schemas.user import ProfileUpdate, PublicProfile, UserPublic
from app.services.media import ensure_usable_images


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


def public_profile(db: Session, user_id: int) -> PublicProfile:
    user = get_user(db, user_id)
    listing_count = db.scalar(
        select(func.count(Listing.id)).where(
            Listing.host_id == user.id, Listing.archived_at.is_(None)
        )
    )
    host_reviews = db.execute(
        select(func.count(ListingReview.id), func.round(func.avg(ListingReview.rating), 2))
        .join(Booking, Booking.id == ListingReview.booking_id)
        .join(Listing, Listing.id == Booking.listing_id)
        .where(Listing.host_id == user.id)
    ).one()
    guest_review_count = db.scalar(
        select(func.count(GuestReview.id))
        .join(Booking, Booking.id == GuestReview.booking_id)
        .where(Booking.guest_id == user.id)
    )
    return PublicProfile(
        **UserPublic.model_validate(user).model_dump(),
        work=user.work,
        languages=user.languages,
        lives_in=user.lives_in,
        listing_count=listing_count or 0,
        host_review_count=host_reviews[0],
        host_rating=host_reviews[1],
        guest_review_count=guest_review_count or 0,
    )


def profile_reviews(db: Session, user_id: int, query: ProfileReviewQuery) -> Page[ProfileReview]:
    """Reviews about the user: from guests of their listings, or from hosts they stayed with."""
    get_user(db, user_id)
    about_host = query.about == "host"
    review_model = ListingReview if about_host else GuestReview
    about_user = Listing.host_id == user_id if about_host else Booking.guest_id == user_id
    base = (
        select(review_model)
        .join(Booking, Booking.id == review_model.booking_id)
        .join(Listing, Listing.id == Booking.listing_id)
        .where(about_user)
    )
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    reviews = db.scalars(
        base.options(
            joinedload(review_model.booking).joinedload(Booking.guest),
            joinedload(review_model.booking).joinedload(Booking.listing).joinedload(Listing.host),
        )
        .order_by(review_model.created_at.desc(), review_model.id.desc())
        .offset(query.offset)
        .limit(query.page_size)
    ).all()
    items = [
        ProfileReview(
            id=review.id,
            rating=review.rating,
            comment=review.comment,
            created_at=review.created_at,
            author=UserPublic.model_validate(review.author),
            listing=ReviewedListing.model_validate(review.booking.listing),
        )
        for review in reviews
    ]
    return Page[ProfileReview].build(items, total, query)


def update_profile(db: Session, user: User, payload: ProfileUpdate) -> User:
    changes = payload.model_dump(exclude_unset=True)
    if (avatar_url := changes.get("avatar_url")) is not None:
        changes["avatar_url"] = str(avatar_url)
        ensure_usable_images(db, user, [changes["avatar_url"]])
    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    return user


def verify_identity(db: Session, user: User) -> User:
    # Mocked: a real flow would hand off to an ID-verification provider.
    if user.identity_verified_at is None:
        user.identity_verified_at = datetime.now(UTC)
        db.commit()
    return user
