from dataclasses import dataclass
from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


@dataclass(frozen=True)
class BoundingBox:
    south: float
    west: float
    north: float
    east: float

    def contains(self, latitude: float, longitude: float) -> bool:
        return self.south <= latitude <= self.north and self.west <= longitude <= self.east


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./airbnb.db"
    secret_key: str = Field(min_length=32)
    access_token_ttl_minutes: int = 60 * 24 * 7
    cors_origins: list[str] = ["http://localhost:3000"]
    service_fee_rate: float = 0.14

    storage_backend: Literal["local", "gcs"] = "local"
    local_media_dir: str = "media"
    public_base_url: str = "http://localhost:8000"
    gcs_bucket: str | None = None
    gcs_credentials_file: str | None = None
    max_upload_bytes: int = 8 * 1024 * 1024
    max_image_dimension: int = 2048
    max_uploads_per_user: int = 300

    google_client_id: str | None = None

    # Bengaluru and weekend getaways within about 250 km.
    service_area_south: float = 11.60
    service_area_west: float = 75.30
    service_area_north: float = 13.80
    service_area_east: float = 78.20

    rate_limit_per_minute: int = 300

    seed_user_password: str | None = None

    @field_validator("secret_key")
    @classmethod
    def reject_placeholder(cls, value: str) -> str:
        if value.startswith("replace-with"):
            raise ValueError("Set SECRET_KEY to a random value, not the .env.example placeholder")
        return value

    @model_validator(mode="after")
    def require_bucket_for_gcs(self) -> Self:
        if self.storage_backend == "gcs" and not self.gcs_bucket:
            raise ValueError("GCS_BUCKET is required when STORAGE_BACKEND=gcs")
        return self

    @property
    def service_area(self) -> BoundingBox:
        return BoundingBox(
            self.service_area_south,
            self.service_area_west,
            self.service_area_north,
            self.service_area_east,
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
