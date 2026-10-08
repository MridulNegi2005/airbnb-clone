from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.deps import CurrentUser, DbSession, PathId
from app.models import Message
from app.rate_limit import limit_by_user
from app.schemas.message import (
    ConversationStart,
    ConversationSummary,
    MessageCreate,
    MessageOut,
    MessageQuery,
    UnreadCount,
)
from app.services.messages import (
    list_conversations,
    list_messages,
    mark_read,
    send_message,
    start_conversation,
    unread_total,
)

router = APIRouter(prefix="/conversations", tags=["messages"])

limit_new_threads = Depends(limit_by_user(limit=10, window_seconds=3600))
limit_messages = Depends(limit_by_user(limit=30, window_seconds=60))


@router.get("", response_model=list[ConversationSummary])
def read_inbox(user: CurrentUser, db: DbSession) -> list[ConversationSummary]:
    return list_conversations(db, user)


@router.get("/unread-count", response_model=UnreadCount)
def read_unread_count(user: CurrentUser, db: DbSession) -> UnreadCount:
    return UnreadCount(count=unread_total(db, user))


@router.post(
    "",
    response_model=ConversationSummary,
    status_code=status.HTTP_201_CREATED,
    dependencies=[limit_new_threads, limit_messages],
)
def start(payload: ConversationStart, user: CurrentUser, db: DbSession) -> ConversationSummary:
    return start_conversation(db, user, payload.listing_id, payload.body)


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
def read_messages(
    conversation_id: PathId,
    query: Annotated[MessageQuery, Query()],
    user: CurrentUser,
    db: DbSession,
) -> list[Message]:
    return list_messages(db, user, conversation_id, query)


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[limit_messages],
)
def send(
    conversation_id: PathId, payload: MessageCreate, user: CurrentUser, db: DbSession
) -> Message:
    return send_message(db, user, conversation_id, payload.body)


@router.post("/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def read(conversation_id: PathId, user: CurrentUser, db: DbSession) -> None:
    mark_read(db, user, conversation_id)
