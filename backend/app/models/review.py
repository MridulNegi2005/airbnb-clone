from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, CreatedAtMixin

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.user import User

LISTING_RATING_FIELDS = (
    "rating",
    "cleanliness",
    "accuracy",
    "check_in",
    "communication",
    "location",
    "value",
)


def _rating_checks(*fields: str) -> tuple[CheckConstraint, ...]:
    return tuple(
        CheckConstraint(f"{field} BETWEEN 1 AND 5", name=f"{field}_range") for field in fields
    )


class ListingReview(CreatedAtMixin, Base):
    """A guest's review of the stay. One per booking; the author is the booking's guest."""

    __tablename__ = "listing_reviews"
    __table_args__ = _rating_checks(*LISTING_RATING_FIELDS)

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="RESTRICT"), unique=True
    )
    rating: Mapped[int]
    cleanliness: Mapped[int]
    accuracy: Mapped[int]
    check_in: Mapped[int]
    communication: Mapped[int]
    location: Mapped[int]
    value: Mapped[int]
    comment: Mapped[str] = mapped_column(Text)

    booking: Mapped["Booking"] = relationship(back_populates="review")

    @property
    def author(self) -> "User":
        return self.booking.guest


class GuestReview(CreatedAtMixin, Base):
    """A host's review of the guest. One per booking; the author is the listing's host."""

    __tablename__ = "guest_reviews"
    __table_args__ = _rating_checks("rating")

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="RESTRICT"), unique=True
    )
    rating: Mapped[int]
    comment: Mapped[str] = mapped_column(Text)

    booking: Mapped["Booking"] = relationship(back_populates="guest_review")

    @property
    def author(self) -> "User":
        return self.booking.listing.host
