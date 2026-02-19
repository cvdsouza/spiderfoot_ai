"""FastAPI application factory for SpiderFoot."""

import logging
import multiprocessing as mp
import os
from contextlib import asynccontextmanager
from copy import deepcopy
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.middleware.security_headers import SecurityHeadersMiddleware
from api.routers import ai_analysis, auth, correlation_rules, exports, legacy, modules, results, scans, settings, system, users
from sflib import SpiderFoot
from spiderfoot import SpiderFootCorrelator, SpiderFootDb, SpiderFootHelpers, __version__
from spiderfoot.logger import logListenerSetup, logWorkerSetup

log = logging.getLogger(f"spiderfoot.{__name__}")


def _load_all_correlation_rules(correlations_dir: str, dbh: SpiderFootDb) -> list:
    """Load and merge correlation rules from files and database.

    File-based rules are tagged with _source='builtin', DB rules with _source='user'.
    If a user rule_id conflicts with a built-in rule_id, the user rule is skipped.

    Returns:
        list: merged parsed correlation rules
    """
    # Load file-based rules
    try:
        builtin_rules_raw = SpiderFootHelpers.loadCorrelationRulesRaw(correlations_dir, ['template.yaml'])
    except BaseException as e:
        log.critical(f"Failed to load correlation rules from files: {e}", exc_info=True)
        raise

    builtin_rule_ids = set(builtin_rules_raw.keys())

    # Load user-defined rules from DB
    user_rules_raw = {}
    try:
        user_rows = dbh.correlationRuleGetAll()
        for row in user_rows:
            # row: [id, rule_id, yaml_content, enabled, created, updated]
            rule_id = row[1]
            enabled = row[3]
            if not enabled:
                continue
            if rule_id in builtin_rule_ids:
                log.warning(f"User rule '{rule_id}' conflicts with built-in rule; skipping.")
                continue
            user_rules_raw[rule_id] = row[2]
    except Exception as e:
        log.warning(f"Failed to load user correlation rules from DB: {e}")

    # Merge: built-in rules + user rules
    merged_raw = {}
    merged_raw.update(builtin_rules_raw)
    merged_raw.update(user_rules_raw)

    if not merged_raw:
        return []

    try:
        correlator = SpiderFootCorrelator(dbh, merged_raw)
        rules = correlator.get_ruleset()
    except Exception as e:
        log.critical(f"Failure initializing correlation rules: {e}", exc_info=True)
        raise

    # Tag each rule with source
    for rule in rules:
        rule_id = rule.get('id', '')
        if rule_id in user_rules_raw:
            rule['_source'] = 'user'
        else:
            rule['_source'] = 'builtin'

    return rules


def reload_correlation_rules(app: FastAPI) -> list:
    """Reload all correlation rules (called after CRUD operations).

    Creates a fresh DB connection, reloads file + DB rules, and updates app state.

    Returns:
        list: the reloaded correlation rules
    """
    config = app.state.config
    correlations_dir = app.state.correlations_dir
    dbh = SpiderFootDb(config)
    rules = _load_all_correlation_rules(correlations_dir, dbh)
    config['__correlationrules__'] = rules
    app.state.correlation_rules = rules
    log.info(f"Correlation rules reloaded: {len(rules)} rules active.")
    return rules


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize shared state on startup."""
    config = app.state.init_config
    logging_queue = app.state.init_logging_queue

    # Load modules
    try:
        mod_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/modules/'
        sf_modules = SpiderFootHelpers.loadModulesAsDict(mod_dir, [
            'sfp_template.py',
            'sfp_threatcrowd.py',   # Service defunct (invalid SSL cert)
            'sfp_phishstats.py',    # Service unreliable (consistently times out)
        ])
    except BaseException as e:
        log.critical(f"Failed to load modules: {e}", exc_info=True)
        raise

    if not sf_modules:
        log.critical(f"No modules found in modules directory: {mod_dir}")
        raise RuntimeError("No modules found")

    # Initialize database
    try:
        dbh = SpiderFootDb(config)
    except Exception as e:
        log.critical(f"Failed to initialize database: {e}", exc_info=True)
        raise

    # Load and merge correlation rules (file-based + user-defined from DB)
    correlations_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/correlations/'
    sf_correlation_rules = _load_all_correlation_rules(correlations_dir, dbh)

    # Store in config (matching sf.py pattern)
    config['__modules__'] = sf_modules
    config['__correlationrules__'] = sf_correlation_rules

    # Seed AI configuration defaults so configUnserialize picks up saved values
    config.setdefault('_ai_provider', 'openai')
    config.setdefault('_ai_openai_key', '')
    config.setdefault('_ai_anthropic_key', '')
    config.setdefault('_ai_default_mode', 'quick')

    # Load saved configuration
    default_config = deepcopy(config)
    sf = SpiderFoot(default_config)
    dbh_init = SpiderFootDb(default_config, init=True)
    live_config = sf.configUnserialize(dbh_init.configGet(), default_config)

    # Bootstrap admin user from environment variables
    admin_user = os.environ.get("SPIDERFOOT_ADMIN_USER", "")
    admin_pass = os.environ.get("SPIDERFOOT_ADMIN_PASSWORD", "")
    if admin_user and admin_pass:
        existing = dbh.userGetByUsername(admin_user)
        if not existing:
            from api.middleware.auth import pwd_context
            password_hash = pwd_context.hash(admin_pass)
            user_id = dbh.userCreate(admin_user, password_hash, display_name="Administrator")
            admin_role_id = dbh.roleGetByName("administrator")
            if admin_role_id:
                dbh.userRolesSet(user_id, [admin_role_id])
            log.info(f"Created admin user '{admin_user}' from environment variables")
        else:
            log.debug(f"Admin user '{admin_user}' already exists, skipping bootstrap")

    # Set up app state
    app.state.config = live_config
    app.state.default_config = default_config
    app.state.logging_queue = logging_queue
    app.state.modules = sf_modules
    app.state.correlation_rules = sf_correlation_rules
    app.state.correlations_dir = correlations_dir

    log.info(f"SpiderFoot {__version__} API ready. {len(sf_modules)} modules loaded, {len(sf_correlation_rules)} correlation rules.")

    yield

    # Cleanup on shutdown
    log.info("SpiderFoot API shutting down.")


def create_app(
    config: dict | None = None,
    web_config: dict | None = None,
    logging_queue=None,
) -> FastAPI:
    """Create and configure the FastAPI application.

    Args:
        config: SpiderFoot configuration dict
        web_config: web server configuration (host, port, root, cors_origins)
        logging_queue: multiprocessing queue for logging

    Returns:
        Configured FastAPI application
    """
    app = FastAPI(
        title="SpiderFoot",
        description="Open Source Intelligence Automation API",
        version=__version__,
        lifespan=lifespan,
    )

    # Store initialization data for lifespan handler
    app.state.init_config = config or {}
    app.state.init_logging_queue = logging_queue or mp.get_context("spawn").Queue()

    # CORS middleware
    cors_origins = ["*"]
    if web_config:
        configured_origins = web_config.get('cors_origins', [])
        if configured_origins:
            cors_origins = configured_origins

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Security headers
    app.add_middleware(SecurityHeadersMiddleware)

    # Mount API routers under /api/v1
    app.include_router(scans.router, prefix="/api/v1")
    app.include_router(results.router, prefix="/api/v1")
    app.include_router(exports.router, prefix="/api/v1")
    app.include_router(settings.router, prefix="/api/v1")
    app.include_router(modules.router, prefix="/api/v1")
    app.include_router(system.router, prefix="/api/v1")
    app.include_router(auth.router, prefix="/api/v1")
    app.include_router(ai_analysis.router, prefix="/api/v1")
    app.include_router(correlation_rules.router, prefix="/api/v1")
    app.include_router(users.router, prefix="/api/v1")

    # Legacy compatibility routes (flat URLs for sfcli.py)
    app.include_router(legacy.router)

    # Static file serving for the React SPA
    base_dir = Path(__file__).resolve().parent.parent
    static_dir = base_dir / "frontend" / "dist"
    if static_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(static_dir / "assets")), name="static")

        @app.get("/{path:path}")
        async def spa_fallback(path: str):
            """Serve the React SPA for all non-API routes."""
            file_path = static_dir / path
            if file_path.is_file():
                return FileResponse(str(file_path))
            return FileResponse(str(static_dir / "index.html"))

    return app
