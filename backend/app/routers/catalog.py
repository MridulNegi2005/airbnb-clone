from fastapi import APIRouter
from sqlalchemy import select

from app.deps import DbSession
from app.models import Amenity, Category
from app.schemas.listing import AmenityOut, CategoryOut

router = APIRouter(tags=["catalog"])


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: DbSession) -> list[Category]:
    return list(db.scalars(select(Category).order_by(Category.id)))


@router.get("/amenities", response_model=list[AmenityOut])
def list_amenities(db: DbSession) -> list[Amenity]:
    return list(db.scalars(select(Amenity).order_by(Amenity.name)))
