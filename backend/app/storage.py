from contextlib import suppress
from functools import lru_cache
from pathlib import Path
from typing import Protocol

from app.config import get_settings


class Storage(Protocol):
    def save(self, key: str, data: bytes, content_type: str) -> str:
        """Store the bytes under `key` and return the public URL."""

    def delete(self, key: str) -> None: ...


class LocalStorage:
    """Writes to a folder served by the API at /media. For development and tests."""

    def __init__(self, directory: Path, base_url: str) -> None:
        self.directory = directory
        self.base_url = base_url.rstrip("/")

    def save(self, key: str, data: bytes, content_type: str) -> str:
        path = self.directory / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return f"{self.base_url}/media/{key}"

    def delete(self, key: str) -> None:
        (self.directory / key).unlink(missing_ok=True)


class GCSStorage:
    def __init__(self, bucket_name: str, credentials_file: str | None) -> None:
        from google.cloud import storage

        client = (
            storage.Client.from_service_account_json(credentials_file)
            if credentials_file
            else storage.Client()
        )
        self.bucket = client.bucket(bucket_name)

    def save(self, key: str, data: bytes, content_type: str) -> str:
        blob = self.bucket.blob(key)
        # Keys are random and never reused, so browsers and CDNs can cache forever.
        blob.cache_control = "public, max-age=31536000, immutable"
        blob.upload_from_string(data, content_type=content_type)
        return f"https://storage.googleapis.com/{self.bucket.name}/{key}"

    def delete(self, key: str) -> None:
        from google.cloud.exceptions import NotFound

        with suppress(NotFound):
            self.bucket.blob(key).delete()


@lru_cache
def get_storage() -> Storage:
    settings = get_settings()
    if settings.storage_backend == "gcs":
        assert settings.gcs_bucket is not None
        return GCSStorage(settings.gcs_bucket, settings.gcs_credentials_file)
    return LocalStorage(Path(settings.local_media_dir), settings.public_base_url)
