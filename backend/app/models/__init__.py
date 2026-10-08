from app.database import Base, engine
from app.models.booking import Booking, BookingStatus
from app.models.listing import Amenity, Category, Listing, ListingImage, PropertyType, RoomType
from app.models.review import RATING_FIELDS, Review
from app.models.user import User
from app.models.wishlist import WishlistItem

__all__ = [
    "RATING_FIELDS",
    "Amenity",
    "Booking",
    "BookingStatus",
    "Category",
    "Listing",
    "ListingImage",
    "PropertyType",
    "Review",
    "RoomType",
    "User",
    "WishlistItem",
    "create_tables",
]


def create_tables() -> None:
    Base.metadata.create_all(engine)
