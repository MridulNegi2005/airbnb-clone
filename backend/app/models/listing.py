from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    String,
    Table,
    Text,
    func,
    select,
    text,
)
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.database import Base, TimestampMixin, str_enum
from app.models.booking import Booking
from app.models.review import ListingReview
from app.models.user import User


class PropertyType(StrEnum):
    HOUSE = "house"
    APARTMENT = "apartment"
    GUESTHOUSE = "guesthouse"
    HOTEL = "hotel"


class RoomType(StrEnum):
    ENTIRE_HOME = "entire_home"
    PRIVATE_ROOM = "private_room"
    SHARED_ROOM = "shared_room"


listing_amenities = Table(
    "listing_amenities",
    Base.metadata,
    Column("listing_id", ForeignKey("listings.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "amenity_id", ForeignKey("amenities.id", ondelete="CASCADE"), primary_key=True, index=True
    ),
)

listing_categories = Table(
    "listing_categories",
    Base.metadata,
    Column("listing_id", ForeignKey("listings.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "category_id",
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    ),
)


class Amenity(Base):
    __tablename__ = "amenities"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    icon: Mapped[str] = mapped_column(String(40))


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True)
    name: Mapped[str] = mapped_column(String(60))
    icon: Mapped[str] = mapped_column(String(40))


class ListingImage(Base):
    __tablename__ = "listing_images"
    __table_args__ = (CheckConstraint("position >= 0", name="position_non_negative"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(500))
    position: Mapped[int]


class Listing(TimestampMixin, Base):
    __tablename__ = "listings"
    __table_args__ = (
        CheckConstraint("price_per_night > 0", name="price_positive"),
        CheckConstraint("cleaning_fee >= 0", name="cleaning_fee_non_negative"),
        CheckConstraint("max_guests BETWEEN 1 AND 16", name="max_guests_range"),
        CheckConstraint("bedrooms >= 0 AND beds >= 1 AND bathrooms >= 0", name="rooms_valid"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_range"),
        CheckConstraint(
            "min_nights BETWEEN 1 AND 365 AND max_nights BETWEEN min_nights AND 365",
            name="nights_range",
        ),
        CheckConstraint("weekly_discount_percent BETWEEN 0 AND 90", name="weekly_discount_range"),
        # Search only ever looks at active listings, so index just those rows.
        Index(
            "ix_listings_active_location",
            "approx_latitude",
            "approx_longitude",
            sqlite_where=Column("archived_at").is_(None),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    property_type: Mapped[PropertyType] = mapped_column(str_enum(PropertyType))
    room_type: Mapped[RoomType] = mapped_column(str_enum(RoomType))
    address: Mapped[str] = mapped_column(String(200))
    neighbourhood: Mapped[str] = mapped_column(String(100))
    city: Mapped[str] = mapped_column(String(100), index=True)
    country: Mapped[str] = mapped_column(String(100))
    latitude: Mapped[float]
    longitude: Mapped[float]
    # The public pin: a random point 150-330 m away, set when the location changes.
    approx_latitude: Mapped[float]
    approx_longitude: Mapped[float]
    google_place_id: Mapped[str | None] = mapped_column(String(255))
    price_per_night: Mapped[int]
    cleaning_fee: Mapped[int] = mapped_column(default=0)
    max_guests: Mapped[int]
    bedrooms: Mapped[int]
    beds: Mapped[int]
    bathrooms: Mapped[float]
    min_nights: Mapped[int] = mapped_column(default=1, server_default=text("1"))
    max_nights: Mapped[int] = mapped_column(default=365, server_default=text("365"))
    weekly_discount_percent: Mapped[int] = mapped_column(default=0, server_default=text("0"))
    archived_at: Mapped[datetime | None]

    rating: Mapped[float | None] = column_property(
        select(func.round(func.avg(ListingReview.rating), 2))
        .join(Booking, Booking.id == ListingReview.booking_id)
        .where(Booking.listing_id == id)
        .correlate_except(ListingReview, Booking)
        .scalar_subquery(),
        deferred=True,
        group="ratings",
    )
    review_count: Mapped[int] = column_property(
        select(func.count(ListingReview.id))
        .join(Booking, Booking.id == ListingReview.booking_id)
        .where(Booking.listing_id == id)
        .correlate_except(ListingReview, Booking)
        .scalar_subquery(),
        deferred=True,
        group="ratings",
    )

    host: Mapped[User] = relationship()
    images: Mapped[list[ListingImage]] = relationship(
        order_by=ListingImage.position, cascade="all, delete-orphan", passive_deletes=True
    )
    amenities: Mapped[list[Amenity]] = relationship(
        secondary=listing_amenities, order_by=Amenity.name
    )
    categories: Mapped[list[Category]] = relationship(
        secondary=listing_categories, order_by=Category.id
    )

    @property
    def image_urls(self) -> list[str]:
        return [image.url for image in self.images]

    @property
    def cover_image_url(self) -> str | None:
        return self.images[0].url if self.images else None

    @property
    def amenity_ids(self) -> list[int]:
        return [amenity.id for amenity in self.amenities]

    @property
    def category_ids(self) -> list[int]:
        return [category.id for category in self.categories]
