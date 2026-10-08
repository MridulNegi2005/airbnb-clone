from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload, undefer_group

from app.database import Base
from app.models import (
    RATING_FIELDS,
    Amenity,
    Booking,
    Category,
    Listing,
    ListingImage,
    Review,
    User,
)
from app.schemas.booking import ReviewOut
from app.schemas.common import Page, PageParams
from app.schemas.listing import ListingCard, ListingFilters, ListingWrite
from app.schemas.review import RatingSummary, ReviewPage
from app.services.availability import overlaps

_RELATION_FIELDS = {"image_urls", "amenity_ids", "category_ids"}


def card_query() -> Select[tuple[Listing]]:
    return select(Listing).options(selectinload(Listing.images), undefer_group("ratings"))


def search_listings(db: Session, filters: ListingFilters) -> Page[ListingCard]:
    conditions = _filter_conditions(filters)
    total = db.scalar(select(func.count(Listing.id)).where(*conditions))
    listings = db.scalars(
        card_query()
        .where(*conditions)
        .order_by(Listing.id)
        .offset(filters.offset)
        .limit(filters.page_size)
    ).all()
    items = [ListingCard.model_validate(listing) for listing in listings]
    return Page[ListingCard].build(items, total or 0, filters)


def _filter_conditions(filters: ListingFilters) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []

    if filters.location:
        # "Goa, India" matches when every comma-separated part hits a city, country or address.
        for part in filter(None, (p.strip() for p in filters.location.split(","))):
            conditions.append(
                or_(
                    Listing.city.icontains(part, autoescape=True),
                    Listing.country.icontains(part, autoescape=True),
                    Listing.address.icontains(part, autoescape=True),
                )
            )
    if filters.check_in and filters.check_out:
        booked = select(Booking.listing_id).where(overlaps(filters.check_in, filters.check_out))
        conditions.append(Listing.id.not_in(booked))
    if filters.guests:
        conditions.append(Listing.max_guests >= filters.guests)
    if filters.min_price is not None:
        conditions.append(Listing.price_per_night >= filters.min_price)
    if filters.max_price is not None:
        conditions.append(Listing.price_per_night <= filters.max_price)
    if filters.property_type:
        conditions.append(Listing.property_type.in_(filters.property_type))
    if filters.room_type:
        conditions.append(Listing.room_type == filters.room_type)
    for amenity_id in set(filters.amenity):
        conditions.append(Listing.amenities.any(Amenity.id == amenity_id))
    if filters.category:
        conditions.append(Listing.categories.any(Category.slug == filters.category))
    if filters.min_bedrooms is not None:
        conditions.append(Listing.bedrooms >= filters.min_bedrooms)
    if filters.min_beds is not None:
        conditions.append(Listing.beds >= filters.min_beds)
    if filters.min_bathrooms is not None:
        conditions.append(Listing.bathrooms >= filters.min_bathrooms)

    return conditions


def get_listing(db: Session, listing_id: int) -> Listing:
    listing = db.scalar(
        card_query()
        .where(Listing.id == listing_id)
        .options(
            joinedload(Listing.host),
            selectinload(Listing.amenities),
            selectinload(Listing.categories),
        )
    )
    if listing is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Listing not found")
    return listing


def get_owned_listing(db: Session, listing_id: int, user: User) -> Listing:
    listing = get_listing(db, listing_id)
    if listing.host_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You do not own this listing")
    return listing


def apply_listing_write(db: Session, listing: Listing, payload: ListingWrite) -> None:
    for field, value in payload.model_dump(exclude=_RELATION_FIELDS).items():
        setattr(listing, field, value)
    listing.images = [
        ListingImage(url=str(url), position=position)
        for position, url in enumerate(payload.image_urls)
    ]
    listing.amenities = _load_by_ids(db, Amenity, payload.amenity_ids)
    listing.categories = _load_by_ids(db, Category, payload.category_ids)


def _load_by_ids[M: Base](db: Session, model: type[M], ids: list[int]) -> list[M]:
    unique_ids = set(ids)
    rows = list(db.scalars(select(model).where(model.id.in_(unique_ids))))
    if len(rows) != len(unique_ids):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unknown {model.__tablename__} id in request",
        )
    return rows


def list_reviews(db: Session, listing_id: int, params: PageParams) -> ReviewPage:
    get_listing(db, listing_id)
    of_listing = and_(Booking.id == Review.booking_id, Booking.listing_id == listing_id)
    total = db.scalar(select(func.count(Review.id)).join(Booking, of_listing))
    reviews = db.scalars(
        select(Review)
        .join(Booking, of_listing)
        .options(selectinload(Review.booking).joinedload(Booking.guest))
        .order_by(Review.created_at.desc(), Review.id.desc())
        .offset(params.offset)
        .limit(params.page_size)
    ).all()
    items = [ReviewOut.model_validate(review) for review in reviews]
    return ReviewPage.build(items, total or 0, params, summary=_rating_summary(db, listing_id))


def _rating_summary(db: Session, listing_id: int) -> RatingSummary:
    averages = [
        func.round(func.avg(getattr(Review, field)), 2).label(field) for field in RATING_FIELDS
    ]
    row = db.execute(
        select(func.count(Review.id).label("count"), *averages)
        .select_from(Review)
        .join(Booking, Booking.id == Review.booking_id)
        .where(Booking.listing_id == listing_id)
    ).one()
    return RatingSummary.model_validate(row._asdict())
