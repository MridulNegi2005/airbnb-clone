from datetime import date, datetime
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, StringConstraints, model_validator

from app.models import PropertyType, RoomType
from app.schemas.common import Id, ORMModel, PageParams
from app.schemas.user import UserPublic

MAX_NIGHTS = 365
MAX_PRICE = 1_000_000

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class AmenityOut(ORMModel):
    id: int
    name: str
    icon: str


class CategoryOut(ORMModel):
    id: int
    slug: str
    name: str
    icon: str


class ListingCard(ORMModel):
    model_config = ConfigDict(from_attributes=True, validate_by_name=True)

    id: int
    title: str
    neighbourhood: str
    city: str
    country: str
    property_type: PropertyType
    room_type: RoomType
    price_per_night: int
    # Public coordinates are shifted a few hundred metres; the exact spot is shared after booking.
    latitude: float = Field(validation_alias="approx_latitude")
    longitude: float = Field(validation_alias="approx_longitude")
    image_urls: list[str]
    rating: float | None
    review_count: int


class HostListing(ListingCard):
    upcoming_booking_count: int


class ListingDetail(ListingCard):
    description: str
    cleaning_fee: int
    max_guests: int
    bedrooms: int
    beds: int
    bathrooms: float
    amenities: list[AmenityOut]
    categories: list[CategoryOut]
    host: UserPublic
    created_at: datetime


class ListingWrite(BaseModel):
    title: Annotated[Text, StringConstraints(max_length=120)]
    description: Annotated[Text, StringConstraints(max_length=5000)]
    property_type: PropertyType
    room_type: RoomType
    address: Annotated[Text, StringConstraints(max_length=200)]
    neighbourhood: Annotated[Text, StringConstraints(max_length=100)]
    city: Annotated[Text, StringConstraints(max_length=100)]
    country: Annotated[Text, StringConstraints(max_length=100)]
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    google_place_id: Annotated[str, StringConstraints(max_length=255)] | None = None
    price_per_night: int = Field(gt=0, le=MAX_PRICE)
    cleaning_fee: int = Field(default=0, ge=0, le=100_000)
    max_guests: int = Field(ge=1, le=16)
    bedrooms: int = Field(ge=0, le=50)
    beds: int = Field(ge=1, le=50)
    bathrooms: float = Field(ge=0, le=50, multiple_of=0.5)
    image_urls: list[HttpUrl] = Field(min_length=1, max_length=20)
    amenity_ids: list[Id] = Field(default_factory=list, max_length=100)
    category_ids: list[Id] = Field(default_factory=list, max_length=20)


class HostListingDetail(ORMModel):
    """Everything the owner needs to edit a listing, including the exact location."""

    id: int
    title: str
    description: str
    property_type: PropertyType
    room_type: RoomType
    address: str
    neighbourhood: str
    city: str
    country: str
    latitude: float
    longitude: float
    google_place_id: str | None
    price_per_night: int
    cleaning_fee: int
    max_guests: int
    bedrooms: int
    beds: int
    bathrooms: float
    image_urls: list[str]
    amenity_ids: list[int]
    category_ids: list[int]


class StayParams(BaseModel):
    check_in: date
    check_out: date
    guests: int = Field(default=1, ge=1, le=16)

    @property
    def nights(self) -> int:
        return (self.check_out - self.check_in).days

    @model_validator(mode="after")
    def check_dates(self) -> Self:
        if not 1 <= self.nights <= MAX_NIGHTS:
            raise ValueError(f"A stay must be between 1 and {MAX_NIGHTS} nights")
        return self


class MapBounds(BaseModel):
    south: float
    west: float
    north: float
    east: float


class ListingFilters(PageParams):
    location: str | None = Field(default=None, max_length=100)
    check_in: date | None = None
    check_out: date | None = None
    guests: int | None = Field(default=None, ge=1, le=16)
    min_price: int | None = Field(default=None, ge=0, le=MAX_PRICE)
    max_price: int | None = Field(default=None, ge=0, le=MAX_PRICE)
    property_type: list[PropertyType] = Field(default_factory=list)
    room_type: RoomType | None = None
    amenity: list[Id] = Field(default_factory=list, max_length=50)
    category: str | None = Field(default=None, max_length=40)
    min_bedrooms: int | None = Field(default=None, ge=0, le=50)
    min_beds: int | None = Field(default=None, ge=0, le=50)
    min_bathrooms: float | None = Field(default=None, ge=0, le=50)
    sw_lat: float | None = Field(default=None, ge=-90, le=90)
    sw_lng: float | None = Field(default=None, ge=-180, le=180)
    ne_lat: float | None = Field(default=None, ge=-90, le=90)
    ne_lng: float | None = Field(default=None, ge=-180, le=180)

    @property
    def bounds(self) -> MapBounds | None:
        corners = (self.sw_lat, self.sw_lng, self.ne_lat, self.ne_lng)
        if any(value is None for value in corners):
            return None
        south, west, north, east = corners
        return MapBounds.model_validate(
            {"south": south, "west": west, "north": north, "east": east}
        )

    @model_validator(mode="after")
    def check_ranges(self) -> Self:
        if (self.check_in is None) != (self.check_out is None):
            raise ValueError("check_in and check_out must be provided together")
        if self.check_in and self.check_out and self.check_out <= self.check_in:
            raise ValueError("check_out must be after check_in")
        if (
            self.min_price is not None
            and self.max_price is not None
            and self.min_price > self.max_price
        ):
            raise ValueError("min_price cannot be greater than max_price")
        corners = (self.sw_lat, self.sw_lng, self.ne_lat, self.ne_lng)
        if self.bounds is None and any(value is not None for value in corners):
            raise ValueError("sw_lat, sw_lng, ne_lat and ne_lng must be provided together")
        bounds = self.bounds
        if bounds and (bounds.south > bounds.north or bounds.west > bounds.east):
            raise ValueError("The south-west corner must be south and west of the north-east")
        return self


class BookedRange(ORMModel):
    check_in: date
    check_out: date


class PriceQuote(BaseModel):
    nights: int
    nightly_rate: int
    subtotal: int
    cleaning_fee: int
    service_fee: int
    total: int
    available: bool
