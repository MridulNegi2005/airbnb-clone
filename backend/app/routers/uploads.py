from fastapi import APIRouter, Depends, HTTPException, UploadFile, status

from app.config import get_settings
from app.deps import CurrentUser, DbSession
from app.models import Upload
from app.rate_limit import limit_by_user
from app.schemas.upload import UploadOut
from app.services.media import create_upload

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post(
    "",
    response_model=UploadOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(limit_by_user(limit=60, window_seconds=3600))],
)
def upload_image(file: UploadFile, user: CurrentUser, db: DbSession) -> Upload:
    max_bytes = get_settings().max_upload_bytes
    raw = file.file.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, detail="Image is too large")
    return create_upload(db, user, raw)
