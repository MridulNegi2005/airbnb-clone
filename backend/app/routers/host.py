from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.deps import CurrentUser, DbSession, PathId
from app.models import BlockedPeriod, Booking, Listing
from app.rate_limit import limit_by_user
from app.schemas.booking import HostBookingOut
from app.schemas.common import MAX_ID
from app.schemas.listing import (
    BlockedPeriodCreate,
    BlockedPeriodOut,
    HostListing,
    HostListingDetail,
)
from app.services.bookings import list_host_bookings
from app.services.calendar import block_dates, list_blocked_periods, unblock_dates
from app.services.listings import get_owned_listing, list_host_listings

router = APIRouter(prefix="/host", tags=["host"])

limit_calendar_writes = Depends(limit_by_user(limit=60, window_seconds=3600))


@router.get("/listings", response_model=list[HostListing])
def read_host_listings(user: CurrentUser, db: DbSession) -> list[HostListing]:
    return list_host_listings(db, user)


@router.get("/listings/{listing_id}", response_model=HostListingDetail)
def read_host_listing(listing_id: PathId, user: CurrentUser, db: DbSession) -> Listing:
    return get_owned_listing(db, listing_id, user)


@router.get("/listings/{listing_id}/blocked-dates", response_model=list[BlockedPeriodOut])
def read_blocked_dates(listing_id: PathId, user: CurrentUser, db: DbSession) -> list[BlockedPeriod]:
    return list_blocked_periods(db, get_owned_listing(db, listing_id, user))


@router.post(
    "/listings/{listing_id}/blocked-dates",
    response_model=BlockedPeriodOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[limit_calendar_writes],
)
def create_blocked_dates(
    listing_id: PathId, payload: BlockedPeriodCreate, user: CurrentUser, db: DbSession
) -> BlockedPeriod:
    return block_dates(db, get_owned_listing(db, listing_id, user), payload)


@router.delete(
    "/listings/{listing_id}/blocked-dates/{period_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[limit_calendar_writes],
)
def delete_blocked_dates(
    listing_id: PathId, period_id: PathId, user: CurrentUser, db: DbSession
) -> None:
    unblock_dates(db, get_owned_listing(db, listing_id, user), period_id)


@router.get("/bookings", response_model=list[HostBookingOut])
def read_host_bookings(
    user: CurrentUser,
    db: DbSession,
    listing_id: Annotated[int | None, Query(ge=1, le=MAX_ID)] = None,
) -> list[Booking]:
    return list_host_bookings(db, user, listing_id)
