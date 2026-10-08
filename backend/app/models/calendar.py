from datetime import date

from sqlalchemy import CheckConstraint, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, CreatedAtMixin


class BlockedPeriod(CreatedAtMixin, Base):
    """Nights a host closed on the calendar. Like a booking, `end_date` is the first free day."""

    __tablename__ = "blocked_periods"
    __table_args__ = (
        CheckConstraint("end_date > start_date", name="dates_order"),
        Index("ix_blocked_periods_listing_dates", "listing_id", "start_date", "end_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="CASCADE"))
    start_date: Mapped[date]
    end_date: Mapped[date]
