from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import ColumnElement, Select, and_, func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload, undefer_group

from app.config import get_settings
from app.database import Base
from app.models import (
    APPROX_OFFSET_DEGREES,
    LISTING_RATING_FIELDS,
    Amenity,
    Booking,
    BookingStatus,
    Category,
    Listing,
    ListingImage,
    ListingReview,
    User,
)
from app.schemas.booking import ListingReviewOut
from app.schemas.common import Page, PageParams
from app.schemas.listing import HostListing, ListingCard, ListingFilters, ListingWrite
from app.schemas.review import RatingSummary, ReviewPage
from app.services.availability import overlaps
from app.services.media import ensure_usable_images

_RELATION_FIELDS = {"image_urls", "amenity_ids", "category_ids"}


def active_listings() -> Select[tuple[Listing]]:
    return (
        select(Listing)
        .where(Listing.archived_at.is_(None))
        .options(selectinload(Listing.images), undefer_group("ratings"))
    )


def search_listings(db: Session, filters: ListingFilters) -> Page[ListingCard]:
    conditions = [Listing.archived_at.is_(None), *_filter_conditions(filters)]
    total = db.scalar(select(func.count(Listing.id)).where(*conditions)) or 0
    listings = db.scalars(
        active_listings()
        .where(*conditions)
        .order_by(Listing.id)
        .offset(filters.offset)
        .limit(filters.page_size)
    ).all()
    items = [ListingCard.model_validate(listing) for listing in listings]
    return Page[ListingCard].build(items, total, filters)


def _filter_conditions(filters: ListingFilters) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []

    if filters.location:
        # "Indiranagar, Bengaluru" matches when every comma-separated part hits a place field.
        for part in filter(None, (p.strip() for p in filters.location.split(","))):
            conditions.append(
                or_(
                    Listing.neighbourhood.icontains(part, autoescape=True),
                    Listing.city.icontains(part, autoescape=True),
                    Listing.country.icontains(part, autoescape=True),
                )
            )
    if bounds := filters.bounds:
        # Match on the public (shifted) position, or shrinking boxes would reveal the real one.
        # The wider box on the exact columns lets SQLite use the location index first.
        margin = APPROX_OFFSET_DEGREES
        conditions.append(Listing.latitude.between(bounds.south - margin, bounds.north + margin))
        conditions.append(Listing.longitude.between(bounds.west - margin, bounds.east + margin))
        conditions.append(Listing.approx_latitude.between(bounds.south, bounds.north))
        conditions.append(Listing.approx_longitude.between(bounds.west, bounds.east))
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
        active_listings()
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


def apply_listing_write(db: Session, listing: Listing, host: User, payload: ListingWrite) -> None:
    if not get_settings().service_area.contains(payload.latitude, payload.longitude):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Listings must be in Bengaluru or the nearby getaways we serve",
        )
    image_urls = [str(url) for url in payload.image_urls]
    ensure_usable_images(db, host, image_urls)

    for field, value in payload.model_dump(exclude=_RELATION_FIELDS).items():
        setattr(listing, field, value)
    listing.images = [
        ListingImage(url=url, position=position) for position, url in enumerate(image_urls)
    ]
    listing.amenities = _load_by_ids(db, Amenity, payload.amenity_ids)
    listing.categories = _load_by_ids(db, Category, payload.category_ids)


def _load_by_ids[M: Base](db: Session, model: type[M], ids: list[int]) -> list[M]:
    unique_ids = set(ids)
    rows = list(db.scalars(select(model).where(model.id.in_(unique_ids))))  # type: ignore[attr-defined]
    if len(rows) != len(unique_ids):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Unknown {model.__tablename__} id in request",
        )
    return rows


def archive_listing(db: Session, listing: Listing) -> None:
    # Soft delete: past bookings and reviews keep pointing at the listing.
    if has_upcoming_bookings(db, listing.id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="This listing has upcoming reservations and cannot be removed",
        )
    listing.archived_at = datetime.now(UTC)
    db.commit()


def has_upcoming_bookings(db: Session, listing_id: int) -> bool:
    stmt = select(Booking.id).where(
        Booking.listing_id == listing_id,
        Booking.status == BookingStatus.CONFIRMED,
        Booking.check_out > date.today(),
    )
    return db.scalar(stmt.limit(1)) is not None


def list_host_listings(db: Session, host: User) -> list[HostListing]:
    listings = db.scalars(
        active_listings().where(Listing.host_id == host.id).order_by(Listing.created_at.desc())
    )
    rows = db.execute(
        select(Booking.listing_id, func.count(Booking.id))
        .join(Booking.listing)
        .where(
            Listing.host_id == host.id,
            Booking.status == BookingStatus.CONFIRMED,
            Booking.check_out > date.today(),
        )
        .group_by(Booking.listing_id)
    )
    upcoming = {listing_id: count for listing_id, count in rows}
    return [
        HostListing(
            **ListingCard.model_validate(listing).model_dump(),
            upcoming_booking_count=upcoming.get(listing.id, 0),
        )
        for listing in listings
    ]


def list_reviews(db: Session, listing_id: int, params: PageParams) -> ReviewPage:
    get_listing(db, listing_id)
    of_listing = and_(Booking.id == ListingReview.booking_id, Booking.listing_id == listing_id)
    total = db.scalar(select(func.count(ListingReview.id)).join(Booking, of_listing)) or 0
    reviews = db.scalars(
        select(ListingReview)
        .join(Booking, of_listing)
        .options(selectinload(ListingReview.booking).joinedload(Booking.guest))
        .order_by(ListingReview.created_at.desc(), ListingReview.id.desc())
        .offset(params.offset)
        .limit(params.page_size)
    ).all()
    items = [ListingReviewOut.model_validate(review) for review in reviews]
    return ReviewPage.build(items, total, params, summary=_rating_summary(db, listing_id))


def _rating_summary(db: Session, listing_id: int) -> RatingSummary:
    averages = [
        func.round(func.avg(getattr(ListingReview, field)), 2).label(field)
        for field in LISTING_RATING_FIELDS
    ]
    row = db.execute(
        select(func.count(ListingReview.id).label("count"), *averages)
        .select_from(ListingReview)
        .join(Booking, Booking.id == ListingReview.booking_id)
        .where(Booking.listing_id == listing_id)
    ).one()
    return RatingSummary.model_validate(row._asdict())
