from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from sqlalchemy import Engine, create_engine, inspect

from app import database
from app.database import Base

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


@pytest.fixture
def migrated_engine(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Engine:
    engine = create_engine(f"sqlite:///{(tmp_path / 'migrations.db').as_posix()}")
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
    from_models = create_engine(f"sqlite:///{(tmp_path / 'models.db').as_posix()}")
    try:
        Base.metadata.create_all(from_models)
        assert _check_constraints(migrated_engine) == _check_constraints(from_models)
    finally:
        from_models.dispose()
