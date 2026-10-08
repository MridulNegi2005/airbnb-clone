from fastapi import APIRouter

from app.deps import CurrentUser, DbSession
from app.models import Booking, Listing
from app.schemas.booking import HostBookingOut
from app.schemas.listing import HostListing, ListingCard
from app.services.bookings import list_host_bookings, upcoming_booking_counts
from app.services.listings import card_query

router = APIRouter(prefix="/host", tags=["host"])


@router.get("/listings", response_model=list[HostListing])
def read_host_listings(user: CurrentUser, db: DbSession) -> list[HostListing]:
    listings = db.scalars(
        card_query().where(Listing.host_id == user.id).order_by(Listing.created_at.desc())
    )
    counts = upcoming_booking_counts(db, user)
    return [
        HostListing(
            **ListingCard.model_validate(listing).model_dump(),
            upcoming_booking_count=counts.get(listing.id, 0),
        )
        for listing in listings
    ]


@router.get("/bookings", response_model=list[HostBookingOut])
def read_host_bookings(
    user: CurrentUser, db: DbSession, listing_id: int | None = None
) -> list[Booking]:
    return list_host_bookings(db, user, listing_id)
