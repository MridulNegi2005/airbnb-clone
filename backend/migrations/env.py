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
        context.configure(
            connection=connection,
            target_metadata=Base.metadata,
            # SQLite cannot ALTER most constraints in place; batch mode rebuilds the table.
            render_as_batch=True,
            compare_type=True,
            render_item=render_item,
        )
        with context.begin_transaction():
            context.run_migrations()


run_migrations()
