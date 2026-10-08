from logging.config import fileConfig
from typing import Any

from alembic import context
from alembic.autogenerate.api import AutogenContext

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.database import Base, UTCDateTime, engine

if context.config.config_file_name is not None:
    fileConfig(context.config.config_file_name)


def render_item(type_: str, obj: Any, _context: AutogenContext) -> str | bool:
    # Keep migrations free of app imports: store the custom type as its plain SQL type.
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime()"
    return False


def run_migrations() -> None:
    with engine.connect() as connection:
        # SQLite changes a table by copying it and dropping the old one. With foreign keys
        # enforced, that drop fails as soon as other rows point at the table, so enforcement
        # is paused (it can only change outside a transaction) and checked once at the end.
        raw = connection.connection.driver_connection
        raw.execute("PRAGMA foreign_keys = OFF")
        context.configure(
            connection=connection,
            target_metadata=Base.metadata,
            render_as_batch=True,
            compare_type=True,
            render_item=render_item,
        )
        with context.begin_transaction():
            context.run_migrations()
            broken = connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
            if broken:
                raise RuntimeError(f"Migration left broken foreign keys: {broken[:5]}")
        raw.execute("PRAGMA foreign_keys = ON")


run_migrations()
