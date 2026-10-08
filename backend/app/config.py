from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./airbnb.db"
    secret_key: str = Field(min_length=32)
    access_token_ttl_minutes: int = 60 * 24 * 7
    cors_origins: list[str] = ["http://localhost:3000"]
    upload_dir: str = "uploads"
    max_upload_bytes: int = 5 * 1024 * 1024
    service_fee_rate: float = 0.14
    seed_user_password: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
