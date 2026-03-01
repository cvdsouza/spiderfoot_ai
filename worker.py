#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SpiderFoot distributed scan worker (Phase 11).

Connects to RabbitMQ, pulls scan tasks from a queue, and executes each
scan using the unmodified SpiderFootScanner engine.

Usage
-----
    # Uses env vars (RABBITMQ_URL, SPIDERFOOT_WORKER_NAME, etc.)
    python worker.py

    # Override queue type
    python worker.py --queue fast
    python worker.py --queue slow

    # Run two scans concurrently on this worker
    python worker.py --queue fast --concurrency 2

Environment variables
---------------------
    RABBITMQ_URL              AMQPS URL, e.g. amqps://user:pass@rabbitmq:5671/
                              Use amqp:// (no s) only for local dev without TLS.
    RABBITMQ_CA_CERT          Path to the CA certificate for TLS verification
                              (default: /etc/rabbitmq/certs/ca.crt)
    SPIDERFOOT_DATA           Path to SpiderFoot data dir (default /var/lib/spiderfoot)
    SPIDERFOOT_WORKER_NAME    Human-readable name shown in the UI (default: hostname)
    SPIDERFOOT_API_URL        Base URL of the API server for heartbeat calls
                              (default http://localhost:5001)
"""

import argparse
import contextlib
import json
import logging
import os
import signal
import socket
import ssl
import sys
import threading
import time
import uuid

import pika

log = logging.getLogger("sf.worker")


# ── Queue names ────────────────────────────────────────────────────────────────

QUEUE_FAST = 'scans.fast'
QUEUE_SLOW = 'scans.slow'

RABBITMQ_URL = os.environ.get('RABBITMQ_URL', '')
RABBITMQ_CA_CERT = os.environ.get('RABBITMQ_CA_CERT', '/etc/rabbitmq/certs/ca.crt')
WORKER_ID = str(uuid.uuid4())
WORKER_NAME = os.environ.get('SPIDERFOOT_WORKER_NAME', socket.gethostname())
WORKER_HOST = socket.gethostname()
API_URL = os.environ.get('SPIDERFOOT_API_URL', 'http://localhost:5001')

_shutdown = threading.Event()


# ── TLS helper ─────────────────────────────────────────────────────────────────

def _ssl_options():
    """Return a pika SSLOptions for amqps:// connections, or None for plain amqp://.

    Loads the CA certificate from RABBITMQ_CA_CERT and verifies the broker's
    certificate against it.  Falls back to CERT_NONE (encryption only, no
    verification) if the CA file is not found — with a warning.
    """
    if not RABBITMQ_URL.startswith('amqps://'):
        return None

    ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
    ctx.check_hostname = False

    if os.path.isfile(RABBITMQ_CA_CERT):
        ctx.load_verify_locations(RABBITMQ_CA_CERT)
        ctx.verify_mode = ssl.CERT_REQUIRED
        log.debug("TLS: verifying broker cert against CA %s", RABBITMQ_CA_CERT)
    else:
        ctx.verify_mode = ssl.CERT_NONE
        log.warning(
            "TLS: CA cert not found at %s — skipping verification. "
            "Set RABBITMQ_CA_CERT to enable full verification.",
            RABBITMQ_CA_CERT,
        )

    return pika.SSLOptions(ctx)


# ── Logging setup ──────────────────────────────────────────────────────────────

def _setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s %(levelname)-8s %(name)s  %(message)s',
        datefmt='%Y-%m-%dT%H:%M:%S',
    )


# ── Signal handling ────────────────────────────────────────────────────────────

def _handle_signal(signum, frame):  # noqa: ARG001
    log.info("Received signal %s — shutting down gracefully …", signum)
    _shutdown.set()


# ── Heartbeat thread ───────────────────────────────────────────────────────────

def _heartbeat_thread(queue_type: str, current_scan_ref: list) -> None:
    """Send periodic heartbeat to the API server every 15 seconds."""
    import requests  # noqa: PLC0415

    heartbeat_url = f"{API_URL.rstrip('/')}/api/v1/workers/heartbeat"

    while not _shutdown.is_set():
        current_scan = current_scan_ref[0] if current_scan_ref else ''
        status = 'busy' if current_scan else 'idle'
        try:
            requests.post(
                heartbeat_url,
                json={
                    'worker_id': WORKER_ID,
                    'name': WORKER_NAME,
                    'host': WORKER_HOST,
                    'queue_type': queue_type,
                    'status': status,
                    'current_scan': current_scan,
                },
                timeout=5,
            )
        except Exception as exc:
            log.debug("Heartbeat failed (API unreachable?): %s", exc)

        _shutdown.wait(timeout=15)

    # Final offline heartbeat
    with contextlib.suppress(Exception):
        requests.post(
            heartbeat_url,
            json={
                'worker_id': WORKER_ID,
                'name': WORKER_NAME,
                'host': WORKER_HOST,
                'queue_type': queue_type,
                'status': 'offline',
                'current_scan': '',
            },
            timeout=5,
        )


# ── Message handler ────────────────────────────────────────────────────────────

def _make_handler(current_scan_ref: list):
    """Return a pika message callback bound to the given scan-ref list."""

    def _on_message(channel, method, _properties, body):
        try:
            task = json.loads(body)
        except json.JSONDecodeError as exc:
            log.error("Invalid task message (not JSON): %s", exc)
            channel.basic_nack(method.delivery_tag, requeue=False)
            return

        scan_id = task.get('scan_id', '<unknown>')
        log.info("Received scan task: scan_id=%s target=%s",
                 scan_id, task.get('scan_target'))

        current_scan_ref[0] = scan_id
        scan_succeeded = False
        try:
            from api.services.scan_runner import run_scan_task  # noqa: PLC0415
            run_scan_task(task)
            scan_succeeded = True
        except Exception as exc:
            log.error("Scan %s failed: %s", scan_id, exc)
        finally:
            current_scan_ref[0] = ''

        # Ack/nack outside the scan try-block so a channel error doesn't mask the
        # scan result.  If the broker closed the channel while the scan was running
        # (consumer_timeout), the ack will raise here — log it and do NOT nack,
        # since the scan completed successfully and results are already in the DB.
        if scan_succeeded:
            try:
                channel.basic_ack(method.delivery_tag)
                log.info("Scan %s finished — ack'd", scan_id)
            except Exception as ack_exc:
                log.error(
                    "Scan %s completed but ack failed (broker closed channel?): %s "
                    "— message will be redelivered. Check consumer_timeout setting.",
                    scan_id, ack_exc,
                )
        else:
            try:
                # nack without requeue → dead-letter if DLX is configured,
                # otherwise dropped; prevents infinite redeliver of broken scans.
                channel.basic_nack(method.delivery_tag, requeue=False)
            except Exception as nack_exc:
                log.error("Scan %s nack failed: %s", scan_id, nack_exc)

    return _on_message


# ── RabbitMQ connection with retry ─────────────────────────────────────────────

def _connect_with_retry(max_retries: int = 10, delay: float = 5.0):
    """Return a pika BlockingConnection, retrying on failure."""

    ssl_opts = _ssl_options()

    for attempt in range(1, max_retries + 1):
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            # Disable heartbeats: the _on_message callback blocks for the
            # entire scan duration (minutes to hours), preventing the main
            # loop from calling process_data_events() and sending heartbeats.
            # With heartbeat=60 (the old value), RabbitMQ kills the connection
            # roughly 60 s into every scan, causing tasks to be redelivered and
            # FINISHED messages to be dropped.
            params.heartbeat = 0
            params.blocked_connection_timeout = 300
            if ssl_opts is not None:
                params.ssl_options = ssl_opts
            conn = pika.BlockingConnection(params)
            log.info("Connected to RabbitMQ%s (attempt %d)",
                     " over TLS" if ssl_opts else "", attempt)
            return conn
        except Exception as exc:
            log.warning("RabbitMQ connection attempt %d/%d failed: %s",
                        attempt, max_retries, exc)
            if attempt < max_retries:
                time.sleep(delay)

    log.error("Could not connect to RabbitMQ after %d attempts — exiting", max_retries)
    sys.exit(1)


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    _setup_logging()

    parser = argparse.ArgumentParser(description='SpiderFoot distributed scan worker')
    parser.add_argument(
        '--queue',
        choices=['fast', 'slow'],
        default='fast',
        help='Queue to consume from (default: fast)',
    )
    parser.add_argument(
        '--concurrency',
        type=int,
        default=1,
        help='Number of scans to process simultaneously (default: 1)',
    )
    args = parser.parse_args()

    queue_name = QUEUE_SLOW if args.queue == 'slow' else QUEUE_FAST

    if not RABBITMQ_URL:
        log.error("RABBITMQ_URL is not set — worker cannot start")
        sys.exit(1)

    # Graceful shutdown on SIGTERM / SIGINT
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    log.info("Worker %s (%s) starting — queue=%s concurrency=%d",
             WORKER_NAME, WORKER_ID, queue_name, args.concurrency)

    # Mutable ref so the heartbeat thread can read the current scan ID
    current_scan_ref: list = ['']

    # Start heartbeat thread
    hb = threading.Thread(
        target=_heartbeat_thread,
        args=(args.queue, current_scan_ref),
        daemon=True,
    )
    hb.start()

    conn = _connect_with_retry()
    channel = conn.channel()

    # Declare both queues (idempotent — safe to call if they already exist)
    channel.queue_declare(queue=QUEUE_FAST, durable=True)
    channel.queue_declare(queue=QUEUE_SLOW, durable=True)

    # Prefetch = concurrency so pika delivers at most N unacked messages
    channel.basic_qos(prefetch_count=args.concurrency)

    channel.basic_consume(
        queue=queue_name,
        on_message_callback=_make_handler(current_scan_ref),
    )

    log.info("Waiting for scan tasks on queue '%s' …", queue_name)

    try:
        while not _shutdown.is_set():
            conn.process_data_events(time_limit=1)
    except Exception as exc:
        log.error("Consumer loop error: %s", exc)
    finally:
        with contextlib.suppress(Exception):
            conn.close()

    log.info("Worker %s stopped", WORKER_NAME)


if __name__ == '__main__':
    main()
