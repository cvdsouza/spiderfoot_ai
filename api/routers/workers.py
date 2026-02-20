"""Distributed worker registry API routes (Phase 11)."""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.dependencies import get_db
from api.middleware.auth import require_permission
from spiderfoot import SpiderFootDb

log = logging.getLogger(f"spiderfoot.{__name__}")

router = APIRouter(tags=["workers"])


# ── Pydantic models ────────────────────────────────────────────────────────────

class WorkerHeartbeatRequest(BaseModel):
    worker_id: str
    name: str
    host: str
    queue_type: str = 'fast'
    status: str = 'idle'
    current_scan: str = ''


class WorkerResponse(BaseModel):
    id: str
    name: str
    host: str
    queue_type: str
    status: str
    current_scan: str
    last_seen: int
    registered: int


# ── Helpers ────────────────────────────────────────────────────────────────────

def _row_to_response(row: tuple) -> WorkerResponse:
    """Convert a tbl_workers DB row to WorkerResponse."""
    return WorkerResponse(
        id=row[0],
        name=row[1],
        host=row[2],
        queue_type=row[3],
        status=row[4],
        current_scan=row[5],
        last_seen=row[6],
        registered=row[7],
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/workers")
def list_workers(
    user: dict = Depends(require_permission("settings", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list[WorkerResponse]:
    """List all registered workers.  Requires settings:read permission."""
    # Mark stale workers as offline before returning
    try:
        dbh.workerOfflineStale(max_age_seconds=60)
    except Exception:
        pass
    rows = dbh.workerList()
    return [_row_to_response(r) for r in rows]


@router.get("/workers/{worker_id}")
def get_worker(
    worker_id: str,
    user: dict = Depends(require_permission("settings", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> WorkerResponse:
    """Get a single worker by ID."""
    row = dbh.workerGet(worker_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Worker not found")
    return _row_to_response(row)


@router.post("/workers/heartbeat", status_code=204)
def worker_heartbeat(
    body: WorkerHeartbeatRequest,
    dbh: SpiderFootDb = Depends(get_db),
) -> None:
    """Worker heartbeat endpoint — called every ~15 s by each worker.

    No authentication required (internal endpoint; workers don't have
    user credentials).  Rate limiting / firewall rules should restrict
    access in production.
    """
    try:
        # Register if not already known
        existing = dbh.workerGet(body.worker_id)
        if existing is None:
            dbh.workerRegister(
                body.worker_id,
                body.name,
                body.host,
                body.queue_type,
            )
        dbh.workerHeartbeat(body.worker_id, body.status, body.current_scan)
    except Exception as exc:
        log.error("Worker heartbeat error: %s", exc)
        raise HTTPException(status_code=500, detail="Heartbeat failed") from exc
