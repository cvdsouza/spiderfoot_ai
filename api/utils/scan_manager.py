"""Scan management utilities extracted from sfwebui.py."""

import asyncio
import html
import logging
import multiprocessing as mp
import os
from copy import deepcopy

from sflib import SpiderFoot
from sfscan import startSpiderFootScanner
from spiderfoot import SpiderFootDb, SpiderFootHelpers
from api.services.module_categories import classify_modules
from api.services.task_publisher import publish_scan_task, pre_declare_result_queue, rabbitmq_available, RABBITMQ_URL

# Use an explicit spawn context rather than changing the global default.
# This avoids conflicts with objects (e.g. Queue) created in the default
# fork context on Linux.
_spawn_ctx = mp.get_context("spawn")

log = logging.getLogger(f"spiderfoot.{__name__}")


def clean_user_input(input_list: list) -> list:
    """Sanitize user input by escaping HTML, but preserving & and quotes.

    Args:
        input_list: list of strings to sanitize

    Returns:
        list of sanitized strings
    """
    ret = []
    for item in input_list:
        if not item:
            ret.append('')
            continue
        c = html.escape(item, True)
        c = c.replace("&amp;", "&").replace("&quot;", "\"")
        ret.append(c)
    return ret


async def launch_scan(
    config: dict,
    logging_queue,
    scan_name: str,
    scan_target: str,
    module_list: str = "",
    type_list: str = "",
    use_case: str = "",
) -> tuple[str, str]:
    """Launch a new scan in a subprocess.

    Returns:
        tuple of (status, scan_id_or_error_message)
    """
    scan_name = clean_user_input([scan_name])[0]
    scan_target = clean_user_input([scan_target])[0]

    if not scan_name:
        return ("ERROR", "Incorrect usage: scan name was not specified.")

    if not scan_target:
        return ("ERROR", "Incorrect usage: scan target was not specified.")

    if not type_list and not module_list and not use_case:
        return ("ERROR", "Incorrect usage: no modules specified for scan.")

    target_type = SpiderFootHelpers.targetTypeFromString(scan_target)
    if target_type is None:
        return ("ERROR", "Unrecognised target type.")

    cfg = deepcopy(config)
    sf = SpiderFoot(cfg)
    modlist = []

    # User selected modules
    if module_list:
        modlist = module_list.replace('module_', '').split(',')

    # User selected types
    if len(modlist) == 0 and type_list:
        typesx = type_list.replace('type_', '').split(',')
        modlist = sf.modulesProducing(typesx)
        newmods = deepcopy(modlist)
        newmodcpy = deepcopy(newmods)

        while len(newmodcpy) > 0:
            for etype in sf.eventsToModules(newmodcpy):
                xmods = sf.modulesProducing([etype])
                for mod in xmods:
                    if mod not in modlist:
                        modlist.append(mod)
                        newmods.append(mod)
            newmodcpy = deepcopy(newmods)
            newmods = []

    # User selected a use case
    if len(modlist) == 0 and use_case:
        use_case_lower = use_case.lower()
        for mod in config['__modules__']:
            if use_case_lower == 'all' or any(
                use_case_lower == g.lower() for g in config['__modules__'][mod].get('group', [])
            ):
                modlist.append(mod)

    if not modlist:
        return ("ERROR", "Incorrect usage: no modules specified for scan.")

    # Add mandatory storage module
    # Use RabbitMQ storage for distributed workers, direct DB for local scans
    if RABBITMQ_URL and rabbitmq_available():
        # Remote worker mode: use RabbitMQ results queue (stateless workers)
        if "sfp__stor_rabbitmq" not in modlist:
            modlist.append("sfp__stor_rabbitmq")
        # Remove sfp__stor_db if present (workers don't access DB directly)
        if "sfp__stor_db" in modlist:
            modlist.remove("sfp__stor_db")
    else:
        # Local mode: use direct DB storage (backward compatible)
        if "sfp__stor_db" not in modlist:
            modlist.append("sfp__stor_db")
    modlist.sort()

    # Remove stdout module
    if "sfp__stor_stdout" in modlist:
        modlist.remove("sfp__stor_stdout")

    # Normalize target
    if target_type in ["HUMAN_NAME", "USERNAME", "BITCOIN_ADDRESS"]:
        scan_target = scan_target.replace("\"", "")
    else:
        scan_target = scan_target.lower()

    scan_id = SpiderFootHelpers.genScanInstanceId()
    modlist_str = ','.join(modlist)

    # ── Try to dispatch to a distributed worker via RabbitMQ ──────────
    if RABBITMQ_URL and rabbitmq_available():
        queue_type = classify_modules(modlist_str)

        # Create scan instance in database BEFORE dispatching to worker
        # This allows the result consumer to start monitoring immediately
        import time
        dbh = SpiderFootDb(config)
        try:
            dbh.scanInstanceCreate(scan_id, scan_name, scan_target)
            dbh.scanInstanceSet(scan_id, started=time.time(), status='RUNNING')
        except Exception as e:
            log.error(f"Scan [{scan_id}] failed to create database record: {e}")
            return ("ERROR", f"Failed to create scan: {e}")

        task = {
            "scan_id": scan_id,
            "scan_name": scan_name,
            "scan_target": scan_target,
            "target_type": target_type,
            "module_list": modlist_str,
            "queue_type": queue_type,
            "api_url": os.environ.get('SPIDERFOOT_API_URL', 'http://localhost:5001'),
            "result_mode": "rabbitmq",  # Workers publish results to RabbitMQ (stateless)
        }
        # Pre-declare the result queue BEFORE dispatching so the topic
        # exchange can buffer events from the very first worker message.
        # Without this, messages published before ConsumerThread binds
        # its queue (up to 10 s later) are silently dropped.
        pre_declare_result_queue(scan_id)

        if publish_scan_task(task, queue_type):
            log.info(f"Scan [{scan_id}] dispatched to '{queue_type}' worker queue")
            return ("SUCCESS", scan_id)
        log.warning(f"Scan [{scan_id}] RabbitMQ publish failed — falling back to local subprocess")

    # ── Fallback: run scan in a local subprocess (existing behaviour) ──
    try:
        p = _spawn_ctx.Process(
            target=startSpiderFootScanner,
            args=(logging_queue, scan_name, scan_id, scan_target, target_type, modlist, cfg)
        )
        p.daemon = True
        p.start()
    except Exception as e:
        log.error(f"Scan [{scan_id}] failed: {e}")
        return ("ERROR", f"Scan [{scan_id}] failed: {e}")

    # Wait for the scan to initialize (non-blocking in async context)
    dbh = SpiderFootDb(config)
    for _ in range(30):  # max 30 seconds
        if dbh.scanInstanceGet(scan_id) is not None:
            return ("SUCCESS", scan_id)
        await asyncio.sleep(1)

    return ("SUCCESS", scan_id)
