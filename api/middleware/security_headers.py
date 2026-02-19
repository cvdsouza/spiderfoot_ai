"""Security headers middleware for FastAPI."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' blob:; "
            "style-src 'self' 'unsafe-inline'; "
            "base-uri 'self'; "
            "connect-src 'self' data:; "
            "frame-src 'self' data:; "
            "img-src 'self' data:;"
        )
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Server"] = "SpiderFoot"
        response.headers["Cache-Control"] = "must-revalidate"

        return response
