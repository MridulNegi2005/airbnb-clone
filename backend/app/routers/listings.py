from datetime import date
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.deps import CurrentUser, DbSession, PathId
from app.models import Listing
from app.schemas.common import Page, PageParams
from app.schemas.listing import (
    BookedRange,
    ListingCard,
    ListingDetail,
    ListingFilters,
    ListingWrite,
    PriceQuote,
    StayParams,
)
from app.schemas.review import ReviewPage
from app.services.availability import booked_ranges
from app.services.bookings import has_upcoming_bookings, quote_stay
from app.services.listings import (
    apply_listing_write,
    get_listing,
    get_owned_listing,
    list_reviews,
    search_listings,
)

router = APIRouter(prefix="/listings", tags=["listings"])


@router.get("", response_model=Page[ListingCard])
def search(filters: Annotated[ListingFilters, Query()], db: DbSession) -> Page[ListingCard]:
    return search_listings(db, filters)


@router.get("/{listing_id}", response_model=ListingDetail)
def read_listing(listing_id: PathId, db: DbSession) -> Listing:
    return get_listing(db, listing_id)


@router.get("/{listing_id}/booked-dates", response_model=list[BookedRange])
def read_booked_dates(listing_id: PathId, db: DbSession) -> list[BookedRange]:
    get_listing(db, listing_id)
    ranges = booked_ranges(db, listing_id, from_date=date.today())
    return [BookedRange.model_validate(booking) for booking in ranges]


@router.get("/{listing_id}/quote", response_model=PriceQuote)
def read_quote(
    listing_id: PathId, stay: Annotated[StayParams, Query()], db: DbSession
) -> PriceQuote:
    return quote_stay(db, get_listing(db, listing_id), stay)


@router.get("/{listing_id}/reviews", response_model=ReviewPage)
def read_reviews(
    listing_id: PathId, params: Annotated[PageParams, Query()], db: DbSession
) -> ReviewPage:
    return list_reviews(db, listing_id, params)


@router.post("", response_model=ListingDetail, status_code=status.HTTP_201_CREATED)
def create_listing(payload: ListingWrite, user: CurrentUser, db: DbSession) -> Listing:
    listing = Listing(host_id=user.id)
    apply_listing_write(db, listing, payload)
    db.add(listing)
    db.commit()
    return get_listing(db, listing.id)


@router.put("/{listing_id}", response_model=ListingDetail)
def update_listing(
    listing_id: PathId, payload: ListingWrite, user: CurrentUser, db: DbSession
) -> Listing:
    listing = get_owned_listing(db, listing_id, user)
    apply_listing_write(db, listing, payload)
    db.commit()
    return listing


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_listing(listing_id: PathId, user: CurrentUser, db: DbSession) -> None:
    listing = get_owned_listing(db, listing_id, user)
    if has_upcoming_bookings(db, listing_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="This listing has upcoming reservations and cannot be deleted",
        )
    db.delete(listing)
    db.commit()
