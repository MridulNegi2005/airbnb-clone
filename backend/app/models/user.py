from datetime import datetime

from sqlalchemy import JSON, CheckConstraint, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, TimestampMixin


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "password_hash IS NOT NULL OR google_sub IS NOT NULL", name="has_login_method"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    about: Mapped[str | None] = mapped_column(Text)
    work: Mapped[str | None] = mapped_column(String(120))
    languages: Mapped[list[str]] = mapped_column(JSON, default=list)
    lives_in: Mapped[str | None] = mapped_column(String(120))
    is_superhost: Mapped[bool] = mapped_column(default=False)
    identity_verified_at: Mapped[datetime | None]
    # Every token carries the version it was issued under; bumping it signs out all sessions.
    token_version: Mapped[int] = mapped_column(default=0, server_default=text("0"))

    @property
    def is_identity_verified(self) -> bool:
        return self.identity_verified_at is not None

    @property
    def has_password(self) -> bool:
        return self.password_hash is not None

    @property
    def has_google(self) -> bool:
        return self.google_sub is not None
