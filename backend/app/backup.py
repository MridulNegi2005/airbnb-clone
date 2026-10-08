"""Online SQLite backup. Run nightly: `docker exec airbnb-api python -m app.backup`."""

import sqlite3
from datetime import date
from pathlib import Path

from app.config import get_settings

KEEP = 7


def backup() -> Path:
    database = Path(get_settings().database_url.removeprefix("sqlite:///"))
    folder = database.parent / "backups"
    folder.mkdir(exist_ok=True)
    target = folder / f"{database.stem}-{date.today():%Y%m%d}.db"
    # The backup API copies a consistent snapshot while the app keeps writing.
    with sqlite3.connect(database) as source, sqlite3.connect(target) as copy:
        source.backup(copy)
    for old in sorted(folder.glob(f"{database.stem}-*.db"))[:-KEEP]:
        old.unlink()
    return target


if __name__ == "__main__":
    print(f"Backed up to {backup()}")
