"""Scan results, events, correlations, and search API routes."""

import html
import json
import logging
import time
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from api.dependencies import get_config, get_db
from api.middleware.auth import require_permission
from spiderfoot import SpiderFootDb, SpiderFootHelpers

log = logging.getLogger(f"spiderfoot.{__name__}")

router = APIRouter(tags=["results"])


@router.get("/scans/{scan_id}/summary")
def scan_summary(scan_id: str, by: str, user: dict = Depends(require_permission("results", "read")), dbh: SpiderFootDb = Depends(get_db)) -> list:
    """Get scan result summary."""
    retdata = []

    try:
        scandata = dbh.scanResultSummary(scan_id, by)
    except Exception:
        return retdata

    try:
        statusdata = dbh.scanInstanceGet(scan_id)
    except Exception:
        return retdata

    for row in scandata:
        if row[0] == "ROOT":
            continue
        lastseen = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(row[2]))
        retdata.append([row[0], row[1], lastseen, row[3], row[4], statusdata[5]])

    return retdata


@router.get("/scans/{scan_id}/correlations")
def scan_correlations(scan_id: str, user: dict = Depends(require_permission("results", "read")), dbh: SpiderFootDb = Depends(get_db)) -> list:
    """Get correlation results for a scan."""
    retdata = []

    try:
        corrdata = dbh.scanCorrelationList(scan_id)
    except Exception:
        return retdata

    for row in corrdata:
        retdata.append([row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7]])

    return retdata


@router.post("/scans/{scan_id}/correlations/run", status_code=202)
def run_scan_correlations(
    scan_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_permission("results", "write")),
    dbh: SpiderFootDb = Depends(get_db),
    config: dict = Depends(get_config),
) -> dict:
    """(Re-)run correlation rules for a completed scan.

    Returns 202 Accepted immediately; correlations run in the background.
    Useful when correlations were skipped (e.g. ConsumerThread died before
    receiving FINISHED) or after correlation rules are updated.
    """
    from api.services.result_consumer import _run_correlations  # noqa: PLC0415

    scan = dbh.scanInstanceGet(scan_id)
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Clear existing correlations so results are fresh, then commit
    # immediately so the background task starts with a clean slate and
    # no open write transaction blocks other DB writers.
    with dbh.dbhLock:
        dbh.dbh.execute(
            "DELETE FROM tbl_scan_correlation_results_events WHERE correlation_id IN "
            "(SELECT id FROM tbl_scan_correlation_results WHERE scan_instance_id=?)",
            (scan_id,)
        )
        dbh.dbh.execute(
            "DELETE FROM tbl_scan_correlation_results WHERE scan_instance_id=?",
            (scan_id,)
        )
        dbh.conn.commit()

    # Schedule the correlation run as a background task so the HTTP
    # response returns immediately (correlations can take several minutes
    # for large scans).
    background_tasks.add_task(_run_correlations, dbh, config, scan_id)

    return {"scan_id": scan_id, "status": "correlation_run_started"}


@router.get("/scans/{scan_id}/events")
def scan_event_results(
    scan_id: str,
    eventType: str | None = None,
    filterfp: bool = False,
    correlationId: str | None = None,
    user: dict = Depends(require_permission("results", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Get all event results for a scan."""
    retdata = []

    if not eventType:
        eventType = 'ALL'

    try:
        data = dbh.scanResultEvent(scan_id, eventType, filterfp, correlationId=correlationId)
    except Exception:
        return retdata

    for row in data:
        lastseen = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(row[0]))
        retdata.append([
            lastseen,
            html.escape(row[1]),
            html.escape(row[2]),
            row[3],
            row[5],
            row[6],
            row[7],
            row[8],
            row[13],
            row[14],
            row[4]
        ])

    return retdata


@router.get("/scans/{scan_id}/events/paged")
def scan_event_results_paged(
    scan_id: str,
    eventType: str | None = None,
    filterfp: bool = False,
    correlationId: str | None = None,
    search: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(require_permission("results", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> dict:
    """Get paginated event results for a scan with optional text search."""
    if not eventType:
        eventType = 'ALL'

    try:
        data = dbh.scanResultEvent(scan_id, eventType, filterfp, correlationId=correlationId)
    except Exception:
        return {"total": 0, "data": []}

    if search:
        search_lower = search.lower()
        data = [row for row in data if search_lower in str(row[1]).lower()]

    total = len(data)
    paged = data[offset:offset + limit]

    retdata = []
    for row in paged:
        lastseen = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(row[0]))
        retdata.append([
            lastseen,
            html.escape(row[1]),
            html.escape(row[2]),
            row[3],
            row[5],
            row[6],
            row[7],
            row[8],
            row[13],
            row[14],
            row[4]
        ])

    return {"total": total, "data": retdata}


@router.get("/scans/{scan_id}/events/unique")
def scan_event_results_unique(
    scan_id: str,
    eventType: str,
    filterfp: bool = False,
    user: dict = Depends(require_permission("results", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Get unique event results for a scan."""
    retdata = []

    try:
        data = dbh.scanResultEventUnique(scan_id, eventType, filterfp)
    except Exception:
        return retdata

    for row in data:
        escaped = html.escape(row[0])
        retdata.append([escaped, row[1], row[2]])

    return retdata


@router.get("/scans/{scan_id}/discovery")
def scan_element_type_discovery(
    scan_id: str,
    eventType: str,
    user: dict = Depends(require_permission("results", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> dict:
    """Get element type discovery tree for visualization."""
    pc = {}
    datamap = {}
    retdata = {}

    try:
        leafSet = dbh.scanResultEvent(scan_id, eventType)
        [datamap, pc] = dbh.scanElementSourcesAll(scan_id, leafSet)
    except Exception:
        return retdata

    if 'ROOT' in pc:
        del pc['ROOT']

    retdata['tree'] = SpiderFootHelpers.dataParentChildToTree(pc)
    retdata['data'] = datamap

    return retdata


@router.get("/scans/{scan_id}/graph")
def scan_graph(
    scan_id: str,
    gexf: str = "0",
    user: dict = Depends(require_permission("results", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> Any:
    """Get scan visualization graph in JSON or GEXF format."""
    try:
        data = dbh.scanResultEvent(scan_id, filterFp=True)
    except Exception:
        raise HTTPException(status_code=404, detail="Scan not found") from None

    res = dbh.scanInstanceGet(scan_id)
    if not res:
        raise HTTPException(status_code=404, detail="Scan not found")

    root = res[1]

    if gexf == "1":
        return SpiderFootHelpers.buildGraphGexf([root], "SpiderFoot Export", data)

    if not data:
        return {"nodes": [], "edges": []}

    return json.loads(SpiderFootHelpers.buildGraphJson([root], data))


@router.get("/search")
def search(
    id: str | None = None,
    eventType: str | None = None,
    value: str | None = None,
    user: dict = Depends(require_permission("results", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Search scan results."""
    retdata = []

    if not id and not eventType and not value:
        return retdata

    if not value:
        value = ''

    regex = ""
    if value.startswith("/") and value.endswith("/"):
        regex = value[1:len(value) - 1]
        value = ""

    value = value.replace('*', '%')
    if value in [None, ""] and regex in [None, ""]:
        value = "%"
        regex = ""

    criteria = {
        'scan_id': id or '',
        'type': eventType or '',
        'value': value or '',
        'regex': regex or '',
    }

    try:
        data = dbh.search(criteria)
    except Exception:
        return retdata

    for row in data:
        lastseen = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(row[0]))
        escapeddata = html.escape(row[1])
        escapedsrc = html.escape(row[2])
        retdata.append([
            lastseen, escapeddata, escapedsrc,
            row[3], row[5], row[6], row[7], row[8], row[10],
            row[11], row[4], row[13], row[14]
        ])

    return retdata


@router.put("/scans/{scan_id}/false-positives")
def set_false_positive(
    scan_id: str,
    resultids: str,
    fp: str,
    user: dict = Depends(require_permission("results", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Mark results as false positive."""
    if not scan_id:
        raise HTTPException(status_code=400, detail="No scan specified")

    res = dbh.scanInstanceGet(scan_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} does not exist")

    if res[5] not in ("ABORTED", "FINISHED", "ERROR-FAILED"):
        return ["WARNING", "Scan not yet completed. Cannot set false positives."]

    try:
        ids = json.loads(resultids)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid resultids format") from None

    # Get all child elements
    allIds = list(ids)
    try:
        children = dbh.scanElementChildrenAll(scan_id, ids)
        allIds.extend(children)
    except Exception:
        pass

    try:
        dbh.scanResultsUpdateFP(scan_id, allIds, fp)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update false positives: {e}") from e

    return ["SUCCESS", ""]


@router.get("/scans/{scan_id}/history")
def scan_history(scan_id: str, user: dict = Depends(require_permission("results", "read")), dbh: SpiderFootDb = Depends(get_db)) -> Any:
    """Get scan result history."""
    if not scan_id:
        raise HTTPException(status_code=404, detail="No scan specified")

    try:
        return dbh.scanResultHistory(scan_id)
    except Exception:
        return []
