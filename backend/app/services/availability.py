from datetime import date

from sqlalchemy import ColumnElement, Select, and_, select, union, update
from sqlalchemy.orm import Session

from app.models import BlockedPeriod, Booking, BookingStatus, Listing


def overlaps(check_in: date, check_out: date) -> ColumnElement[bool]:
    # Check-out day is free for the next guest, so ranges that only touch do not overlap.
    return and_(
        Booking.status == BookingStatus.CONFIRMED,
        Booking.check_in < check_out,
        Booking.check_out > check_in,
    )


def blocked_overlaps(start: date, end: date) -> ColumnElement[bool]:
    return and_(BlockedPeriod.start_date < end, BlockedPeriod.end_date > start)


def unavailable_listing_ids(check_in: date, check_out: date) -> Select[tuple[int]]:
    """Listings with a confirmed stay or a host-blocked night inside the range."""
    return union(
        select(Booking.listing_id).where(overlaps(check_in, check_out)),
        select(BlockedPeriod.listing_id).where(blocked_overlaps(check_in, check_out)),
    )


def is_available(db: Session, listing_id: int, check_in: date, check_out: date) -> bool:
    booked = select(Booking.id).where(
        Booking.listing_id == listing_id, overlaps(check_in, check_out)
    )
    blocked = select(BlockedPeriod.id).where(
        BlockedPeriod.listing_id == listing_id, blocked_overlaps(check_in, check_out)
    )
    return db.scalar(booked.limit(1)) is None and db.scalar(blocked.limit(1)) is None


def unavailable_ranges(db: Session, listing_id: int, from_date: date) -> list[tuple[date, date]]:
    """Booked and blocked ranges that end after `from_date`, sorted by start date."""
    booked = db.execute(
        select(Booking.check_in, Booking.check_out).where(
            Booking.listing_id == listing_id,
            Booking.status == BookingStatus.CONFIRMED,
            Booking.check_out > from_date,
        )
    )
    blocked = db.execute(
        select(BlockedPeriod.start_date, BlockedPeriod.end_date).where(
            BlockedPeriod.listing_id == listing_id, BlockedPeriod.end_date > from_date
        )
    )
    return sorted((start, end) for start, end in [*booked, *blocked])


def lock_listing_calendar(db: Session, listing_id: int) -> None:
    # SQLite has no row locks. A no-op write takes the database write lock, so the
    # availability check and the insert that follow cannot interleave with another writer.
    db.execute(
        update(Listing).where(Listing.id == listing_id).values(updated_at=Listing.updated_at)
    )
