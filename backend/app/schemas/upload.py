from app.schemas.common import ORMModel


class UploadOut(ORMModel):
    id: int
    url: str
    width: int
    height: int
