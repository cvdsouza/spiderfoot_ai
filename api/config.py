"""FastAPI application configuration."""

from pydantic import BaseModel


class WebConfig(BaseModel):
    """Web server configuration."""
    host: str = "127.0.0.1"
    port: int = 5001
    root: str = "/"
    cors_origins: list[str] = []
