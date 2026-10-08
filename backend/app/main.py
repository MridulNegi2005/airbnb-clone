from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.models import create_tables
from app.routers import auth, bookings, catalog, host, listings, uploads, wishlist

_MULTIPART_OVERHEAD_BYTES = 64 * 1024


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    create_tables()
    yield


async def guard_uploads(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    # Reject oversized uploads before the multipart parser spools the body to disk.
    if request.method == "POST" and request.url.path == "/api/uploads":
        length = request.headers.get("content-length", "")
        if not length.isdigit():
            return JSONResponse(
                {"detail": "Content-Length header is required"},
                status_code=status.HTTP_411_LENGTH_REQUIRED,
            )
        if int(length) > get_settings().max_upload_bytes + _MULTIPART_OVERHEAD_BYTES:
            return JSONResponse(
                {"detail": "Image is too large"}, status_code=status.HTTP_413_CONTENT_TOO_LARGE
            )

    response = await call_next(request)
    if request.url.path.startswith("/uploads/"):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'none'"
    return response


def create_app() -> FastAPI:
    settings = get_settings()
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    app = FastAPI(title="Airbnb Clone API", version="1.0.0", lifespan=lifespan)
    # Registered before CORS so that CORS wraps it and error responses still carry CORS headers.
    app.middleware("http")(guard_uploads)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    for module in (auth, catalog, listings, bookings, wishlist, host, uploads):
        app.include_router(module.router, prefix="/api")
    app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

    @app.get("/api/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
