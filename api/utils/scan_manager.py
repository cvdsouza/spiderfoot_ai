"""Scan management utilities extracted from sfwebui.py."""

import asyncio
import html
import logging
import multiprocessing as mp
from copy import deepcopy

from sflib import SpiderFoot
from sfscan import startSpiderFootScanner
from spiderfoot import SpiderFootDb, SpiderFootHelpers

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
