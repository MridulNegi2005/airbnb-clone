from dataclasses import dataclass
from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import Select, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.config import get_settings
from app.models import Booking, BookingStatus, GuestReview, Listing, ListingReview, User
from app.schemas.booking import BookingCreate, GuestReviewCreate, ListingReviewCreate
from app.schemas.listing import PriceQuote, StayParams
from app.services.availability import is_available, lock_listing_calendar

WEEKLY_STAY_NIGHTS = 7


@dataclass(frozen=True)
class Price:
    nights: int
    nightly_rate: int
    discount: int
    cleaning_fee: int
    service_fee: int

    @property
    def subtotal(self) -> int:
        return self.nightly_rate * self.nights

    @property
    def total(self) -> int:
        return self.subtotal - self.discount + self.cleaning_fee + self.service_fee


def price_stay(listing: Listing, nights: int) -> Price:
    subtotal = listing.price_per_night * nights
    discount = (
        round(subtotal * listing.weekly_discount_percent / 100)
        if nights >= WEEKLY_STAY_NIGHTS
        else 0
    )
    service_base = subtotal - discount + listing.cleaning_fee
    service_fee = round(service_base * get_settings().service_fee_rate)
    return Price(nights, listing.price_per_night, discount, listing.cleaning_fee, service_fee)


def validate_stay(listing: Listing, stay: StayParams) -> None:
    if stay.check_in < date.today():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Check-in date cannot be in the past"
        )
    if stay.guests > listing.max_guests:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"This place allows a maximum of {listing.max_guests} guests",
        )
    if stay.nights < listing.min_nights:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"This place has a minimum stay of {listing.min_nights} nights",
        )
    if stay.nights > listing.max_nights:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"This place has a maximum stay of {listing.max_nights} nights",
        )


def quote_stay(db: Session, listing: Listing, stay: StayParams) -> PriceQuote:
    validate_stay(listing, stay)
    price = price_stay(listing, stay.nights)
    return PriceQuote(
        nights=price.nights,
        nightly_rate=price.nightly_rate,
        subtotal=price.subtotal,
        discount=price.discount,
        cleaning_fee=price.cleaning_fee,
        service_fee=price.service_fee,
        total=price.total,
        available=is_available(db, listing.id, stay.check_in, stay.check_out),
    )


def booking_query() -> Select[tuple[Booking]]:
    return select(Booking).options(
        joinedload(Booking.guest),
        selectinload(Booking.review),
        selectinload(Booking.guest_review),
        selectinload(Booking.listing).selectinload(Listing.images),
        selectinload(Booking.listing).joinedload(Listing.host),
    )


def create_booking(db: Session, guest: User, payload: BookingCreate) -> Booking:
    listing = db.get(Listing, payload.listing_id)
    if listing is None or listing.archived_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Listing not found")
    if listing.host_id == guest.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You cannot book your own listing")
    validate_stay(listing, payload)

    lock_listing_calendar(db, listing.id)
    if not is_available(db, listing.id, payload.check_in, payload.check_out):
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Those dates are no longer available")

    price = price_stay(listing, payload.nights)
    booking = Booking(
        listing_id=listing.id,
        guest_id=guest.id,
        check_in=payload.check_in,
        check_out=payload.check_out,
        guests=payload.guests,
        nightly_rate=price.nightly_rate,
        discount=price.discount,
        cleaning_fee=price.cleaning_fee,
        service_fee=price.service_fee,
        total=price.total,
    )
    db.add(booking)
    db.commit()
    return get_booking(db, booking.id, guest)


def list_trips(db: Session, guest: User) -> list[Booking]:
    stmt = booking_query().where(Booking.guest_id == guest.id).order_by(Booking.check_in.desc())
    return list(db.scalars(stmt))


def get_booking(db: Session, booking_id: int, user: User) -> Booking:
    booking = db.scalar(booking_query().where(Booking.id == booking_id))
    # Guests and the listing's host can see a booking; everyone else gets a 404, not a 403.
    if booking is None or user.id not in (booking.guest_id, booking.listing.host_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return booking


def _get_as_guest(db: Session, booking_id: int, guest: User) -> Booking:
    booking = get_booking(db, booking_id, guest)
    if booking.guest_id != guest.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return booking


def _get_as_host(db: Session, booking_id: int, host: User) -> Booking:
    booking = get_booking(db, booking_id, host)
    if booking.listing.host_id != host.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return booking


def cancel_booking(db: Session, booking_id: int, guest: User) -> Booking:
    booking = _get_as_guest(db, booking_id, guest)
    if booking.status != BookingStatus.CONFIRMED or booking.check_in <= date.today():
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Only upcoming trips can be cancelled"
        )
    booking.status = BookingStatus.CANCELLED
    booking.cancelled_at = datetime.now(UTC)
    db.commit()
    return booking


def _ensure_stay_completed(booking: Booking) -> None:
    if booking.status != BookingStatus.CONFIRMED or booking.check_out > date.today():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Reviews open after check-out")


def _commit_review(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="This stay has already been reviewed"
        ) from None


def review_listing(
    db: Session, booking_id: int, guest: User, payload: ListingReviewCreate
) -> ListingReview:
    booking = _get_as_guest(db, booking_id, guest)
    _ensure_stay_completed(booking)
    if booking.review is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="This stay has already been reviewed")
    review = ListingReview(booking=booking, **payload.model_dump())
    db.add(review)
    _commit_review(db)
    return review


def review_guest(
    db: Session, booking_id: int, host: User, payload: GuestReviewCreate
) -> GuestReview:
    booking = _get_as_host(db, booking_id, host)
    _ensure_stay_completed(booking)
    if booking.guest_review is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="This guest has already been reviewed")
    review = GuestReview(booking=booking, **payload.model_dump())
    db.add(review)
    _commit_review(db)
    return review


def list_host_bookings(db: Session, host: User, listing_id: int | None) -> list[Booking]:
    stmt = booking_query().join(Booking.listing).where(Listing.host_id == host.id)
    if listing_id is not None:
        stmt = stmt.where(Booking.listing_id == listing_id)
    return list(db.scalars(stmt.order_by(Booking.check_in.desc())))
