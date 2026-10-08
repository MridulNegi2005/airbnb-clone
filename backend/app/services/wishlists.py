from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload, undefer_group

from app.models import Listing, User, Wishlist, WishlistItem
from app.schemas.listing import ListingCard
from app.schemas.wishlist import SavedListing, WishlistDetail, WishlistSummary
from app.services.listings import get_listing

MAX_WISHLISTS_PER_USER = 50

_ITEMS_WITH_LISTINGS = (
    selectinload(Wishlist.items)
    .selectinload(WishlistItem.listing)
    .options(selectinload(Listing.images), undefer_group("ratings"))
)


def list_wishlists(db: Session, user: User) -> list[WishlistSummary]:
    wishlists = db.scalars(
        select(Wishlist)
        .where(Wishlist.user_id == user.id)
        .options(_ITEMS_WITH_LISTINGS)
        .order_by(Wishlist.updated_at.desc(), Wishlist.id.desc())
    )
    summaries = []
    for wishlist in wishlists:
        items = _active_items(wishlist)
        summaries.append(
            WishlistSummary(
                id=wishlist.id,
                name=wishlist.name,
                item_count=len(items),
                cover_image_url=items[0].listing.cover_image_url if items else None,
                updated_at=wishlist.updated_at,
            )
        )
    return summaries


def get_wishlist(db: Session, user: User, wishlist_id: int) -> WishlistDetail:
    wishlist = _get_owned(db, user, wishlist_id)
    listings = [item.listing for item in _active_items(wishlist)]
    return WishlistDetail(
        id=wishlist.id,
        name=wishlist.name,
        listings=[ListingCard.model_validate(listing) for listing in listings],
    )


def saved_listings(db: Session, user: User) -> list[SavedListing]:
    rows = db.execute(
        select(WishlistItem.wishlist_id, WishlistItem.listing_id)
        .join(Wishlist, Wishlist.id == WishlistItem.wishlist_id)
        .where(Wishlist.user_id == user.id)
    )
    return [SavedListing(wishlist_id=w, listing_id=listing) for w, listing in rows]


def create_wishlist(db: Session, user: User, name: str) -> Wishlist:
    count = db.scalar(select(func.count(Wishlist.id)).where(Wishlist.user_id == user.id)) or 0
    if count >= MAX_WISHLISTS_PER_USER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You have too many wishlists")
    wishlist = Wishlist(user_id=user.id, name=name)
    db.add(wishlist)
    _commit_unique_name(db)
    return wishlist


def rename_wishlist(db: Session, user: User, wishlist_id: int, name: str) -> Wishlist:
    wishlist = _get_owned(db, user, wishlist_id)
    wishlist.name = name
    _commit_unique_name(db)
    return wishlist


def delete_wishlist(db: Session, user: User, wishlist_id: int) -> None:
    db.delete(_get_owned(db, user, wishlist_id))
    db.commit()


def add_listing(db: Session, user: User, wishlist_id: int, listing_id: int) -> None:
    wishlist = _get_owned(db, user, wishlist_id)
    get_listing(db, listing_id)
    if db.get(WishlistItem, (wishlist.id, listing_id)) is not None:
        return
    db.add(WishlistItem(wishlist_id=wishlist.id, listing_id=listing_id))
    _touch(wishlist)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent request saved it first; the end state is the same.
        db.rollback()


def remove_listing(db: Session, user: User, wishlist_id: int, listing_id: int) -> None:
    wishlist = _get_owned(db, user, wishlist_id)
    item = db.get(WishlistItem, (wishlist.id, listing_id))
    if item is not None:
        db.delete(item)
        _touch(wishlist)
        db.commit()


def _get_owned(db: Session, user: User, wishlist_id: int) -> Wishlist:
    wishlist = db.scalar(
        select(Wishlist).where(Wishlist.id == wishlist_id).options(_ITEMS_WITH_LISTINGS)
    )
    if wishlist is None or wishlist.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Wishlist not found")
    return wishlist


def _active_items(wishlist: Wishlist) -> list[WishlistItem]:
    return [item for item in wishlist.items if item.listing.archived_at is None]


def _touch(wishlist: Wishlist) -> None:
    # Adding or removing items does not change the row itself, so bump it explicitly.
    wishlist.updated_at = datetime.now(UTC)


def _commit_unique_name(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="You already have a wishlist with this name"
        ) from None
