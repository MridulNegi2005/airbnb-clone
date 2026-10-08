from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.booking import ListingReviewOut
from app.schemas.common import ORMModel, Page, PageParams
from app.schemas.user import UserPublic


class RatingSummary(BaseModel):
    count: int
    rating: float | None
    cleanliness: float | None
    accuracy: float | None
    check_in: float | None
    communication: float | None
    location: float | None
    value: float | None


class ReviewPage(Page[ListingReviewOut]):
    summary: RatingSummary


class ReviewedListing(ORMModel):
    id: int
    title: str


class ProfileReview(BaseModel):
    """A review shown on a profile: written by a guest about a host, or by a host about a guest."""

    id: int
    rating: int
    comment: str
    created_at: datetime
    author: UserPublic
    listing: ReviewedListing


class ProfileReviewQuery(PageParams):
    about: Literal["host", "guest"] = Field(
        description="host: reviews guests wrote about the user's listings; "
        "guest: reviews hosts wrote about the user"
    )
