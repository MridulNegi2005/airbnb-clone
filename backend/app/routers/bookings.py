from fastapi import APIRouter, status

from app.deps import CurrentUser, DbSession, PathId
from app.models import Booking, Review
from app.schemas.booking import BookingCreate, BookingOut, ReviewCreate, ReviewOut
from app.services.bookings import (
    cancel_booking,
    create_booking,
    get_booking,
    list_trips,
    review_booking,
)

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("", response_model=BookingOut, status_code=status.HTTP_201_CREATED)
def book(payload: BookingCreate, user: CurrentUser, db: DbSession) -> Booking:
    return create_booking(db, user, payload)


@router.get("", response_model=list[BookingOut])
def read_trips(user: CurrentUser, db: DbSession) -> list[Booking]:
    return list_trips(db, user)


@router.get("/{booking_id}", response_model=BookingOut)
def read_booking(booking_id: PathId, user: CurrentUser, db: DbSession) -> Booking:
    return get_booking(db, booking_id, user)


@router.post("/{booking_id}/cancel", response_model=BookingOut)
def cancel(booking_id: PathId, user: CurrentUser, db: DbSession) -> Booking:
    return cancel_booking(db, booking_id, user)


@router.post("/{booking_id}/review", response_model=ReviewOut, status_code=status.HTTP_201_CREATED)
def review(booking_id: PathId, payload: ReviewCreate, user: CurrentUser, db: DbSession) -> Review:
    return review_booking(db, booking_id, user, payload)
