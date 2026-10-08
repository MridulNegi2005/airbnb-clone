from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import BlockedPeriod, Booking, Listing
from app.schemas.listing import BlockedPeriodCreate
from app.services.availability import blocked_overlaps, lock_listing_calendar, overlaps

MAX_BLOCKED_PERIODS = 200


def list_blocked_periods(db: Session, listing: Listing) -> list[BlockedPeriod]:
    stmt = (
        select(BlockedPeriod)
        .where(BlockedPeriod.listing_id == listing.id, BlockedPeriod.end_date > date.today())
        .order_by(BlockedPeriod.start_date)
    )
    return list(db.scalars(stmt))


def block_dates(db: Session, listing: Listing, payload: BlockedPeriodCreate) -> BlockedPeriod:
    if payload.start_date < date.today():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="You cannot block dates in the past"
        )

    # Same lock as booking, so a guest cannot book the nights while the host blocks them.
    lock_listing_calendar(db, listing.id)
    start, end = payload.start_date, payload.end_date
    booked = db.scalar(
        select(Booking.id).where(Booking.listing_id == listing.id, overlaps(start, end)).limit(1)
    )
    if booked is not None:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Guests have already booked some of these nights"
        )
    already_blocked = db.scalar(
        select(BlockedPeriod.id)
        .where(BlockedPeriod.listing_id == listing.id, blocked_overlaps(start, end))
        .limit(1)
    )
    if already_blocked is not None:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Some of these nights are already blocked"
        )
    if len(list_blocked_periods(db, listing)) >= MAX_BLOCKED_PERIODS:
        db.rollback()
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Too many blocked periods")

    period = BlockedPeriod(listing_id=listing.id, start_date=start, end_date=end)
    db.add(period)
    db.commit()
    return period


def unblock_dates(db: Session, listing: Listing, period_id: int) -> None:
    period = db.get(BlockedPeriod, period_id)
    if period is None or period.listing_id != listing.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Blocked period not found")
    db.delete(period)
    db.commit()
