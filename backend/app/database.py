from collections.abc import Iterator
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import Connection, DateTime, Engine, Enum, MetaData, create_engine, event, func
from sqlalchemy.engine import URL, Dialect
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.types import TypeDecorator

from app.config import get_settings


def _configure_sqlite(dbapi_connection: Any, _connection_record: Any) -> None:
    for pragma in (
        "foreign_keys = ON",
        "journal_mode = WAL",
        "synchronous = NORMAL",
        "busy_timeout = 5000",
    ):
        dbapi_connection.execute(f"PRAGMA {pragma}")


def _autocommit_driver(dbapi_connection: Any, _connection_record: Any) -> None:
    # Python's sqlite3 only opens a transaction before INSERT/UPDATE/DELETE, so each schema
    # change would commit on its own. With this, SQLAlchemy's BEGIN (below) covers all of them.
    dbapi_connection.isolation_level = None


def _begin(connection: Connection) -> None:
    connection.exec_driver_sql("BEGIN")


def make_engine(url: str | URL, *, transactional_ddl: bool = False) -> Engine:
    """SQLite engine with the app's pragmas.

    `transactional_ddl` makes every statement, schema changes included, part of one
    transaction. Migrations need that to be all-or-nothing. The app must not use it: a
    transaction that starts at the first read fails its later write at once ("database is
    locked") whenever another request committed in between, instead of waiting its turn.
    """
    new_engine = create_engine(url, connect_args={"check_same_thread": False})
    event.listen(new_engine, "connect", _configure_sqlite)
    if transactional_ddl:
        event.listen(new_engine, "connect", _autocommit_driver)
        event.listen(new_engine, "begin", _begin)
    return new_engine


engine = make_engine(get_settings().database_url)

SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

# Deterministic constraint names let Alembic create, compare and drop them on SQLite.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class UTCDateTime(TypeDecorator[datetime]):
    """Stores naive UTC in SQLite and always returns timezone-aware UTC datetimes."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Naive datetimes are not allowed; use datetime.now(UTC)")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: Dialect) -> datetime | None:
        return value.replace(tzinfo=UTC) if value is not None else None


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {datetime: UTCDateTime()}


class CreatedAtMixin:
    created_at: Mapped[datetime] = mapped_column(server_default=func.current_timestamp())


class TimestampMixin(CreatedAtMixin):
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.current_timestamp(), onupdate=func.current_timestamp()
    )


def str_enum(enum_cls: type[StrEnum]) -> Enum:
    return Enum(
        enum_cls,
        native_enum=False,
        create_constraint=True,
        length=max(len(member.value) for member in enum_cls),
        values_callable=lambda members: [member.value for member in members],
    )


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
