"""System API routes (ping, query, vacuum)."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_db
from api.middleware.auth import require_permission
from spiderfoot import SpiderFootDb, __version__

log = logging.getLogger(f"spiderfoot.{__name__}")

router = APIRouter(tags=["system"])


@router.get("/ping")
def ping() -> list:
    """Health check endpoint."""
    return ["SUCCESS", __version__]


@router.post("/query")
def query(query: str, user: dict = Depends(require_permission("settings", "update")), dbh: SpiderFootDb = Depends(get_db)):
    """Execute a read-only SQL query against the database.

    Only SELECT queries are allowed.
    """
    if not query:
        raise HTTPException(status_code=400, detail="No query specified")

    if not query.strip().upper().startswith("SELECT"):
        raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")

    try:
        result = dbh.dbhQuery(query)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {e}")


@router.post("/vacuum")
def vacuum(user: dict = Depends(require_permission("settings", "update")), dbh: SpiderFootDb = Depends(get_db)) -> list:
    """Vacuum the database to reclaim space."""
    try:
        if dbh.vacuumDB():
            return ["SUCCESS", ""]
        return ["ERROR", "Vacuuming the database failed"]
    except Exception as e:
        return ["ERROR", f"Vacuuming the database failed: {e}"]
