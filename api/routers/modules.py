"""Modules and event types API routes."""

import logging

from fastapi import APIRouter, Depends

from api.dependencies import get_config, get_db
from api.middleware.auth import require_permission
from spiderfoot import SpiderFootDb

log = logging.getLogger(f"spiderfoot.{__name__}")

router = APIRouter(tags=["modules"])


@router.get("/modules")
def list_modules(user: dict = Depends(require_permission("modules", "read")), config: dict = Depends(get_config)) -> list[dict]:
    """List all available modules."""
    retdata = []
    modules = config.get('__modules__', {})

    for mod_name in sorted(modules.keys()):
        if "__" in mod_name:
            continue
        retdata.append({
            'name': mod_name,
            'descr': modules[mod_name].get('descr', ''),
        })

    return retdata


@router.get("/event-types")
def list_event_types(user: dict = Depends(require_permission("modules", "read")), dbh: SpiderFootDb = Depends(get_db)) -> list[list]:
    """List all available event types."""
    typedata = dbh.eventTypes()
    retdata = []

    for row in typedata:
        retdata.append([row[1], row[0]])

    return sorted(retdata, key=lambda x: x[0])
