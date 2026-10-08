from datetime import date, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, TimestampMixin, str_enum
from app.models.user import User

if TYPE_CHECKING:
    from app.models.listing import Listing
    from app.models.review import GuestReview, ListingReview


class BookingStatus(StrEnum):
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class Booking(TimestampMixin, Base):
    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint("check_out > check_in", name="dates_order"),
        CheckConstraint("guests BETWEEN 1 AND 16", name="guests_range"),
        CheckConstraint(
            "nightly_rate > 0 AND cleaning_fee >= 0 AND service_fee >= 0 AND total > 0",
            name="amounts_valid",
        ),
        CheckConstraint(
            "(status = 'cancelled') = (cancelled_at IS NOT NULL)", name="cancelled_at_matches"
        ),
        Index("ix_bookings_listing_dates", "listing_id", "check_in", "check_out"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Bookings are financial records: block deleting the listing or guest they point to.
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="RESTRICT"))
    guest_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    check_in: Mapped[date]
    check_out: Mapped[date]
    guests: Mapped[int]
    nightly_rate: Mapped[int]
    cleaning_fee: Mapped[int]
    service_fee: Mapped[int]
    total: Mapped[int]
    status: Mapped[BookingStatus] = mapped_column(
        str_enum(BookingStatus), default=BookingStatus.CONFIRMED
    )
    cancelled_at: Mapped[datetime | None]

    listing: Mapped["Listing"] = relationship()
    guest: Mapped[User] = relationship()
    review: Mapped["ListingReview | None"] = relationship(back_populates="booking")
    guest_review: Mapped["GuestReview | None"] = relationship(back_populates="booking")

    @property
    def nights(self) -> int:
        return (self.check_out - self.check_in).days

    @property
    def subtotal(self) -> int:
        return self.nightly_rate * self.nights

    @property
    def has_review(self) -> bool:
        return self.review is not None

    @property
    def has_guest_review(self) -> bool:
        return self.guest_review is not None
