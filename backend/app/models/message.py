from datetime import datetime

from sqlalchemy import ForeignKey, Index, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, CreatedAtMixin
from app.models.listing import Listing
from app.models.user import User


class Message(CreatedAtMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_conversation_id_id", "conversation_id", "id"),
        # Never reuse ids: read tracking relies on ids only ever growing.
        {"sqlite_autoincrement": True},
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    body: Mapped[str] = mapped_column(Text)

    sender: Mapped[User] = relationship()


class Conversation(CreatedAtMixin, Base):
    """One thread per guest and listing, like Airbnb; the host comes from the listing."""

    __tablename__ = "conversations"
    __table_args__ = (UniqueConstraint("listing_id", "guest_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    listing_id: Mapped[int] = mapped_column(ForeignKey("listings.id", ondelete="RESTRICT"))
    guest_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    # Denormalised so the inbox can sort without scanning every message.
    last_message_at: Mapped[datetime] = mapped_column(index=True)
    # Message ids grow monotonically, so "unread" is simply id > last read id.
    guest_last_read_message_id: Mapped[int] = mapped_column(default=0)
    host_last_read_message_id: Mapped[int] = mapped_column(default=0)

    listing: Mapped[Listing] = relationship()
    guest: Mapped[User] = relationship()
