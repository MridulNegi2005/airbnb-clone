from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import Engine, inspect

from app import database
from app.database import Base, make_engine

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


@pytest.fixture
def migrated_engine(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Engine:
    engine = make_engine(f"sqlite:///{(tmp_path / 'migrations.db').as_posix()}")
    # Alembic re-runs env.py per command, so its `from app.database import engine` sees this.
    monkeypatch.setattr(database, "engine", engine)
    yield engine
    engine.dispose()


def _alembic_config() -> Config:
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))
    return config


def _check_constraints(engine: Engine) -> dict[str, set[tuple[str, str]]]:
    inspector = inspect(engine)
    return {
        table: {
            (check["name"], " ".join(check["sqltext"].split()))
            for check in inspector.get_check_constraints(table)
        }
        for table in inspector.get_table_names()
        if table != "alembic_version"
    }


def test_migrations_match_models_and_downgrade(migrated_engine: Engine) -> None:
    config = _alembic_config()
    command.upgrade(config, "head")
    with migrated_engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        assert compare_metadata(context, Base.metadata) == []

    command.downgrade(config, "base")
    assert inspect(migrated_engine).get_table_names() == ["alembic_version"]


def test_migrations_create_the_same_check_constraints_as_the_models(
    migrated_engine: Engine, tmp_path: Path
) -> None:
    # Autogenerate ignores CHECK constraints, so compare them with a schema built from models.
    command.upgrade(_alembic_config(), "head")
    from_models = make_engine(f"sqlite:///{(tmp_path / 'models.db').as_posix()}")
    try:
        Base.metadata.create_all(from_models)
        assert _check_constraints(migrated_engine) == _check_constraints(from_models)
    finally:
        from_models.dispose()


def test_migrations_upgrade_a_database_that_already_has_data(migrated_engine: Engine) -> None:
    # SQLite rebuilds tables during migrations; rows pointing at them must survive that.
    config = _alembic_config()
    command.upgrade(config, "7312d727fc53")
    with migrated_engine.begin() as connection:
        for statement in (
            "INSERT INTO users (id, name, email, password_hash, languages, is_superhost)"
            " VALUES (1, 'Host', 'host@example.com', 'x', '[]', 0),"
            " (2, 'Guest', 'guest@example.com', 'x', '[]', 0)",
            "INSERT INTO listings (id, host_id, title, description, property_type, room_type,"
            " address, neighbourhood, city, country, latitude, longitude, price_per_night,"
            " cleaning_fee, max_guests, bedrooms, beds, bathrooms) VALUES (1, 1, 'Loft', 'Nice',"
            " 'apartment', 'entire_home', 'Road', 'Indiranagar', 'Bengaluru', 'India', 12.97,"
            " 77.64, 2500, 0, 2, 1, 1, 1)",
            "INSERT INTO bookings (id, listing_id, guest_id, check_in, check_out, guests,"
            " nightly_rate, cleaning_fee, service_fee, total, status) VALUES (1, 1, 2,"
            " '2026-01-01', '2026-01-03', 1, 2500, 0, 700, 5700, 'confirmed')",
            "INSERT INTO listing_reviews (booking_id, rating, cleanliness, accuracy, check_in,"
            " communication, location, value, comment) VALUES (1, 5, 5, 5, 5, 5, 5, 5, 'Great')",
        ):
            connection.exec_driver_sql(statement)

    command.upgrade(config, "head")
    with migrated_engine.connect() as connection:
        listing = connection.exec_driver_sql(
            "SELECT approx_latitude, approx_longitude, min_nights FROM listings"
        ).one()
        assert None not in listing
        assert listing[2] == 1
        assert connection.exec_driver_sql("SELECT discount FROM bookings").scalar() == 0
        assert connection.exec_driver_sql("SELECT count(*) FROM listing_reviews").scalar() == 1
        assert connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall() == []
