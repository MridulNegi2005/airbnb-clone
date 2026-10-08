import argparse
import random
import secrets
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import (
    Amenity,
    BlockedPeriod,
    Booking,
    BookingStatus,
    Category,
    Conversation,
    GuestReview,
    Listing,
    ListingImage,
    ListingReview,
    Message,
    RoomType,
    User,
    Wishlist,
    WishlistItem,
)
from app.security import hash_password
from app.seed_content import CATEGORIES, GUESTS, HOSTS, LISTINGS, ListingSeed, PersonSeed
from app.seed_data import (
    AMENITIES,
    BASE_AMENITIES,
    GUEST_REVIEW_COMMENTS,
    PHOTOS,
    REVIEW_COMMENTS,
    UNSPLASH,
)
from app.services.bookings import price_stay
from app.services.listings import approximate_location

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"

# Listing indexes where the demo guest (GUESTS[0]) gets a specific trip, so every state shows.
DEMO_LOGIN_EMAILS = {"rohan@example.com", "kavya@example.com"}
DEMO_UPCOMING = {0, 4, 20}
DEMO_CANCELLED = {8}
DEMO_AWAITING_REVIEW = {3}
DEMO_REVIEWED = {5, 12, 22, 27}
DEMO_BLOCKED = {1: (70, 74), 6: (60, 63)}
WEEKLY_DISCOUNTS = (10, 15, 0)
DEMO_WISHLISTS = {
    "Weekend getaways": (18, 20, 24, 27, 30),
    "Bengaluru stays": (1, 6, 13),
}

_ROOM_DETAILS = {
    RoomType.ENTIRE_HOME: "You will have the whole place to yourself.",
    RoomType.PRIVATE_ROOM: "You will have a private room. Some common areas are shared.",
    RoomType.SHARED_ROOM: "You will sleep in a shared room with other guests.",
}


def _user(person: PersonSeed, password_hash: str, joined: datetime) -> User:
    return User(
        name=person.name,
        email=person.email,
        password_hash=password_hash,
        avatar_url=f"https://i.pravatar.cc/300?img={person.avatar}",
        about=person.about,
        work=person.work,
        languages=list(person.languages),
        lives_in=person.lives_in,
        is_superhost=person.is_superhost,
        identity_verified_at=joined if person.identity_verified else None,
        created_at=joined,
    )


def _photo_urls(seed: ListingSeed, index: int) -> list[str]:
    def pick(kind: str, offset: int = 0) -> str:
        pool = PHOTOS[kind]
        return UNSPLASH.format(pool[(index + offset) % len(pool)])

    return [
        pick(seed.exterior),
        pick("living"),
        pick("bedroom"),
        pick("kitchen"),
        pick("living", 7),
        pick("bath"),
        pick("bedroom", 5),
    ]


def _description(seed: ListingSeed) -> str:
    return (
        f"{seed.summary}\n\n"
        f"The space\n{_ROOM_DETAILS[seed.room_type]} The home sleeps up to {seed.guests} "
        f"guests and has fast wifi and fresh linens.\n\n"
        f"Getting around\n{seed.neighbourhood} is easy to explore, and your host can help "
        f"arrange a cab from Kempegowda International Airport."
    )


def _listing(
    seed: ListingSeed,
    index: int,
    host: User,
    amenities: dict[str, Amenity],
    categories: dict[str, Category],
) -> Listing:
    approx_latitude, approx_longitude = approximate_location(seed.latitude, seed.longitude)
    return Listing(
        host=host,
        title=seed.title,
        description=_description(seed),
        property_type=seed.property_type,
        room_type=seed.room_type,
        address=seed.address,
        neighbourhood=seed.neighbourhood,
        city=seed.city,
        country="India",
        latitude=seed.latitude,
        longitude=seed.longitude,
        approx_latitude=approx_latitude,
        approx_longitude=approx_longitude,
        price_per_night=seed.price,
        cleaning_fee=seed.cleaning_fee,
        max_guests=seed.guests,
        bedrooms=seed.bedrooms,
        beds=seed.beds,
        bathrooms=seed.bathrooms,
        # Weekend getaways ask for two nights, like most hill-station homes on Airbnb.
        min_nights=1 if seed.city == "Bengaluru" else 2,
        weekly_discount_percent=WEEKLY_DISCOUNTS[index % len(WEEKLY_DISCOUNTS)],
        images=[
            ListingImage(url=url, position=position)
            for position, url in enumerate(_photo_urls(seed, index))
        ],
        amenities=[amenities[name] for name in sorted({*BASE_AMENITIES, *seed.amenities})],
        categories=[categories[slug] for slug in seed.categories],
    )


def _booking(listing: Listing, guest: User, check_in: date, nights: int, guests: int) -> Booking:
    price = price_stay(listing, nights)
    return Booking(
        listing=listing,
        guest=guest,
        check_in=check_in,
        check_out=check_in + timedelta(days=nights),
        guests=guests,
        nightly_rate=price.nightly_rate,
        discount=price.discount,
        cleaning_fee=price.cleaning_fee,
        service_fee=price.service_fee,
        total=price.total,
    )


def _written_after(rng: random.Random, check_out: date) -> datetime:
    return datetime.combine(check_out + timedelta(days=rng.randint(1, 5)), time(10), UTC)


def _listing_review(rng: random.Random, check_out: date) -> ListingReview:
    overall = rng.choices([5, 4, 3], weights=[82, 15, 3])[0]

    def near_overall() -> int:
        return max(1, min(5, overall + rng.choice([0, 0, 0, 0, -1])))

    return ListingReview(
        rating=overall,
        cleanliness=near_overall(),
        accuracy=near_overall(),
        check_in=near_overall(),
        communication=near_overall(),
        location=near_overall(),
        value=near_overall(),
        comment=rng.choice(REVIEW_COMMENTS),
        created_at=_written_after(rng, check_out),
    )


def _guest_review(rng: random.Random, check_out: date) -> GuestReview:
    return GuestReview(
        rating=rng.choices([5, 4], weights=[85, 15])[0],
        comment=rng.choice(GUEST_REVIEW_COMMENTS),
        created_at=_written_after(rng, check_out),
    )


def _stays(
    rng: random.Random, index: int, listing: Listing, others: list[User], demo: User
) -> list[Booking]:
    today = date.today()
    stays: list[Booking] = []

    cursor = today - timedelta(days=rng.randint(240, 330))
    while True:
        nights = rng.randint(listing.min_nights, 4)
        if cursor + timedelta(days=nights) >= today:
            break
        party = rng.randint(1, listing.max_guests)
        stays.append(_booking(listing, rng.choice(others), cursor, nights, party))
        cursor += timedelta(days=nights + rng.randint(4, 30))

    if index in DEMO_REVIEWED:
        stays[0].guest = demo
    if index in DEMO_AWAITING_REVIEW:
        stays[-1].guest = demo
    reviewed = stays[:-1] if index in DEMO_AWAITING_REVIEW else stays
    for stay in reviewed:
        stay.review = _listing_review(rng, stay.check_out)
        if rng.random() < 0.6:
            stay.guest_review = _guest_review(rng, stay.check_out)

    cursor = today + timedelta(days=rng.randint(5, 20))
    for position in range(rng.randint(1, 2)):
        nights = rng.randint(2, 4)
        is_demo = position == 0 and index in DEMO_UPCOMING | DEMO_CANCELLED
        stay = _booking(listing, demo if is_demo else rng.choice(others), cursor, nights, 1)
        if position == 0 and index in DEMO_CANCELLED:
            stay.status = BookingStatus.CANCELLED
            stay.cancelled_at = datetime.now(UTC) - timedelta(days=2)
        stays.append(stay)
        cursor += timedelta(days=nights + rng.randint(3, 15))

    return stays


def seed(db: Session, password: str) -> None:
    rng = random.Random(2024)
    now = datetime.now(UTC)
    # Only the documented demo accounts get the shared password. The other seeded emails are
    # public in this repo, so they get a random password nobody knows.
    demo_hash = hash_password(password)
    locked_hash = hash_password(secrets.token_urlsafe(32))

    def password_for(person: PersonSeed) -> str:
        return demo_hash if person.email in DEMO_LOGIN_EMAILS else locked_hash

    hosts = [
        _user(person, password_for(person), now - timedelta(days=rng.randint(700, 3000)))
        for person in HOSTS
    ]
    guests = [
        _user(person, password_for(person), now - timedelta(days=rng.randint(60, 900)))
        for person in GUESTS
    ]
    demo, others = guests[0], guests[1:]

    amenities = {name: Amenity(name=name, icon=icon) for name, icon in AMENITIES}
    categories = {
        slug: Category(slug=slug, name=name, icon=icon) for slug, name, icon in CATEGORIES
    }
    listings = [
        _listing(seed, index, hosts[seed.host], amenities, categories)
        for index, seed in enumerate(LISTINGS)
    ]
    db.add_all([*hosts, *guests, *amenities.values(), *categories.values(), *listings])
    for index, listing in enumerate(listings):
        db.add_all(_stays(rng, index, listing, others, demo))

    db.flush()
    for index, (start, end) in DEMO_BLOCKED.items():
        db.add(
            BlockedPeriod(
                listing_id=listings[index].id,
                start_date=date.today() + timedelta(days=start),
                end_date=date.today() + timedelta(days=end),
            )
        )
    for name, indexes in DEMO_WISHLISTS.items():
        db.add(
            Wishlist(
                user_id=demo.id,
                name=name,
                items=[WishlistItem(listing=listings[index]) for index in indexes],
            )
        )
    _seed_conversations(db, demo, listings)


def _seed_conversations(db: Session, demo: User, listings: list[Listing]) -> None:
    stay, getaway = listings[0], listings[20]
    threads = [
        (
            stay,
            [
                (demo, "Hi! Is early check-in possible on the first day? Our flight lands at 9."),
                (stay.host, "Hi Rohan, yes. The place will be ready from 11 am."),
                (demo, "Perfect, thank you!"),
            ],
        ),
        (
            getaway,
            [
                (demo, "Hello, is the road to the cottage fine for a hatchback?"),
                (getaway.host, "Yes, the last 2 km is a smooth estate road. Drive safe!"),
            ],
        ),
    ]
    for listing, lines in threads:
        start = datetime.now(UTC) - timedelta(hours=len(lines) * 3)
        conversation = Conversation(
            listing_id=listing.id,
            guest_id=demo.id,
            last_message_at=start + timedelta(hours=(len(lines) - 1) * 3),
        )
        db.add(conversation)
        db.flush()
        for offset, (sender, body) in enumerate(lines):
            message = Message(
                conversation_id=conversation.id,
                sender_id=sender.id,
                body=body,
                created_at=start + timedelta(hours=offset * 3),
            )
            db.add(message)
            db.flush()
            # Each sender has read up to their own message; the host's last reply stays unread.
            if sender.id == demo.id:
                conversation.guest_last_read_message_id = message.id
            else:
                conversation.host_last_read_message_id = message.id


def migrate(reset: bool = False) -> None:
    config = Config(str(ALEMBIC_INI))
    if reset:
        command.downgrade(config, "base")
    command.upgrade(config, "head")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fill the database with demo data.")
    parser.add_argument("--reset", action="store_true", help="drop all tables before seeding")
    args = parser.parse_args()

    password = get_settings().seed_user_password
    if not password:
        raise SystemExit("Set SEED_USER_PASSWORD in backend/.env before seeding.")

    migrate(reset=args.reset)
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)) is not None:
            print("Database already contains data. Run with --reset to reseed.")
            return
        seed(db, password)
        db.commit()
    print(f"Seeded {len(HOSTS) + len(GUESTS)} users and {len(LISTINGS)} listings.")


if __name__ == "__main__":
    main()
