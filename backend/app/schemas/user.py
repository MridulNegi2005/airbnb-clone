from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, Field, StringConstraints

from app.schemas.common import ORMModel

Email = Annotated[EmailStr, AfterValidator(str.lower)]


class UserPublic(ORMModel):
    id: int
    name: str
    avatar_url: str | None
    about: str | None
    is_superhost: bool
    created_at: datetime


class UserPrivate(UserPublic):
    email: str


class RegisterRequest(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    email: Email
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: Email
    password: str = Field(max_length=128)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPrivate
