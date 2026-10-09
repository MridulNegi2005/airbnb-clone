import re
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import get_settings
from app.rate_limit import client_key, global_limiter
from app.routers import (
    auth,
    bookings,
    catalog,
    conversations,
    host,
    listings,
    uploads,
    users,
    wishlists,
)
from app.security import dummy_password_hash

_MULTIPART_OVERHEAD_BYTES = 64 * 1024

Next = Callable[[Request], Awaitable[Response]]


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    dummy_password_hash()
    yield


def _route_path(request: Request) -> str:
    # Starlette keeps the deployment prefix (root_path) in scope["path"]; routing ignores it.
    return request.scope["path"].removeprefix(request.scope.get("root_path", ""))


async def validation_error_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    # Leave out the rejected input: values like NaN cannot be encoded as JSON.
    errors = [
        {"loc": error["loc"], "msg": error["msg"], "type": error["type"]} for error in exc.errors()
    ]
    return JSONResponse({"detail": errors}, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT)


async def limit_requests(request: Request, call_next: Next) -> Response:
    if _route_path(request).startswith("/api/") and not global_limiter.allow(client_key(request)):
        return JSONResponse(
            {"detail": "Too many requests. Try again in a minute."},
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            headers={"Retry-After": str(global_limiter.window_seconds)},
        )
    return await call_next(request)


# Public reads that never depend on the caller, with how long Cloudflare may keep them.
_PUBLIC_READS = (
    (
        re.compile(r"/api/(categories|amenities|service-area)"),
        "public, max-age=300, s-maxage=86400",
    ),
    (
        re.compile(r"/api/listings/\d+/(booked-dates|quote)"),
        "public, max-age=0, s-maxage=10, stale-while-revalidate=60",
    ),
    (
        re.compile(r"/api/(listings(/\d+(/reviews)?)?|users/\d+(/listings)?)"),
        "public, max-age=0, s-maxage=30, stale-while-revalidate=300",
    ),
)


async def cache_public_reads(request: Request, call_next: Next) -> Response:
    response = await call_next(request)
    if request.method != "GET" or response.status_code != 200 or "authorization" in request.headers:
        return response
    path = _route_path(request)
    for pattern, policy in _PUBLIC_READS:
        if pattern.fullmatch(path):
            response.headers["Cache-Control"] = policy
            # One cached copy serves every visitor, so it cannot name a single origin.
            response.headers["Access-Control-Allow-Origin"] = "*"
            break
    return response


async def guard_uploads(request: Request, call_next: Next) -> Response:
    # Reject oversized uploads before the multipart parser spools the body to disk.
    path = _route_path(request)
    if request.method == "POST" and path == "/api/uploads":
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
    if path.startswith("/media/"):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'none'"
    return response


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(title="Airbnb Clone API", version="2.0.0", lifespan=lifespan)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    # Registered before CORS so that CORS wraps them and their errors still carry CORS headers.
    app.middleware("http")(guard_uploads)
    app.middleware("http")(limit_requests)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Retry-After"],
    )
    app.middleware("http")(cache_public_reads)

    for module in (
        auth,
        catalog,
        listings,
        bookings,
        wishlists,
        host,
        uploads,
        users,
        conversations,
    ):
        app.include_router(module.router, prefix="/api")

    if settings.storage_backend == "local":
        media_dir = Path(settings.local_media_dir)
        media_dir.mkdir(parents=True, exist_ok=True)
        app.mount("/media", StaticFiles(directory=media_dir), name="media")

    @app.get("/api/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
