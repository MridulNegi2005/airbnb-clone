from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

from app.schemas.common import MAX_ID, Id, ORMModel
from app.schemas.user import UserPublic

Body = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class ConversationStart(BaseModel):
    listing_id: Id
    body: Body


class MessageCreate(BaseModel):
    body: Body


class MessageOut(ORMModel):
    id: int
    sender_id: int
    body: str
    created_at: datetime


class ConversationListing(ORMModel):
    id: int
    title: str
    cover_image_url: str | None


class ConversationSummary(BaseModel):
    id: int
    role: Literal["guest", "host"]
    listing: ConversationListing
    other_user: UserPublic
    last_message: MessageOut | None
    last_message_at: datetime
    unread_count: int


class MessageQuery(BaseModel):
    after_id: int | None = Field(default=None, ge=0, le=MAX_ID)
    before_id: int | None = Field(default=None, ge=1, le=MAX_ID)
    limit: int = Field(default=50, ge=1, le=100)


class UnreadCount(BaseModel):
    count: int
