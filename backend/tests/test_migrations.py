from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import create_engine, inspect

from app import database
from app.database import Base

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def test_migrations_match_models_and_downgrade(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = create_engine(f"sqlite:///{(tmp_path / 'migrations.db').as_posix()}")
    # Alembic re-runs env.py per command, so its `from app.database import engine` sees this.
    monkeypatch.setattr(database, "engine", engine)
    config = Config()
    config.set_main_option("script_location", str(MIGRATIONS_DIR))

    try:
        command.upgrade(config, "head")
        with engine.connect() as connection:
            context = MigrationContext.configure(connection, opts={"compare_type": True})
            assert compare_metadata(context, Base.metadata) == []

        command.downgrade(config, "base")
        assert inspect(engine).get_table_names() == ["alembic_version"]
    finally:
        engine.dispose()
