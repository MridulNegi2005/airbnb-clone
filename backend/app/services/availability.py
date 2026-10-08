from datetime import date

from sqlalchemy import ColumnElement, and_, select, update
from sqlalchemy.orm import Session

from app.models import Booking, BookingStatus, Listing


def overlaps(check_in: date, check_out: date) -> ColumnElement[bool]:
    # Check-out day is free for the next guest, so ranges that only touch do not overlap.
    return and_(
        Booking.status == BookingStatus.CONFIRMED,
        Booking.check_in < check_out,
        Booking.check_out > check_in,
    )


def is_available(db: Session, listing_id: int, check_in: date, check_out: date) -> bool:
    clash = select(Booking.id).where(
        Booking.listing_id == listing_id, overlaps(check_in, check_out)
    )
    return db.scalar(clash.limit(1)) is None


def booked_ranges(db: Session, listing_id: int, from_date: date) -> list[Booking]:
    stmt = (
        select(Booking)
        .where(
            Booking.listing_id == listing_id,
            Booking.status == BookingStatus.CONFIRMED,
            Booking.check_out > from_date,
        )
        .order_by(Booking.check_in)
    )
    return list(db.scalars(stmt))


def lock_listing_calendar(db: Session, listing_id: int) -> None:
    # SQLite has no row locks. A no-op write takes the database write lock, so the
    # availability check and the insert that follow cannot interleave with another booking.
    db.execute(
        update(Listing).where(Listing.id == listing_id).values(updated_at=Listing.updated_at)
    )
