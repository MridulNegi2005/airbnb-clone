import secrets

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Upload, User
from app.services.images import process_image
from app.storage import get_storage


def create_upload(db: Session, user: User, raw: bytes) -> Upload:
    settings = get_settings()
    uploaded = db.scalar(select(func.count(Upload.id)).where(Upload.user_id == user.id)) or 0
    if uploaded >= settings.max_uploads_per_user:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail="You have reached the photo upload limit"
        )

    image = process_image(raw, settings.max_image_dimension)
    key = f"uploads/{user.id}/{secrets.token_hex(16)}.webp"
    url = get_storage().save(key, image.data, image.content_type)
    upload = Upload(
        user_id=user.id,
        storage_key=key,
        url=url,
        content_type=image.content_type,
        size_bytes=len(image.data),
        width=image.width,
        height=image.height,
    )
    db.add(upload)
    db.commit()
    return upload


def ensure_usable_images(db: Session, user: User, urls: list[str]) -> None:
    """Accept external https photo URLs, but our own storage only for the user's uploads."""
    hosted = [url for url in urls if _is_our_storage(url)]
    if any(not url.startswith("https://") for url in urls if url not in hosted):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Photo URLs must use https"
        )
    if not hosted:
        return
    owned = set(
        db.scalars(select(Upload.url).where(Upload.user_id == user.id, Upload.url.in_(hosted)))
    )
    if any(url not in owned for url in hosted):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="You can only use photos that you uploaded",
        )


def _is_our_storage(url: str) -> bool:
    settings = get_settings()
    if settings.storage_backend == "gcs":
        prefix = f"https://storage.googleapis.com/{settings.gcs_bucket}/"
    else:
        prefix = f"{settings.public_base_url.rstrip('/')}/media/"
    return url.startswith(prefix)
