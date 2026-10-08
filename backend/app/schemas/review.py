from pydantic import BaseModel

from app.schemas.booking import ReviewOut
from app.schemas.common import Page


class RatingSummary(BaseModel):
    count: int
    rating: float | None
    cleanliness: float | None
    accuracy: float | None
    check_in: float | None
    communication: float | None
    location: float | None
    value: float | None


class ReviewPage(Page[ReviewOut]):
    summary: RatingSummary
