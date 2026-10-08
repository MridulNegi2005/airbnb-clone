from datetime import date, datetime
from typing import Annotated

from pydantic import Field, StringConstraints

from app.models import BookingStatus, PropertyType, RoomType
from app.schemas.common import Id, ORMModel
from app.schemas.listing import StayParams
from app.schemas.user import UserPublic

Comment = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]
Stars = Annotated[int, Field(ge=1, le=5)]


class BookingCreate(StayParams):
    listing_id: Id


class BookingListing(ORMModel):
    """Listing details for people on the booking; includes the exact address and location."""

    id: int
    title: str
    address: str
    neighbourhood: str
    city: str
    country: str
    latitude: float
    longitude: float
    property_type: PropertyType
    room_type: RoomType
    cover_image_url: str | None
    host: UserPublic


class BookingOut(ORMModel):
    id: int
    check_in: date
    check_out: date
    nights: int
    guests: int
    nightly_rate: int
    subtotal: int
    discount: int
    cleaning_fee: int
    service_fee: int
    total: int
    status: BookingStatus
    cancelled_at: datetime | None
    has_review: bool
    has_guest_review: bool
    created_at: datetime
    listing: BookingListing


class HostBookingOut(BookingOut):
    guest: UserPublic


class ListingReviewCreate(ORMModel):
    rating: Stars
    cleanliness: Stars
    accuracy: Stars
    check_in: Stars
    communication: Stars
    location: Stars
    value: Stars
    comment: Comment


class ListingReviewOut(ListingReviewCreate):
    id: int
    created_at: datetime
    author: UserPublic


class GuestReviewCreate(ORMModel):
    rating: Stars
    comment: Comment


class GuestReviewOut(GuestReviewCreate):
    id: int
    created_at: datetime
    author: UserPublic
