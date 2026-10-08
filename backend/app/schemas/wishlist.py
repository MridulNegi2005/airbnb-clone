from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, StringConstraints

from app.schemas.listing import ListingCard

WishlistName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]


class WishlistWrite(BaseModel):
    name: WishlistName


class WishlistSummary(BaseModel):
    id: int
    name: str
    item_count: int
    cover_image_url: str | None
    updated_at: datetime


class WishlistDetail(BaseModel):
    id: int
    name: str
    listings: list[ListingCard]


class SavedListing(BaseModel):
    wishlist_id: int
    listing_id: int
