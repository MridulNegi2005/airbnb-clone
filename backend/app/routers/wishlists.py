from fastapi import APIRouter, Depends, status

from app.deps import CurrentUser, DbSession, PathId
from app.rate_limit import limit_by_user
from app.schemas.wishlist import SavedListing, WishlistDetail, WishlistSummary, WishlistWrite
from app.services.wishlists import (
    add_listing,
    create_wishlist,
    delete_wishlist,
    get_wishlist,
    list_wishlists,
    remove_listing,
    rename_wishlist,
    saved_listings,
)

router = APIRouter(prefix="/wishlists", tags=["wishlists"])

limit_wishlist_writes = Depends(limit_by_user(limit=120, window_seconds=3600))


@router.get("", response_model=list[WishlistSummary])
def read_wishlists(user: CurrentUser, db: DbSession) -> list[WishlistSummary]:
    return list_wishlists(db, user)


@router.get("/saved", response_model=list[SavedListing])
def read_saved(user: CurrentUser, db: DbSession) -> list[SavedListing]:
    return saved_listings(db, user)


@router.post(
    "",
    response_model=WishlistDetail,
    status_code=status.HTTP_201_CREATED,
    dependencies=[limit_wishlist_writes],
)
def create(payload: WishlistWrite, user: CurrentUser, db: DbSession) -> WishlistDetail:
    wishlist = create_wishlist(db, user, payload.name)
    return WishlistDetail(id=wishlist.id, name=wishlist.name, listings=[])


@router.get("/{wishlist_id}", response_model=WishlistDetail)
def read_wishlist(wishlist_id: PathId, user: CurrentUser, db: DbSession) -> WishlistDetail:
    return get_wishlist(db, user, wishlist_id)


@router.patch("/{wishlist_id}", response_model=WishlistDetail, dependencies=[limit_wishlist_writes])
def rename(
    wishlist_id: PathId, payload: WishlistWrite, user: CurrentUser, db: DbSession
) -> WishlistDetail:
    rename_wishlist(db, user, wishlist_id, payload.name)
    return get_wishlist(db, user, wishlist_id)


@router.delete(
    "/{wishlist_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[limit_wishlist_writes],
)
def delete(wishlist_id: PathId, user: CurrentUser, db: DbSession) -> None:
    delete_wishlist(db, user, wishlist_id)


@router.put(
    "/{wishlist_id}/listings/{listing_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[limit_wishlist_writes],
)
def save(wishlist_id: PathId, listing_id: PathId, user: CurrentUser, db: DbSession) -> None:
    add_listing(db, user, wishlist_id, listing_id)


@router.delete(
    "/{wishlist_id}/listings/{listing_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[limit_wishlist_writes],
)
def unsave(wishlist_id: PathId, listing_id: PathId, user: CurrentUser, db: DbSession) -> None:
    remove_listing(db, user, wishlist_id, listing_id)
