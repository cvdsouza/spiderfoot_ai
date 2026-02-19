"""Scan management API routes."""

import html
import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from api.dependencies import get_config, get_db, get_logging_queue
from api.middleware.auth import require_permission
from api.models.scans import ScanCreate
from api.utils.scan_manager import launch_scan
from spiderfoot import SpiderFootDb

log = logging.getLogger(f"spiderfoot.{__name__}")

router = APIRouter(prefix="/scans", tags=["scans"])


@router.get("")
def list_scans(user: dict = Depends(require_permission("scans", "read")), dbh: SpiderFootDb = Depends(get_db)) -> list:
    """List all scans."""
    data = dbh.scanInstanceList()
    retdata = []

    for row in data:
        created = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(row[3]))
        riskmatrix = {"HIGH": 0, "MEDIUM": 0, "LOW": 0, "INFO": 0}
        correlations = dbh.scanCorrelationSummary(row[0], by="risk")
        if correlations:
            for c in correlations:
                riskmatrix[c[0]] = c[1]

        started = "Not yet" if row[4] == 0 else time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(row[4]))
        finished = "Not yet" if row[5] == 0 else time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(row[5]))

        retdata.append([row[0], row[1], row[2], created, started, finished, row[6], row[7], riskmatrix])

    return retdata


@router.get("/{scan_id}/status")
def scan_status(scan_id: str, user: dict = Depends(require_permission("scans", "read")), dbh: SpiderFootDb = Depends(get_db)) -> list:
    """Get scan status."""
    data = dbh.scanInstanceGet(scan_id)
    if not data:
        return []

    created = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(data[2]))
    started = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(data[3]))
    ended = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(data[4]))

    riskmatrix = {"HIGH": 0, "MEDIUM": 0, "LOW": 0, "INFO": 0}
    correlations = dbh.scanCorrelationSummary(scan_id, by="risk")
    if correlations:
        for c in correlations:
            riskmatrix[c[0]] = c[1]

    return [data[0], data[1], created, started, ended, data[5], riskmatrix]


@router.post("")
async def create_scan(
    scan: ScanCreate,
    user: dict = Depends(require_permission("scans", "create")),
    config: dict = Depends(get_config),
    logging_queue=Depends(get_logging_queue),
) -> list:
    """Start a new scan."""
    status, result = await launch_scan(
        config=config,
        logging_queue=logging_queue,
        scan_name=scan.scan_name,
        scan_target=scan.scan_target,
        module_list=scan.module_list,
        type_list=scan.type_list,
        use_case=scan.use_case,
    )

    if status == "ERROR":
        raise HTTPException(status_code=400, detail=result)

    return ["SUCCESS", result]


@router.post("/{scan_id}/stop")
def stop_scan(scan_id: str, user: dict = Depends(require_permission("scans", "update")), dbh: SpiderFootDb = Depends(get_db)) -> str:
    """Stop a running scan."""
    ids = scan_id.split(',')

    for sid in ids:
        res = dbh.scanInstanceGet(sid)
        if not res:
            raise HTTPException(status_code=404, detail=f"Scan {sid} does not exist")

        scan_status = res[5]
        if scan_status == "FINISHED":
            raise HTTPException(status_code=400, detail=f"Scan {sid} has already finished.")
        if scan_status == "ABORTED":
            raise HTTPException(status_code=400, detail=f"Scan {sid} has already aborted.")
        if scan_status not in ("RUNNING", "STARTING"):
            raise HTTPException(
                status_code=400,
                detail=f"The running scan is currently in the state '{scan_status}', please try again later or restart SpiderFoot."
            )

    for sid in ids:
        dbh.scanInstanceSet(sid, status="ABORT-REQUESTED")

    return ""


@router.delete("/{scan_id}")
def delete_scan(scan_id: str, user: dict = Depends(require_permission("scans", "delete")), dbh: SpiderFootDb = Depends(get_db)) -> list:
    """Delete a scan."""
    ids = scan_id.split(',')

    for sid in ids:
        res = dbh.scanInstanceGet(sid)
        if not res:
            raise HTTPException(status_code=404, detail=f"Scan {sid} does not exist")

        scan_status = res[5]
        if scan_status in ("RUNNING", "STARTING", "STARTED", "INITIALIZING"):
            raise HTTPException(status_code=400, detail=f"Scan {sid} is {scan_status}. Please stop the scan first.")

    for sid in ids:
        dbh.scanInstanceDelete(sid)

    return ["SUCCESS", ""]


@router.post("/{scan_id}/rerun")
async def rerun_scan(
    scan_id: str,
    user: dict = Depends(require_permission("scans", "create")),
    config: dict = Depends(get_config),
    dbh: SpiderFootDb = Depends(get_db),
    logging_queue=Depends(get_logging_queue),
) -> list:
    """Re-run a previous scan with the same configuration."""
    res = dbh.scanInstanceGet(scan_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} does not exist")

    scan_config = dbh.scanConfigGet(scan_id)
    if not scan_config:
        raise HTTPException(status_code=404, detail=f"Scan configuration not found for {scan_id}")

    scan_name = res[0]
    scan_target = res[1]

    # Extract module list from config
    modlist = scan_config.get('_modulesenabled', '').split(',')
    if not modlist or modlist == ['']:
        raise HTTPException(status_code=400, detail="No modules found in scan configuration")

    status, result = await launch_scan(
        config=config,
        logging_queue=logging_queue,
        scan_name=scan_name,
        scan_target=scan_target,
        module_list=','.join(modlist),
    )

    if status == "ERROR":
        raise HTTPException(status_code=400, detail=result)

    return ["SUCCESS", result]


@router.get("/{scan_id}/config")
def scan_config(scan_id: str, user: dict = Depends(require_permission("scans", "read")), config: dict = Depends(get_config), dbh: SpiderFootDb = Depends(get_db)) -> dict:
    """Get scan configuration."""
    res = dbh.scanInstanceGet(scan_id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Scan {scan_id} does not exist")

    created = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(res[2]))
    started = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(res[3]))
    ended = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(res[4]))

    scan_cfg = dbh.scanConfigGet(scan_id)
    configdesc = {}

    for key in scan_cfg:
        if key.startswith("_"):
            configdesc[key] = config.get('__globaloptdescs__', {}).get(key, "")
        else:
            parts = key.split(":")
            if len(parts) == 2:
                mod_name, mod_opt = parts
                if mod_name in config.get('__modules__', {}):
                    configdesc[key] = config['__modules__'][mod_name].get('optdescs', {}).get(mod_opt, "")

    return {
        'meta': [res[0], res[1], created, started, ended, res[5]],
        'config': scan_cfg,
        'configdesc': configdesc,
    }


@router.get("/{scan_id}/log")
def scan_log(
    scan_id: str,
    limit: str | None = None,
    rowId: str | None = None,
    reverse: str | None = None,
    user: dict = Depends(require_permission("scans", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Get scan log entries."""
    retdata = []
    try:
        data = dbh.scanLogs(scan_id, limit, rowId, reverse)
    except Exception:
        return retdata

    for row in data:
        generated = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(row[0] / 1000))
        retdata.append([generated, row[1], row[2], html.escape(row[3]), row[4]])

    return retdata


@router.get("/{scan_id}/errors")
def scan_errors(
    scan_id: str,
    limit: str | None = None,
    user: dict = Depends(require_permission("scans", "read")),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Get scan errors."""
    retdata = []
    try:
        data = dbh.scanErrors(scan_id, limit)
    except Exception:
        return retdata

    for row in data:
        generated = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(row[0] / 1000))
        retdata.append([generated, row[1], html.escape(str(row[2]))])

    return retdata


@router.get("/{scan_id}/history")
def scan_history(scan_id: str, user: dict = Depends(require_permission("scans", "read")), dbh: SpiderFootDb = Depends(get_db)) -> Any:
    """Get scan result history."""
    if not scan_id:
        raise HTTPException(status_code=404, detail="No scan specified")

    try:
        return dbh.scanResultHistory(scan_id)
    except Exception:
        return []
