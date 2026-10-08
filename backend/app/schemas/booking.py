from datetime import date, datetime

from pydantic import Field

from app.models import BookingStatus, PropertyType, RoomType
from app.schemas.common import Id, ORMModel
from app.schemas.listing import StayParams
from app.schemas.user import UserPublic


class BookingCreate(StayParams):
    listing_id: Id


class BookingListing(ORMModel):
    id: int
    title: str
    city: str
    country: str
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
    cleaning_fee: int
    service_fee: int
    total: int
    status: BookingStatus
    has_review: bool
    created_at: datetime
    listing: BookingListing


class HostBookingOut(BookingOut):
    guest: UserPublic


class ReviewCreate(ORMModel):
    rating: int = Field(ge=1, le=5)
    cleanliness: int = Field(ge=1, le=5)
    accuracy: int = Field(ge=1, le=5)
    check_in: int = Field(ge=1, le=5)
    communication: int = Field(ge=1, le=5)
    location: int = Field(ge=1, le=5)
    value: int = Field(ge=1, le=5)
    comment: str = Field(min_length=1, max_length=2000)


class ReviewOut(ReviewCreate):
    id: int
    created_at: datetime
    author: UserPublic
