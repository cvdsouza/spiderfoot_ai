"""FastAPI dependency injection providers."""

from fastapi import Request

from sflib import SpiderFoot
from spiderfoot import SpiderFootDb


def get_config(request: Request) -> dict:
    """Get the SpiderFoot configuration from app state."""
    return request.app.state.config


def get_default_config(request: Request) -> dict:
    """Get the default SpiderFoot configuration from app state."""
    return request.app.state.default_config


def get_db(request: Request) -> SpiderFootDb:
    """Create a SpiderFootDb instance per request.

    This creates the SQLite connection inside the current thread,
    which is critical because SQLite objects cannot cross threads.
    FastAPI runs sync endpoints in a worker thread pool, so the
    connection must be opened here — not in an async dependency.
    """
    config = request.app.state.config
    return SpiderFootDb(config)


def get_sf(request: Request) -> SpiderFoot:
    """Create a SpiderFoot instance per request."""
    config = request.app.state.config
    return SpiderFoot(config)


def get_logging_queue(request: Request):
    """Get the logging queue from app state."""
    return request.app.state.logging_queue
