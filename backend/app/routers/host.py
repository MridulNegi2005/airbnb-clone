from typing import Annotated

from fastapi import APIRouter, Query

from app.deps import CurrentUser, DbSession, PathId
from app.models import Booking, Listing
from app.schemas.booking import HostBookingOut
from app.schemas.common import MAX_ID
from app.schemas.listing import HostListing, HostListingDetail
from app.services.bookings import list_host_bookings
from app.services.listings import get_owned_listing, list_host_listings

router = APIRouter(prefix="/host", tags=["host"])


@router.get("/listings", response_model=list[HostListing])
def read_host_listings(user: CurrentUser, db: DbSession) -> list[HostListing]:
    return list_host_listings(db, user)


@router.get("/listings/{listing_id}", response_model=HostListingDetail)
def read_host_listing(listing_id: PathId, user: CurrentUser, db: DbSession) -> Listing:
    return get_owned_listing(db, listing_id, user)


@router.get("/bookings", response_model=list[HostBookingOut])
def read_host_bookings(
    user: CurrentUser,
    db: DbSession,
    listing_id: Annotated[int | None, Query(ge=1, le=MAX_ID)] = None,
) -> list[Booking]:
    return list_host_bookings(db, user, listing_id)
