from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.booking import Booking
    from app.models.user import User

RATING_FIELDS = (
    "rating",
    "cleanliness",
    "accuracy",
    "check_in",
    "communication",
    "location",
    "value",
)


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = tuple(
        CheckConstraint(f"{field} BETWEEN 1 AND 5", name=f"ck_review_{field}_range")
        for field in RATING_FIELDS
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(
        ForeignKey("bookings.id", ondelete="CASCADE"), unique=True
    )
    rating: Mapped[int]
    cleanliness: Mapped[int]
    accuracy: Mapped[int]
    check_in: Mapped[int]
    communication: Mapped[int]
    location: Mapped[int]
    value: Mapped[int]
    comment: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    booking: Mapped["Booking"] = relationship(back_populates="review")

    @property
    def author(self) -> "User":
        return self.booking.guest
