from datetime import datetime
from enum import StrEnum

from sqlalchemy import CheckConstraint, Column, ForeignKey, String, Table, Text, func, select
from sqlalchemy.orm import Mapped, column_property, mapped_column, relationship

from app.database import Base, str_enum
from app.models.booking import Booking
from app.models.review import Review
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
    Column("amenity_id", ForeignKey("amenities.id", ondelete="CASCADE"), primary_key=True),
)

listing_categories = Table(
    "listing_categories",
    Base.metadata,
    Column("listing_id", ForeignKey("listings.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
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

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(String(500))
    position: Mapped[int]


class Listing(Base):
    __tablename__ = "listings"
    __table_args__ = (
        CheckConstraint("price_per_night > 0", name="ck_listing_price_positive"),
        CheckConstraint("cleaning_fee >= 0", name="ck_listing_cleaning_fee_non_negative"),
        CheckConstraint("max_guests >= 1", name="ck_listing_max_guests_positive"),
        CheckConstraint(
            "bedrooms >= 0 AND beds >= 1 AND bathrooms >= 0", name="ck_listing_rooms_valid"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    property_type: Mapped[PropertyType] = mapped_column(str_enum(PropertyType))
    room_type: Mapped[RoomType] = mapped_column(str_enum(RoomType))
    address: Mapped[str] = mapped_column(String(200))
    city: Mapped[str] = mapped_column(String(100), index=True)
    country: Mapped[str] = mapped_column(String(100))
    latitude: Mapped[float | None]
    longitude: Mapped[float | None]
    price_per_night: Mapped[int]
    cleaning_fee: Mapped[int] = mapped_column(default=0)
    max_guests: Mapped[int]
    bedrooms: Mapped[int]
    beds: Mapped[int]
    bathrooms: Mapped[float]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    rating: Mapped[float | None] = column_property(
        select(func.round(func.avg(Review.rating), 2))
        .join(Booking, Booking.id == Review.booking_id)
        .where(Booking.listing_id == id)
        .correlate_except(Review, Booking)
        .scalar_subquery(),
        deferred=True,
        group="ratings",
    )
    review_count: Mapped[int] = column_property(
        select(func.count(Review.id))
        .join(Booking, Booking.id == Review.booking_id)
        .where(Booking.listing_id == id)
        .correlate_except(Review, Booking)
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
