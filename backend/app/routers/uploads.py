import secrets
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, status
from pydantic import BaseModel

from app.config import get_settings
from app.deps import CurrentUser

router = APIRouter(prefix="/uploads", tags=["uploads"])


class UploadOut(BaseModel):
    url: str


def _image_extension(head: bytes) -> str | None:
    if head.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ".webp"
    return None


@router.post("", response_model=UploadOut, status_code=status.HTTP_201_CREATED)
def upload_image(file: UploadFile, request: Request, _user: CurrentUser) -> UploadOut:
    settings = get_settings()
    data = file.file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="Image is too large")

    # Trust the file bytes, not the client-supplied name or content type.
    extension = _image_extension(data[:12])
    if extension is None:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Upload a JPEG, PNG or WebP image"
        )

    filename = f"{secrets.token_hex(16)}{extension}"
    (Path(settings.upload_dir) / filename).write_bytes(data)
    return UploadOut(url=str(request.url_for("uploads", path=filename)))
