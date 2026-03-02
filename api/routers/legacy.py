"""Legacy URL compatibility router.

Maps the old flat CherryPy endpoints to the new RESTful routes.
This ensures sfcli.py and any existing integrations continue to work
during the migration period.
"""

from typing import Any

from fastapi import APIRouter, Depends

from api.dependencies import get_config, get_db, get_logging_queue
from api.routers import scans, results, modules, correlation_rules, system, settings, exports
from spiderfoot import SpiderFootDb

router = APIRouter(tags=["legacy"])


# System
@router.get("/ping")
def legacy_ping() -> list:
    return system.ping()


@router.post("/query")
def legacy_query(query: str, dbh: SpiderFootDb = Depends(get_db)):
    return system.query(query, dbh)


@router.post("/vacuum")
@router.get("/vacuum")
def legacy_vacuum(dbh: SpiderFootDb = Depends(get_db)) -> list:
    return system.vacuum(dbh)


# Modules / types / rules
@router.get("/modules")
def legacy_modules(config: dict = Depends(get_config)) -> list[dict]:
    return modules.list_modules(config)


@router.get("/eventtypes")
def legacy_event_types(dbh: SpiderFootDb = Depends(get_db)) -> list[list]:
    return modules.list_event_types(dbh)


@router.get("/correlationrules")
def legacy_correlation_rules(config: dict = Depends(get_config), dbh: SpiderFootDb = Depends(get_db)) -> list:
    return correlation_rules.list_correlation_rules(config, dbh)


# Scans
@router.get("/scanlist")
def legacy_scan_list(dbh: SpiderFootDb = Depends(get_db)) -> list:
    return scans.list_scans(dbh)


@router.get("/scanstatus")
def legacy_scan_status(id: str, dbh: SpiderFootDb = Depends(get_db)) -> list:
    return scans.scan_status(id, dbh)


@router.post("/startscan")
@router.get("/startscan")
async def legacy_start_scan(
    scanname: str = "",
    scantarget: str = "",
    modulelist: str = "",
    typelist: str = "",
    usecase: str = "",
    config: dict = Depends(get_config),
    logging_queue=Depends(get_logging_queue),
) -> list:
    from api.models.scans import ScanCreate
    scan = ScanCreate(
        scan_name=scanname,
        scan_target=scantarget,
        module_list=modulelist,
        type_list=typelist,
        use_case=usecase,
    )
    return await scans.create_scan(scan, config, logging_queue)


@router.get("/stopscan")
def legacy_stop_scan(id: str, dbh: SpiderFootDb = Depends(get_db)) -> str:
    return scans.stop_scan(id, dbh)


@router.get("/scandelete")
def legacy_delete_scan(id: str, dbh: SpiderFootDb = Depends(get_db)) -> list:
    return scans.delete_scan(id, dbh)


@router.get("/scanopts")
def legacy_scan_opts(id: str, config: dict = Depends(get_config), dbh: SpiderFootDb = Depends(get_db)) -> dict:
    return scans.scan_config(id, config, dbh)


@router.get("/scanlog")
def legacy_scan_log(
    id: str,
    limit: str | None = None,
    rowId: str | None = None,
    reverse: str | None = None,
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    return scans.scan_log(id, limit, rowId, reverse, dbh)


@router.get("/scanerrors")
def legacy_scan_errors(id: str, limit: str | None = None, dbh: SpiderFootDb = Depends(get_db)) -> list:
    return scans.scan_errors(id, limit, dbh)


@router.get("/scanhistory")
def legacy_scan_history(id: str, dbh: SpiderFootDb = Depends(get_db)) -> Any:
    return scans.scan_history(id, dbh)


# Results
@router.get("/scansummary")
def legacy_scan_summary(id: str, by: str, dbh: SpiderFootDb = Depends(get_db)) -> list:
    return results.scan_summary(id, by, dbh)


@router.get("/scancorrelations")
def legacy_scan_correlations(id: str, dbh: SpiderFootDb = Depends(get_db)) -> list:
    return results.scan_correlations(id, dbh)


@router.get("/scaneventresults")
def legacy_scan_event_results(
    id: str,
    eventType: str | None = None,
    filterfp: bool = False,
    correlationId: str | None = None,
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    return results.scan_event_results(id, eventType, filterfp, correlationId, dbh)


@router.get("/scaneventresultsunique")
def legacy_scan_event_results_unique(
    id: str,
    eventType: str = "",
    filterfp: bool = False,
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    return results.scan_event_results_unique(id, eventType, filterfp, dbh)


@router.get("/search")
def legacy_search(
    id: str | None = None,
    eventType: str | None = None,
    value: str | None = None,
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    return results.search(id, eventType, value, dbh)


@router.get("/scanelementtypediscovery")
def legacy_element_type_discovery(
    id: str,
    eventType: str,
    dbh: SpiderFootDb = Depends(get_db),
) -> dict:
    return results.scan_element_type_discovery(id, eventType, dbh)


@router.get("/scanviz")
def legacy_scan_viz(id: str, gexf: str = "0", dbh: SpiderFootDb = Depends(get_db)) -> Any:
    return results.scan_graph(id, gexf, dbh)


# Settings
@router.get("/optsraw")
def legacy_opts_raw(config: dict = Depends(get_config)) -> list:
    return settings.get_settings(config)


@router.post("/savesettingsraw")
def legacy_save_settings_raw(
    allopts: str,
    token: str = "",
    config: dict = Depends(get_config),
    default_config: dict = Depends(get_db),
    dbh: SpiderFootDb = Depends(get_db),
) -> list:
    import json
    try:
        opts = json.loads(allopts)
    except Exception:
        return ["ERROR", "Invalid JSON"]
    return settings.save_settings(opts, config, default_config, dbh)


# Exports
@router.get("/scanexportlogs")
def legacy_export_logs(id: str, dialect: str = "excel", dbh: SpiderFootDb = Depends(get_db)):
    return exports.export_scan_logs(id, dialect, dbh)


@router.get("/scancorrelationsexport")
def legacy_export_correlations(
    id: str,
    filetype: str = "csv",
    dialect: str = "excel",
    dbh: SpiderFootDb = Depends(get_db),
):
    return exports.export_correlations(id, filetype, dialect, dbh)


@router.get("/scaneventresultexport")
def legacy_export_events(
    id: str,
    type: str = "ALL",
    filetype: str = "csv",
    dialect: str = "excel",
    dbh: SpiderFootDb = Depends(get_db),
):
    return exports.export_events(id, type, filetype, dialect, dbh)


@router.get("/scanexportjsonmulti")
def legacy_export_json_multi(ids: str, dbh: SpiderFootDb = Depends(get_db)):
    return exports.export_json_multi(ids, dbh)


@router.get("/scanvizmulti")
def legacy_export_graph_multi(ids: str, dbh: SpiderFootDb = Depends(get_db)):
    return exports.export_graph_multi(ids, dbh)
