import threading
import warnings
from dataclasses import dataclass
from io import BytesIO

from fastapi import HTTPException, status
from PIL import Image, ImageOps, UnidentifiedImageError

_ACCEPTED_FORMATS = ("JPEG", "PNG", "WEBP")
_WEBP_QUALITY = 82

# 16 megapixels (a 4000 x 4000 photo) is far more than a 2048 px output needs. A small,
# highly compressed file can declare huge dimensions; Pillow checks them on open, before
# decoding, and the warning it gives between 1x and 2x this limit is turned into an error.
Image.MAX_IMAGE_PIXELS = 16_000_000

# Decoding is memory-heavy; one image at a time keeps the container inside its memory limit.
# Callers wait briefly for the slot and otherwise get a 503, so a burst of uploads cannot
# tie up every worker thread.
_decode_slot = threading.Semaphore(1)
_SLOT_WAIT_SECONDS = 3


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
    if not _decode_slot.acquire(timeout=_SLOT_WAIT_SECONDS):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="We are busy processing photos. Try again in a few seconds.",
            headers={"Retry-After": "5"},
        )
    try:
        return _process(raw, max_dimension)
    finally:
        _decode_slot.release()


def _process(raw: bytes, max_dimension: int) -> ProcessedImage:
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            with Image.open(BytesIO(raw), formats=_ACCEPTED_FORMATS) as source:
                # Let JPEGs decode at reduced scale, and shrink before rotating, so no
                # full-size copy of the image is ever made.
                source.draft("RGB", (max_dimension, max_dimension))
                source.thumbnail((max_dimension, max_dimension))
                image = ImageOps.exif_transpose(source)
                if image.mode not in ("RGB", "RGBA"):
                    image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
                output = BytesIO()
                image.save(output, "WEBP", quality=_WEBP_QUALITY, method=4)
        except (Image.DecompressionBombError, Image.DecompressionBombWarning):
            raise HTTPException(
                status.HTTP_413_CONTENT_TOO_LARGE, detail="Image is larger than 16 megapixels"
            ) from None
        except (UnidentifiedImageError, OSError, SyntaxError):
            raise _unsupported() from None
    return ProcessedImage(output.getvalue(), image.width, image.height)


def _unsupported() -> HTTPException:
    return HTTPException(
        status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Upload a JPEG, PNG or WebP image"
    )
