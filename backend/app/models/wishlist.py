from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, CreatedAtMixin, TimestampMixin
from app.models.listing import Listing


class WishlistItem(CreatedAtMixin, Base):
    __tablename__ = "wishlist_items"

    wishlist_id: Mapped[int] = mapped_column(
        ForeignKey("wishlists.id", ondelete="CASCADE"), primary_key=True
    )
    listing_id: Mapped[int] = mapped_column(
        ForeignKey("listings.id", ondelete="CASCADE"), primary_key=True, index=True
    )

    listing: Mapped[Listing] = relationship()


class Wishlist(TimestampMixin, Base):
    __tablename__ = "wishlists"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(50))

    items: Mapped[list[WishlistItem]] = relationship(
        order_by=WishlistItem.created_at.desc(),
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
