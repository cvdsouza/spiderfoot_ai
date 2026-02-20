# -*- coding: utf-8 -*-
"""Scan execution helper for distributed workers (Phase 11).

Workers call run_scan_task() with a task dict received from RabbitMQ.
The function runs the scan *in-process* (no double-fork needed — the
worker process itself is already a subprocess of the API server).

Task dict schema:
    {
        "scan_id":     str,
        "scan_name":   str,
        "scan_target": str,
        "target_type": str,
        "module_list": str,   # comma-separated, e.g. "sfp_dns,sfp_shodan"
        "queue_type":  str,   # "fast" | "slow"
        "api_url":     str,   # base URL of the SpiderFoot API server
        "result_mode": str,   # "direct" (shared SQLite) | future: "api"
    }
"""

import logging
import os
import time

log = logging.getLogger(__name__)


def run_scan_task(task: dict) -> None:
    """Execute a scan described by *task*.

    Imports are deferred so this module can be imported without a full
    SpiderFoot installation on the API server itself.

    Args:
        task: Scan task dict (see module docstring for schema).

    Raises:
        Exception: propagated to the caller so the worker can nack the message.
    """
    scan_id = task.get('scan_id', '<unknown>')
    scan_name = task.get('scan_name', '')
    scan_target = task.get('scan_target', '')
    target_type = task.get('target_type', '')
    module_list_str = task.get('module_list', '')

    log.info("[worker] Starting scan %s — target=%s modules=%s",
             scan_id, scan_target, module_list_str)

    # ── Imports (heavy — done once per task) ──────────────────────────
    from sflib import SpiderFoot  # noqa: PLC0415
    from sfscan import startSpiderFootScanner  # noqa: PLC0415
    from spiderfoot import SpiderFootDb  # noqa: PLC0415

    # ── Load config from DB ────────────────────────────────────────────
    # The data path is taken from the environment; workers must have the
    # same data path as the API server (shared volume in Docker).
    data_path = os.environ.get('SPIDERFOOT_DATA', '/var/lib/spiderfoot')
    db_path = os.path.join(data_path, 'spiderfoot.db')

    dbh = SpiderFootDb({'_database': db_path})

    # Build config dict the same way sfwebui / scan_manager does
    sf_cfg = {}
    db_cfg = dbh.configGet()
    if db_cfg:
        sf_cfg = SpiderFoot({}).configUnserialize(db_cfg, {})

    sf_cfg['_database'] = db_path

    # Load module metadata so SpiderFootScanner can resolve configs
    sf = SpiderFoot(sf_cfg)
    sf_cfg['__modules__'] = sf.modulesProducing([])  # loads all module meta

    modlist = [m.strip() for m in module_list_str.split(',') if m.strip()]

    # ── Run the scan in-process ────────────────────────────────────────
    # startSpiderFootScanner is normally called in a subprocess via
    # mp.Process; here the worker *is* the subprocess, so we call it
    # directly.  This matches the existing function signature.
    import queue as _queue
    logging_queue = _queue.Queue()

    try:
        startSpiderFootScanner(logging_queue, scan_name, scan_id,
                               scan_target, target_type, modlist, sf_cfg)
    except Exception as exc:
        log.error("[worker] Scan %s raised an exception: %s", scan_id, exc)
        raise

    log.info("[worker] Scan %s completed", scan_id)
