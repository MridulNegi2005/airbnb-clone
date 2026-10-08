from datetime import date, datetime
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, str_enum
from app.models.user import User

if TYPE_CHECKING:
    from app.models.listing import Listing
    from app.models.review import Review


class BookingStatus(StrEnum):
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint("check_out > check_in", name="ck_booking_dates_order"),
        CheckConstraint("guests >= 1", name="ck_booking_guests_positive"),
        Index("ix_bookings_listing_dates", "listing_id", "check_in", "check_out"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"))
    guest_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
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
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    listing: Mapped["Listing"] = relationship()
    guest: Mapped[User] = relationship()
    review: Mapped["Review | None"] = relationship(back_populates="booking")

    @property
    def nights(self) -> int:
        return (self.check_out - self.check_in).days

    @property
    def has_review(self) -> bool:
        return self.review is not None
