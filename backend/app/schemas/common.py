from typing import Annotated, Any, Self

from pydantic import BaseModel, ConfigDict, Field

MAX_ID = 2**31 - 1

Id = Annotated[int, Field(ge=1, le=MAX_ID)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class PageParams(BaseModel):
    page: int = Field(default=1, ge=1, le=10_000)
    page_size: int = Field(default=20, ge=1, le=50)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class Page[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int
    has_more: bool

    @classmethod
    def build(cls, items: list[T], total: int, params: PageParams, **extra: Any) -> Self:
        return cls(
            items=items,
            total=total,
            page=params.page,
            page_size=params.page_size,
            has_more=params.offset + len(items) < total,
            **extra,
        )
