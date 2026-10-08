from datetime import UTC, datetime
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, Select, case, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import Conversation, Listing, Message, User
from app.schemas.message import (
    ConversationListing,
    ConversationSummary,
    MessageOut,
    MessageQuery,
)
from app.schemas.user import UserPublic
from app.services.listings import get_listing

Role = Literal["guest", "host"]


def _conversations() -> Select[tuple[Conversation]]:
    return select(Conversation).options(
        joinedload(Conversation.guest),
        joinedload(Conversation.listing).options(
            joinedload(Listing.host), selectinload(Listing.images)
        ),
    )


def _involving(user: User) -> ColumnElement[bool]:
    return or_(Conversation.guest_id == user.id, Listing.host_id == user.id)


def _role(conversation: Conversation, user: User) -> Role:
    return "guest" if conversation.guest_id == user.id else "host"


def _last_read_id(user: User) -> ColumnElement[int]:
    return case(
        (Conversation.guest_id == user.id, Conversation.guest_last_read_message_id),
        else_=Conversation.host_last_read_message_id,
    )


def _unread_messages(user: User) -> Select[tuple[int, int]]:
    return (
        select(Message.conversation_id, func.count(Message.id))
        .join(Conversation, Conversation.id == Message.conversation_id)
        .join(Listing, Listing.id == Conversation.listing_id)
        .where(_involving(user), Message.sender_id != user.id, Message.id > _last_read_id(user))
        .group_by(Message.conversation_id)
    )


def list_conversations(db: Session, user: User) -> list[ConversationSummary]:
    conversations = db.scalars(
        _conversations()
        .join(Listing, Listing.id == Conversation.listing_id)
        .where(_involving(user))
        .order_by(Conversation.last_message_at.desc())
    ).all()
    ids = [conversation.id for conversation in conversations]
    latest_ids = (
        select(func.max(Message.id))
        .where(Message.conversation_id.in_(ids))
        .group_by(Message.conversation_id)
    )
    latest = {
        message.conversation_id: message
        for message in db.scalars(select(Message).where(Message.id.in_(latest_ids)))
    }
    unread = {
        conversation_id: count for conversation_id, count in db.execute(_unread_messages(user))
    }
    return [
        _summary(conversation, user, latest.get(conversation.id), unread.get(conversation.id, 0))
        for conversation in conversations
    ]


def unread_total(db: Session, user: User) -> int:
    return sum(count for _, count in db.execute(_unread_messages(user)))


def start_conversation(db: Session, guest: User, listing_id: int, body: str) -> ConversationSummary:
    listing = get_listing(db, listing_id)
    if listing.host_id == guest.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You cannot message yourself")

    conversation = _find(db, listing_id, guest)
    if conversation is None:
        conversation = Conversation(
            listing_id=listing.id, guest_id=guest.id, last_message_at=datetime.now(UTC)
        )
        db.add(conversation)
        try:
            db.flush()
        except IntegrityError:
            # Another request opened the same thread; reuse it.
            db.rollback()
            conversation = _find(db, listing_id, guest)
            assert conversation is not None
    message = _append(db, conversation, guest, body)
    db.commit()
    return _summary(get_conversation(db, guest, conversation.id), guest, message, 0)


def _find(db: Session, listing_id: int, guest: User) -> Conversation | None:
    return db.scalar(
        _conversations().where(
            Conversation.listing_id == listing_id, Conversation.guest_id == guest.id
        )
    )


def get_conversation(db: Session, user: User, conversation_id: int) -> Conversation:
    conversation = db.scalar(_conversations().where(Conversation.id == conversation_id))
    participants = (conversation.guest_id, conversation.listing.host_id) if conversation else ()
    if conversation is None or user.id not in participants:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return conversation


def list_messages(
    db: Session, user: User, conversation_id: int, query: MessageQuery
) -> list[Message]:
    get_conversation(db, user, conversation_id)
    stmt = select(Message).where(Message.conversation_id == conversation_id)
    if query.after_id is not None:
        # Polling for new messages: oldest first, starting after the last one the client has.
        return list(
            db.scalars(
                stmt.where(Message.id > query.after_id).order_by(Message.id).limit(query.limit)
            )
        )
    if query.before_id is not None:
        stmt = stmt.where(Message.id < query.before_id)
    newest_first = db.scalars(stmt.order_by(Message.id.desc()).limit(query.limit)).all()
    return list(reversed(newest_first))


def send_message(db: Session, user: User, conversation_id: int, body: str) -> Message:
    conversation = get_conversation(db, user, conversation_id)
    message = _append(db, conversation, user, body)
    db.commit()
    return message


def mark_read(db: Session, user: User, conversation_id: int) -> None:
    conversation = get_conversation(db, user, conversation_id)
    latest = db.scalar(
        select(func.max(Message.id)).where(Message.conversation_id == conversation.id)
    )
    _set_last_read(conversation, user, latest or 0)
    db.commit()


def _append(db: Session, conversation: Conversation, sender: User, body: str) -> Message:
    message = Message(conversation_id=conversation.id, sender_id=sender.id, body=body)
    db.add(message)
    db.flush()
    conversation.last_message_at = datetime.now(UTC)
    _set_last_read(conversation, sender, message.id)
    return message


def _set_last_read(conversation: Conversation, user: User, message_id: int) -> None:
    if _role(conversation, user) == "guest":
        conversation.guest_last_read_message_id = message_id
    else:
        conversation.host_last_read_message_id = message_id


def _summary(
    conversation: Conversation, user: User, last_message: Message | None, unread_count: int
) -> ConversationSummary:
    role = _role(conversation, user)
    other = conversation.listing.host if role == "guest" else conversation.guest
    return ConversationSummary(
        id=conversation.id,
        role=role,
        listing=ConversationListing.model_validate(conversation.listing),
        other_user=UserPublic.model_validate(other),
        last_message=MessageOut.model_validate(last_message) if last_message else None,
        last_message_at=conversation.last_message_at,
        unread_count=unread_count,
    )
