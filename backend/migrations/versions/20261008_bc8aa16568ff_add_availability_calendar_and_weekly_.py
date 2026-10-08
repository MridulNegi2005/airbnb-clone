"""add availability calendar and weekly discount

Revision ID: bc8aa16568ff
Revises: 7312d727fc53
Create Date: 2026-10-08 20:09:34.417717

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "bc8aa16568ff"
down_revision: str | Sequence[str] | None = "7312d727fc53"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Autogenerate does not compare CHECK constraints, so these are written by hand.
OLD_AMOUNTS_CHECK = "nightly_rate > 0 AND cleaning_fee >= 0 AND service_fee >= 0 AND total > 0"
NEW_AMOUNTS_CHECK = (
    "nightly_rate > 0 AND discount >= 0 AND cleaning_fee >= 0 AND service_fee >= 0 AND total > 0"
)


def upgrade() -> None:
    op.create_table(
        "blocked_periods",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("listing_id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("(CURRENT_TIMESTAMP)"),
            nullable=False,
        ),
        sa.CheckConstraint("end_date > start_date", name=op.f("ck_blocked_periods_dates_order")),
        sa.ForeignKeyConstraint(
            ["listing_id"],
            ["listings.id"],
            name=op.f("fk_blocked_periods_listing_id_listings"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_blocked_periods")),
    )
    with op.batch_alter_table("blocked_periods", schema=None) as batch_op:
        batch_op.create_index(
            "ix_blocked_periods_listing_dates",
            ["listing_id", "start_date", "end_date"],
            unique=False,
        )

    with op.batch_alter_table("bookings", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("discount", sa.Integer(), server_default=sa.text("0"), nullable=False)
        )
        batch_op.drop_constraint(op.f("ck_bookings_amounts_valid"), type_="check")
        batch_op.create_check_constraint(op.f("ck_bookings_amounts_valid"), NEW_AMOUNTS_CHECK)

    with op.batch_alter_table("listings", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("min_nights", sa.Integer(), server_default=sa.text("1"), nullable=False)
        )
        batch_op.add_column(
            sa.Column("max_nights", sa.Integer(), server_default=sa.text("(365)"), nullable=False)
        )
        batch_op.add_column(
            sa.Column(
                "weekly_discount_percent", sa.Integer(), server_default=sa.text("0"), nullable=False
            )
        )
        batch_op.create_check_constraint(
            op.f("ck_listings_nights_range"),
            "min_nights BETWEEN 1 AND 365 AND max_nights BETWEEN min_nights AND 365",
        )
        batch_op.create_check_constraint(
            op.f("ck_listings_weekly_discount_range"),
            "weekly_discount_percent BETWEEN 0 AND 90",
        )


def downgrade() -> None:
    with op.batch_alter_table("listings", schema=None) as batch_op:
        batch_op.drop_constraint(op.f("ck_listings_weekly_discount_range"), type_="check")
        batch_op.drop_constraint(op.f("ck_listings_nights_range"), type_="check")
        batch_op.drop_column("weekly_discount_percent")
        batch_op.drop_column("max_nights")
        batch_op.drop_column("min_nights")

    with op.batch_alter_table("bookings", schema=None) as batch_op:
        batch_op.drop_constraint(op.f("ck_bookings_amounts_valid"), type_="check")
        batch_op.create_check_constraint(op.f("ck_bookings_amounts_valid"), OLD_AMOUNTS_CHECK)
        batch_op.drop_column("discount")

    with op.batch_alter_table("blocked_periods", schema=None) as batch_op:
        batch_op.drop_index("ix_blocked_periods_listing_dates")

    op.drop_table("blocked_periods")
