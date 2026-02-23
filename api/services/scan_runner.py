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

import json
import logging
import logging.handlers
import os
import ssl

log = logging.getLogger(__name__)


class _RabbitMQLogHandler(logging.Handler):
    """Forwards scan log records to the scan.results RabbitMQ exchange.

    Log messages share the same per-scan queue as events so the API's
    ConsumerThread receives and writes them to the database in real-time.

    Without this, logWorkerSetup() adds a QueueHandler to the spiderfoot
    logger but no QueueListener ever consumes from logging_queue — every
    log record is silently discarded and the UI shows "No log entries".

    Message schema added to the existing result message format:
        { "scan_id": str, "event": null, "lifecycle": null,
          "log": { "level": str, "message": str,
                   "component": str, "time": float } }
    """

    def __init__(self, scan_id: str, rabbitmq_url: str, exchange: str = 'scan.results'):
        super().__init__()
        self.scan_id = scan_id
        self.rabbitmq_url = rabbitmq_url
        self.exchange = exchange
        self._conn = None
        self._ch = None

    def _ssl_options(self):
        if not self.rabbitmq_url.startswith('amqps://'):
            return None
        try:
            import pika
            ca_cert = os.environ.get('RABBITMQ_CA_CERT', '/etc/rabbitmq/certs/ca.crt')
            ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
            ctx.check_hostname = False
            if os.path.isfile(ca_cert):
                ctx.load_verify_locations(ca_cert)
                ctx.verify_mode = ssl.CERT_REQUIRED
            else:
                ctx.verify_mode = ssl.CERT_NONE
            return pika.SSLOptions(ctx)
        except Exception:
            return None

    def _ensure_connected(self) -> bool:
        """Lazily connect/reconnect. Called from the QueueListener thread."""
        if self._conn and not self._conn.is_closed:
            return True
        try:
            import pika
            params = pika.URLParameters(self.rabbitmq_url)
            params.socket_timeout = 5
            # Disable heartbeats for the same reason as sfp__stor_rabbitmq:
            # this connection only ever calls basic_publish() and never runs
            # process_data_events(), so heartbeat frames are never sent.
            params.heartbeat = 0
            ssl_opts = self._ssl_options()
            if ssl_opts is not None:
                params.ssl_options = ssl_opts
            self._conn = pika.BlockingConnection(params)
            self._ch = self._conn.channel()
            self._ch.exchange_declare(
                exchange=self.exchange, exchange_type='topic', durable=True
            )
            return True
        except Exception:
            self._conn = None
            self._ch = None
            return False

    def emit(self, record: logging.LogRecord) -> None:
        scan_id = getattr(record, 'scanId', None)
        if not scan_id:
            return  # Only forward scan-scoped records (those with a scanId)
        if not self._ensure_connected():
            return
        try:
            import pika
            level = 'STATUS' if record.levelname == 'INFO' else record.levelname
            msg = {
                'scan_id': scan_id,
                'event': None,
                'lifecycle': None,
                'log': {
                    'level': level,
                    'message': record.getMessage(),
                    'component': getattr(record, 'module', None) or 'SpiderFoot',
                    'time': record.created,
                },
            }
            self._ch.basic_publish(
                exchange=self.exchange,
                routing_key=scan_id,
                body=json.dumps(msg).encode('utf-8'),
                properties=pika.BasicProperties(
                    delivery_mode=2,
                    content_type='application/json',
                ),
            )
        except Exception:
            # Mark connection dead; next emit() will reconnect
            self._conn = None
            self._ch = None

    def close(self) -> None:
        if self._conn and not self._conn.is_closed:
            try:
                self._conn.close()
            except Exception:
                pass
        super().close()


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
    from spiderfoot import SpiderFootDb, SpiderFootHelpers  # noqa: PLC0415

    # ── Load config from DB ────────────────────────────────────────────
    # The data path is taken from the environment; workers must have the
    # same data path as the API server (shared volume in Docker).
    data_path = os.environ.get('SPIDERFOOT_DATA', '/var/lib/spiderfoot')
    db_path = os.path.join(data_path, 'spiderfoot.db')

    # Per-scan DB: isolated from the shared spiderfoot.db so that a task
    # redelivered after a worker crash (RabbitMQ requeues unacked messages)
    # doesn't fail with "Unable to create scan instance in database" because
    # sfscan.py's scanInstanceCreate() does a plain INSERT that raises on
    # duplicate scan IDs.  Results still go to the API via RabbitMQ — this
    # local DB is only used for sfscan.py's internal bookkeeping.
    scan_db_path = os.path.join(data_path, f'spiderfoot_{scan_id}.db')

    # Remove any leftover from a previous attempt at this task (redelivery case)
    if os.path.exists(scan_db_path):
        try:
            os.unlink(scan_db_path)
            log.info("[worker] Removed stale scan DB for %s (task redelivery)", scan_id)
        except OSError as e:
            log.warning("[worker] Could not remove stale scan DB for %s: %s", scan_id, e)

    # Build default config (same as sf.py) to provide fallback values
    default_config = {
        '_debug': False,
        '_maxthreads': 3,
        '__logging': True,
        '__outputfilter': None,
        '_useragent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:62.0) Gecko/20100101 Firefox/62.0',
        '_dnsserver': '',
        '_fetchtimeout': 5,
        '_internettlds': 'https://publicsuffix.org/list/effective_tld_names.dat',
        '_internettlds_cache': 72,
        '_genericusers': ",".join(SpiderFootHelpers.usernamesFromWordlists(['generic-usernames'])),
        '__database': db_path,
        '__modules__': {},  # Will be populated below
        '__correlationrules__': [],  # Empty list, not None - prevents len() errors
        '_socks1type': '',
        '_socks2addr': '',
        '_socks3port': '',
        '_socks4user': '',
        '_socks5pwd': '',
    }

    dbh = SpiderFootDb(default_config)

    # Load saved configuration from DB, merging with defaults
    db_cfg = dbh.configGet()
    if db_cfg:
        sf_cfg = SpiderFoot(default_config).configUnserialize(db_cfg, default_config)
    else:
        sf_cfg = default_config.copy()

    # Point the scanner at the per-scan DB, not the shared one
    sf_cfg['__database'] = scan_db_path

    # Load module metadata as a dict (same as API server does)
    # The modules directory is at the root of the project, not in the api directory
    # __file__ is /home/spiderfoot/api/services/scan_runner.py
    # We need to go up three levels to get to /home/spiderfoot
    mod_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        'modules'
    )
    sf_cfg['__modules__'] = SpiderFootHelpers.loadModulesAsDict(mod_dir, [
        'sfp_template.py',
        'sfp_threatcrowd.py',   # Service defunct
        'sfp_phishstats.py',    # Service unreliable
    ])

    modlist = [m.strip() for m in module_list_str.split(',') if m.strip()]

    # ── Run the scan in-process ────────────────────────────────────────
    # startSpiderFootScanner is normally called in a subprocess via
    # mp.Process; here the worker *is* the subprocess, so we call it
    # directly.  This matches the existing function signature.
    import queue as _queue
    logging_queue = _queue.Queue()

    # Route worker log entries back to the API via RabbitMQ so they appear
    # in the scan log tab in real-time.  Without this, logWorkerSetup()
    # adds a QueueHandler but no QueueListener ever drains logging_queue —
    # every record is silently discarded and the UI shows "No log entries".
    rabbitmq_url = os.environ.get('RABBITMQ_URL', '')
    listener = None
    rmq_log_handler = None
    if rabbitmq_url:
        rmq_log_handler = _RabbitMQLogHandler(scan_id, rabbitmq_url)
        listener = logging.handlers.QueueListener(
            logging_queue,
            rmq_log_handler,
            respect_handler_level=True,
        )
        listener.start()

    try:
        startSpiderFootScanner(logging_queue, scan_name, scan_id,
                               scan_target, target_type, modlist, sf_cfg)
    except Exception as exc:
        log.error("[worker] Scan %s raised an exception: %s", scan_id, exc)
        raise
    finally:
        if listener:
            listener.stop()
        if rmq_log_handler:
            rmq_log_handler.close()
        # Remove the per-scan DB — all results were forwarded via RabbitMQ,
        # so the local file has no further value.
        try:
            if os.path.exists(scan_db_path):
                os.unlink(scan_db_path)
        except OSError:
            pass

    log.info("[worker] Scan %s completed", scan_id)
