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

import contextlib
import json
import logging
import logging.handlers
import os
import ssl
import threading

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
            with contextlib.suppress(Exception):
                self._conn.close()
        super().close()


def _abort_bridge(scan_id: str, api_db_path: str, scan_db_path: str,
                  stop_event: threading.Event) -> None:
    """Mirror ABORT-REQUESTED from the API DB to the per-scan DB.

    The SpiderFoot scanner polls its own per-scan DB for the abort flag
    (sfscan.py: waitForThreads checks scanInstanceGet every ~10 iterations).
    The stop API endpoint writes ABORT-REQUESTED to the shared API DB
    (spiderfoot.db).  Without this bridge the two DBs are out of sync and
    clicking Stop in the UI has no effect on the running scan.
    """
    from spiderfoot import SpiderFootDb  # noqa: PLC0415

    cfg = {'__database': api_db_path, '__modules__': {}, '__correlationrules__': []}
    try:
        api_dbh = SpiderFootDb(cfg)
    except Exception as e:
        log.warning("[worker] Abort bridge: cannot open API DB: %s", e)
        return

    abort_signalled = False  # True once we've confirmed the write landed

    while not stop_event.wait(timeout=3):
        try:
            row = api_dbh.scanInstanceGet(scan_id)
            should_abort = (row is None) or (row[5] == 'ABORT-REQUESTED')
            if should_abort:
                reason = "deleted from API DB" if row is None else "ABORT-REQUESTED"
                # Propagate to the per-scan DB so sfscan.py detects it.
                # Use raw SQLite so we can check rowcount — SpiderFootDb.scanInstanceSet
                # uses UPDATE which silently writes 0 rows if scanInstanceCreate hasn't
                # run yet (race condition at scan startup).
                try:
                    import sqlite3 as _sqlite3  # noqa: PLC0415
                    _conn = _sqlite3.connect(scan_db_path, timeout=5)
                    cur = _conn.execute(
                        "UPDATE tbl_scan_instance SET status = ? WHERE guid = ?",
                        ('ABORT-REQUESTED', scan_id),
                    )
                    _conn.commit()
                    rows_updated = cur.rowcount
                    _conn.close()
                    if rows_updated > 0:
                        log.info("[worker] Abort bridged to per-scan DB for scan %s (%s)", scan_id, reason)
                        abort_signalled = True
                    else:
                        log.debug("[worker] Abort bridge: per-scan DB record not ready yet for %s, retrying…", scan_id)
                except Exception as e:
                    log.warning("[worker] Abort bridge: cannot write per-scan DB: %s", e)

                if abort_signalled:
                    break  # Write confirmed — scanner will self-abort and set ABORTED
                # else: loop again; scanInstanceCreate hasn't run yet
        except Exception as e:
            log.debug("[worker] Abort bridge poll error: %s", e)


def _publish_lifecycle(scan_id: str, lifecycle: str, rabbitmq_url: str) -> None:
    """Publish a lifecycle message (ABORTED / FAILED) to the results exchange.

    Called from run_scan_task()'s finally block when the scan ended in a
    non-FINISHED state (abort or error).  sfp__stor_rabbitmq.finished() is
    only called during normal scan completion; for aborted/failed scans it is
    never invoked, so we publish the lifecycle here instead.
    """
    if not rabbitmq_url:
        return
    try:
        import pika  # noqa: PLC0415

        params = pika.URLParameters(rabbitmq_url)
        params.socket_timeout = 5
        params.heartbeat = 0

        ssl_opts = None
        if rabbitmq_url.startswith('amqps://'):
            ca_cert = os.environ.get('RABBITMQ_CA_CERT', '/etc/rabbitmq/certs/ca.crt')
            ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
            ctx.check_hostname = False
            if os.path.isfile(ca_cert):
                ctx.load_verify_locations(ca_cert)
                ctx.verify_mode = ssl.CERT_REQUIRED
            else:
                ctx.verify_mode = ssl.CERT_NONE
            ssl_opts = pika.SSLOptions(ctx)
        if ssl_opts:
            params.ssl_options = ssl_opts

        conn = pika.BlockingConnection(params)
        ch = conn.channel()
        ch.exchange_declare(exchange='scan.results', exchange_type='topic', durable=True)
        ch.basic_publish(
            exchange='scan.results',
            routing_key=scan_id,
            body=json.dumps({'scan_id': scan_id, 'event': None, 'lifecycle': lifecycle}).encode(),
            properties=pika.BasicProperties(delivery_mode=2, content_type='application/json'),
        )
        conn.close()
        log.info("[worker] Published %s lifecycle for scan %s", lifecycle, scan_id)
    except Exception as e:
        log.error("[worker] Failed to publish %s lifecycle for scan %s: %s", lifecycle, scan_id, e)


def _build_task_config(task: dict, SpiderFoot, SpiderFootDb, SpiderFootHelpers,
                       data_path: str) -> tuple:
    """Build scanner config and per-scan DB path, removing any stale per-scan DB.

    Returns:
        tuple: (sf_cfg, scan_db_path, db_path)
    """
    scan_id = task.get('scan_id', '<unknown>')
    db_path = os.path.join(data_path, 'spiderfoot.db')
    scan_db_path = os.path.join(data_path, f'spiderfoot_{scan_id}.db')

    if os.path.exists(scan_db_path):
        try:
            os.unlink(scan_db_path)
            log.info("[worker] Removed stale scan DB for %s (task redelivery)", scan_id)
        except OSError as e:
            log.warning("[worker] Could not remove stale scan DB for %s: %s", scan_id, e)

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
        '__modules__': {},
        '__correlationrules__': [],
        '_socks1type': '',
        '_socks2addr': '',
        '_socks3port': '',
        '_socks4user': '',
        '_socks5pwd': '',
    }

    dbh = SpiderFootDb(default_config)
    db_cfg = dbh.configGet()
    if db_cfg:
        sf_cfg = SpiderFoot(default_config).configUnserialize(db_cfg, default_config)
    else:
        sf_cfg = default_config.copy()

    sf_cfg['__database'] = scan_db_path

    mod_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        'modules'
    )
    sf_cfg['__modules__'] = SpiderFootHelpers.loadModulesAsDict(mod_dir, [
        'sfp_template.py',
        'sfp_threatcrowd.py',
        'sfp_phishstats.py',
    ])

    return sf_cfg, scan_db_path, db_path


def _start_log_forwarding(scan_id: str, rabbitmq_url: str) -> tuple:
    """Set up RabbitMQ log forwarding for a scan.

    Returns:
        tuple: (logging_queue, listener, rmq_log_handler) — listener and
            handler are None when rabbitmq_url is empty.
    """
    import queue as _queue  # noqa: PLC0415
    logging_queue = _queue.Queue()
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
    return logging_queue, listener, rmq_log_handler


def _handle_scan_completion(scan_id: str, scan_db_path: str, SpiderFootDb,
                            rabbitmq_url: str, listener, rmq_log_handler) -> None:
    """Tear down log forwarding and publish terminal lifecycle if needed.

    Called from run_scan_task()'s finally block to stop the log listener and
    check whether ABORTED or FAILED must be published to RabbitMQ.
    """
    if listener:
        listener.stop()
    if rmq_log_handler:
        rmq_log_handler.close()

    if os.path.exists(scan_db_path):
        try:
            _chk = SpiderFootDb({'__database': scan_db_path, '__modules__': {},
                                 '__correlationrules__': []})
            row = _chk.scanInstanceGet(scan_id)
            final_status = row[5] if row else None
            if final_status == 'ABORTED':
                _publish_lifecycle(scan_id, 'ABORTED', rabbitmq_url)
            elif final_status == 'ERROR-FAILED':
                _publish_lifecycle(scan_id, 'FAILED', rabbitmq_url)
        except Exception as e:
            log.error("[worker] Could not read final scan status from per-scan DB: %s", e)

    with contextlib.suppress(OSError):
        if os.path.exists(scan_db_path):
            os.unlink(scan_db_path)


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

    log.info("[worker] Starting scan %s \u2014 target=%s modules=%s",
             scan_id, scan_target, module_list_str)

    # Imports (deferred — done once per task)
    from sflib import SpiderFoot  # noqa: PLC0415
    from sfscan import startSpiderFootScanner  # noqa: PLC0415
    from spiderfoot import SpiderFootDb, SpiderFootHelpers  # noqa: PLC0415

    data_path = os.environ.get('SPIDERFOOT_DATA', '/var/lib/spiderfoot')
    sf_cfg, scan_db_path, db_path = _build_task_config(
        task, SpiderFoot, SpiderFootDb, SpiderFootHelpers, data_path,
    )
    modlist = [m.strip() for m in module_list_str.split(',') if m.strip()]

    # Start abort bridge: polls shared API DB and propagates ABORT-REQUESTED
    # to the per-scan DB so sfscan.py detects it.
    abort_stop = threading.Event()
    abort_thread = threading.Thread(
        target=_abort_bridge,
        args=(scan_id, db_path, scan_db_path, abort_stop),
        name=f"AbortBridge-{scan_id}",
        daemon=True,
    )
    abort_thread.start()

    rabbitmq_url = os.environ.get('RABBITMQ_URL', '')
    logging_queue, listener, rmq_log_handler = _start_log_forwarding(scan_id, rabbitmq_url)

    try:
        startSpiderFootScanner(logging_queue, scan_name, scan_id,
                               scan_target, target_type, modlist, sf_cfg)
    except Exception as exc:
        log.error("[worker] Scan %s raised an exception: %s", scan_id, exc)
        raise
    finally:
        abort_stop.set()
        _handle_scan_completion(
            scan_id, scan_db_path, SpiderFootDb, rabbitmq_url, listener, rmq_log_handler,
        )

    log.info("[worker] Scan %s completed", scan_id)
