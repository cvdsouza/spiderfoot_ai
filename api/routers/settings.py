"""Settings API routes."""

import json
import logging
from copy import deepcopy
from typing import Any

from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import Response

from api.dependencies import get_config, get_default_config, get_db
from api.middleware.auth import require_permission
from sflib import SpiderFoot
from spiderfoot import SpiderFootDb

log = logging.getLogger(f"spiderfoot.{__name__}")

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings(user: dict = Depends(require_permission("settings", "read")), config: dict = Depends(get_config)) -> list:
    """Get all settings (global + per-module)."""
    retdata = {}

    for opt in sorted(config.keys()):
        if opt.startswith("_") and not opt.startswith("__"):
            retdata[f"global.{opt}"] = config[opt]

    for mod_name in sorted(config.get('__modules__', {}).keys()):
        if "__" in mod_name:
            continue
        mod_opts = config['__modules__'][mod_name].get('opts', {})
        for opt in sorted(mod_opts.keys()):
            if opt.startswith("_"):
                continue
            retdata[f"module.{mod_name}.{opt}"] = mod_opts[opt]

    return ["SUCCESS", {"data": retdata}]


@router.put("")
def save_settings(
    allopts: dict[str, Any],
    user: dict = Depends(require_permission("settings", "update")),
    config: dict = Depends(get_config),
    default_config: dict = Depends(get_default_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Save settings to database."""
    try:
        sf = SpiderFoot(config)

        # Merge new options into the config
        new_config = deepcopy(config)
        for opt_key, opt_val in allopts.items():
            if opt_key.startswith("global."):
                real_key = opt_key.replace("global.", "")
                new_config[real_key] = opt_val
            elif opt_key.startswith("module."):
                parts = opt_key.split(".", 2)
                if len(parts) == 3:
                    _, mod_name, mod_opt = parts
                    if mod_name in new_config.get('__modules__', {}):
                        if 'opts' not in new_config['__modules__'][mod_name]:
                            new_config['__modules__'][mod_name]['opts'] = {}
                        new_config['__modules__'][mod_name]['opts'][mod_opt] = opt_val

        dbh.configSet(sf.configSerialize(new_config, default_config))

        # Update the live config
        config.update(new_config)
    except Exception as e:
        log.error(f"Failed to save settings: {e}")
        return ["ERROR", f"Failed to save settings: {e}"]

    return ["SUCCESS", ""]


@router.get("/export")
def export_settings(
    pattern: str = "",
    user: dict = Depends(require_permission("settings", "read")),
    config: dict = Depends(get_config),
    default_config: dict = Depends(get_default_config),
):
    """Export settings as a file."""
    sf = SpiderFoot(config)
    conf = sf.configSerialize(config, default_config)

    # Filter by pattern if specified
    if pattern:
        conf = {k: v for k, v in conf.items() if pattern.lower() in k.lower()}

    content = json.dumps(conf, indent=2)

    return Response(
        content=content.encode('utf-8'),
        media_type="application/json",
        headers={
            "Content-Disposition": "attachment; filename=SpiderFoot-settings.json",
            "Pragma": "no-cache",
        },
    )


@router.post("/import")
async def import_settings(
    config_file: UploadFile = File(...),
    user: dict = Depends(require_permission("settings", "update")),
    config: dict = Depends(get_config),
    default_config: dict = Depends(get_default_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Import settings from a file."""
    try:
        contents = await config_file.read()
        allopts = json.loads(contents.decode('utf-8'))
    except Exception as e:
        return ["ERROR", f"Failed to parse config file: {e}"]

    try:
        sf = SpiderFoot(config)
        dbh.configSet(allopts)
        config.update(sf.configUnserialize(dbh.configGet(), default_config))
    except Exception as e:
        return ["ERROR", f"Failed to import settings: {e}"]

    return ["SUCCESS", ""]


@router.post("/reset")
def reset_settings(
    user: dict = Depends(require_permission("settings", "update")),
    config: dict = Depends(get_config),
    default_config: dict = Depends(get_default_config),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    """Reset all settings to factory defaults."""
    try:
        SpiderFoot(default_config)
        dbh.configClear()
        config.update(deepcopy(default_config))
    except Exception as e:
        return ["ERROR", f"Failed to reset settings: {e}"]

    return ["SUCCESS", ""]
