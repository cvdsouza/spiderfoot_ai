"""FastAPI dependency injection providers."""

from typing import Generator

from fastapi import Request

from sflib import SpiderFoot
from spiderfoot import SpiderFootDb


def get_config(request: Request) -> dict:
    """Get the SpiderFoot configuration from app state."""
    return request.app.state.config


def get_default_config(request: Request) -> dict:
    """Get the default SpiderFoot configuration from app state."""
    return request.app.state.default_config


def get_db(request: Request) -> Generator[SpiderFootDb, None, None]:
    """Draw one PostgreSQL connection from the pool and yield a SpiderFootDb.

    Commits on success, rolls back on exception, returns the connection to the
    pool when the request is complete.  FastAPI handles generator-style
    dependencies automatically when used with Depends().
    """
    pool = request.app.state.db_pool
    conn = pool.getconn()
    try:
        dbh = SpiderFootDb(conn=conn)
        yield dbh
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def get_sf(request: Request) -> SpiderFoot:
    """Create a SpiderFoot instance per request."""
    config = request.app.state.config
    return SpiderFoot(config)


def get_logging_queue(request: Request):
    """Get the logging queue from app state."""
    return request.app.state.logging_queue
