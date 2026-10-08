from fastapi import APIRouter, status
from sqlalchemy.exc import IntegrityError

from app.deps import CurrentUser, DbSession, PathId
from app.models import Listing, WishlistItem
from app.schemas.listing import ListingCard
from app.services.listings import card_query, get_listing

router = APIRouter(prefix="/wishlist", tags=["wishlist"])


@router.get("", response_model=list[ListingCard])
def read_wishlist(user: CurrentUser, db: DbSession) -> list[Listing]:
    stmt = (
        card_query()
        .join(WishlistItem, WishlistItem.listing_id == Listing.id)
        .where(WishlistItem.user_id == user.id)
        .order_by(WishlistItem.created_at.desc())
    )
    return list(db.scalars(stmt))


@router.put("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def save(listing_id: PathId, user: CurrentUser, db: DbSession) -> None:
    get_listing(db, listing_id)
    if db.get(WishlistItem, (user.id, listing_id)) is None:
        db.add(WishlistItem(user_id=user.id, listing_id=listing_id))
        try:
            db.commit()
        except IntegrityError:
            # A concurrent request saved it first; the end state is the same.
            db.rollback()


@router.delete("/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def unsave(listing_id: PathId, user: CurrentUser, db: DbSession) -> None:
    item = db.get(WishlistItem, (user.id, listing_id))
    if item is not None:
        db.delete(item)
        db.commit()
