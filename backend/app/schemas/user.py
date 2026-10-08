from datetime import datetime
from typing import Annotated, Self

from pydantic import (
    AfterValidator,
    BaseModel,
    EmailStr,
    Field,
    HttpUrl,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.schemas.common import ORMModel

Email = Annotated[EmailStr, AfterValidator(str.lower)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Language = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
About = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class UserPublic(ORMModel):
    id: int
    name: str
    avatar_url: str | None
    about: str | None
    is_superhost: bool
    is_identity_verified: bool
    created_at: datetime


class UserPrivate(UserPublic):
    email: str
    work: str | None
    languages: list[str]
    lives_in: str | None
    has_password: bool
    has_google: bool


class PublicProfile(UserPublic):
    work: str | None
    languages: list[str]
    lives_in: str | None
    listing_count: int
    host_review_count: int
    host_rating: float | None
    guest_review_count: int


class ProfileUpdate(BaseModel):
    """Partial update: only the fields present in the request change."""

    name: Name | None = None
    about: About | None = None
    work: ShortText | None = None
    languages: list[Language] | None = Field(default=None, max_length=10)
    lives_in: ShortText | None = None
    avatar_url: HttpUrl | None = None

    @model_validator(mode="after")
    def name_cannot_be_cleared(self) -> Self:
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be empty")
        return self

    @field_validator("languages")
    @classmethod
    def clear_languages_with_empty_list(cls, value: list[str] | None) -> list[str]:
        return value or []


class RegisterRequest(BaseModel):
    name: Name
    email: Email
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: Email
    password: str = Field(max_length=128)


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=1, max_length=4096)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPrivate
