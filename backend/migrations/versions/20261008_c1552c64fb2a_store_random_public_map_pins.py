"""store random public map pins

Revision ID: c1552c64fb2a
Revises: bc8aa16568ff
Create Date: 2026-10-08 23:28:43.678328

"""

import math
import secrets
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1552c64fb2a"
down_revision: str | Sequence[str] | None = "bc8aa16568ff"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX = "ix_listings_active_location"
ACTIVE = sa.text("archived_at IS NULL")


def _random_pin(
    latitude: float, longitude: float, rng: secrets.SystemRandom
) -> tuple[float, float]:
    # Same rule as the app (services/listings.py), copied so the migration never changes.
    angle = rng.uniform(0, 2 * math.pi)
    distance = rng.uniform(0.0015, 0.003)
    return (
        round(latitude + distance * math.sin(angle), 4),
        round(longitude + distance * math.cos(angle), 4),
    )


def upgrade() -> None:
    with op.batch_alter_table("listings", schema=None) as batch_op:
        batch_op.add_column(sa.Column("approx_latitude", sa.Double(), nullable=True))
        batch_op.add_column(sa.Column("approx_longitude", sa.Double(), nullable=True))

    # Existing listings had a pin derived from their public id; give each a random one.
    connection = op.get_bind()
    rng = secrets.SystemRandom()
    listings = connection.execute(sa.text("SELECT id, latitude, longitude FROM listings")).all()
    for listing_id, latitude, longitude in listings:
        approx_latitude, approx_longitude = _random_pin(latitude, longitude, rng)
        connection.execute(
            sa.text(
                "UPDATE listings SET approx_latitude = :lat, approx_longitude = :lng WHERE id = :id"
            ),
            {"lat": approx_latitude, "lng": approx_longitude, "id": listing_id},
        )

    with op.batch_alter_table("listings", schema=None) as batch_op:
        batch_op.alter_column("approx_latitude", existing_type=sa.Double(), nullable=False)
        batch_op.alter_column("approx_longitude", existing_type=sa.Double(), nullable=False)
        batch_op.drop_index(INDEX, sqlite_where=ACTIVE)
        batch_op.create_index(
            INDEX, ["approx_latitude", "approx_longitude"], unique=False, sqlite_where=ACTIVE
        )


def downgrade() -> None:
    with op.batch_alter_table("listings", schema=None) as batch_op:
        batch_op.drop_index(INDEX, sqlite_where=ACTIVE)
        batch_op.create_index(INDEX, ["latitude", "longitude"], unique=False, sqlite_where=ACTIVE)
        batch_op.drop_column("approx_longitude")
        batch_op.drop_column("approx_latitude")
