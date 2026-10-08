from typing import Annotated

from fastapi import Depends, HTTPException, Path, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas.common import MAX_ID
from app.security import decode_access_token

DbSession = Annotated[Session, Depends(get_db)]
PathId = Annotated[int, Path(ge=1, le=MAX_ID)]

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    token = decode_access_token(credentials.credentials) if credentials else None
    user = db.get(User, token.user_id) if token else None
    # Bumping the user's token version signs out every token issued before it.
    if user is None or token is None or token.version != user.token_version:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
