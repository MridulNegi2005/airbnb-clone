from dataclasses import dataclass
from io import BytesIO

from fastapi import HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError

_ACCEPTED_FORMATS = {"JPEG", "PNG", "WEBP"}
_WEBP_QUALITY = 82

# Pillow refuses larger images, which protects against decompression bombs.
Image.MAX_IMAGE_PIXELS = 40_000_000


@dataclass(frozen=True)
class ProcessedImage:
    data: bytes
    width: int
    height: int
    content_type: str = "image/webp"


def process_image(raw: bytes, max_dimension: int) -> ProcessedImage:
    """Validate an upload and re-encode it as WebP.

    Re-encoding drops every metadata block, so EXIF data such as GPS coordinates never
    reaches storage, and only real pixels from a known format are ever served.
    """
    try:
        with Image.open(BytesIO(raw)) as source:
            if source.format not in _ACCEPTED_FORMATS:
                raise _unsupported()
            source.load()
            image = ImageOps.exif_transpose(source)
            image.thumbnail((max_dimension, max_dimension))
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
            output = BytesIO()
            image.save(output, "WEBP", quality=_WEBP_QUALITY, method=4)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError):
        raise _unsupported() from None
    return ProcessedImage(output.getvalue(), image.width, image.height)


def _unsupported() -> HTTPException:
    return HTTPException(
        status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Upload a JPEG, PNG or WebP image"
    )
