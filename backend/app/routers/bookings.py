from fastapi import APIRouter, Depends, status

from app.deps import CurrentUser, DbSession, PathId
from app.models import Booking, GuestReview, ListingReview
from app.rate_limit import limit_by_user
from app.schemas.booking import (
    BookingCreate,
    BookingOut,
    GuestReviewCreate,
    GuestReviewOut,
    ListingReviewCreate,
    ListingReviewOut,
)
from app.services.bookings import (
    cancel_booking,
    create_booking,
    get_booking,
    list_trips,
    review_guest,
    review_listing,
)

router = APIRouter(prefix="/bookings", tags=["bookings"])

limit_bookings = Depends(limit_by_user(limit=10, window_seconds=3600))
limit_reviews = Depends(limit_by_user(limit=20, window_seconds=3600))


@router.post(
    "",
    response_model=BookingOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[limit_bookings],
)
def book(payload: BookingCreate, user: CurrentUser, db: DbSession) -> Booking:
    return create_booking(db, user, payload)


@router.get("", response_model=list[BookingOut])
def read_trips(user: CurrentUser, db: DbSession) -> list[Booking]:
    return list_trips(db, user)


@router.get("/{booking_id}", response_model=BookingOut)
def read_booking(booking_id: PathId, user: CurrentUser, db: DbSession) -> Booking:
    return get_booking(db, booking_id, user)


@router.post("/{booking_id}/cancel", response_model=BookingOut, dependencies=[limit_bookings])
def cancel(booking_id: PathId, user: CurrentUser, db: DbSession) -> Booking:
    return cancel_booking(db, booking_id, user)


@router.post(
    "/{booking_id}/review",
    response_model=ListingReviewOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[limit_reviews],
)
def review_stay(
    booking_id: PathId, payload: ListingReviewCreate, user: CurrentUser, db: DbSession
) -> ListingReview:
    return review_listing(db, booking_id, user, payload)


@router.post(
    "/{booking_id}/guest-review",
    response_model=GuestReviewOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[limit_reviews],
)
def review_stay_guest(
    booking_id: PathId, payload: GuestReviewCreate, user: CurrentUser, db: DbSession
) -> GuestReview:
    return review_guest(db, booking_id, user, payload)
