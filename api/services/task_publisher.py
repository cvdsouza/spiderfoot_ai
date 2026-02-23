# -*- coding: utf-8 -*-
"""RabbitMQ task publisher for distributed scan workers (Phase 11).

Publishes scan task messages to durable RabbitMQ queues.  Workers consume
these messages and run the scan using startSpiderFootScanner().

Queues:
  scans.fast  — most modules
  scans.slow  — brute-force, crawl, rate-limited API modules

TLS: When RABBITMQ_URL starts with amqps://, connections are made over TLS.
The CA certificate path is read from the RABBITMQ_CA_CERT environment variable
(default: /etc/rabbitmq/certs/ca.crt, mounted by docker-compose).

If RABBITMQ_URL is not set or RabbitMQ is unreachable, callers should fall
back to the existing local-subprocess behaviour.
"""

import json
import logging
import os
import ssl

log = logging.getLogger(__name__)

RABBITMQ_URL: str = os.environ.get('RABBITMQ_URL', '')
RABBITMQ_CA_CERT: str = os.environ.get('RABBITMQ_CA_CERT', '/etc/rabbitmq/certs/ca.crt')

QUEUE_FAST = 'scans.fast'
QUEUE_SLOW = 'scans.slow'


def _queue_name(queue_type: str) -> str:
    return QUEUE_SLOW if queue_type == 'slow' else QUEUE_FAST


def _ssl_options():
    """Return a pika SSLOptions instance for amqps:// connections, or None.

    Uses the CA certificate at RABBITMQ_CA_CERT to verify the broker's
    identity (certificate must be signed by that CA).  Hostname verification
    is disabled because Docker Compose service names ('rabbitmq') may not
    match the CN/SAN of self-signed certificates on every host.

    Returns None when the URL does not use TLS (amqp://).
    """
    if not RABBITMQ_URL.startswith('amqps://'):
        return None

    import pika  # noqa: PLC0415

    ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
    ctx.check_hostname = False

    if os.path.isfile(RABBITMQ_CA_CERT):
        ctx.load_verify_locations(RABBITMQ_CA_CERT)
        ctx.verify_mode = ssl.CERT_REQUIRED
        log.debug("TLS: verifying broker cert against CA %s", RABBITMQ_CA_CERT)
    else:
        # CA cert not found — still use TLS but skip verification.
        # This protects against passive eavesdropping but not active MitM.
        ctx.verify_mode = ssl.CERT_NONE
        log.warning(
            "TLS: CA cert not found at %s — skipping broker cert verification. "
            "Set RABBITMQ_CA_CERT to enable full verification.",
            RABBITMQ_CA_CERT,
        )

    return pika.SSLOptions(ctx)


def rabbitmq_available() -> bool:
    """Return True if RabbitMQ is reachable using the configured URL.

    Performs a quick connect-and-disconnect check.  Used by the scan
    manager to decide whether to dispatch via RabbitMQ or fall back to
    a local subprocess.
    """
    if not RABBITMQ_URL:
        return False
    try:
        import pika  # type: ignore[import]
        params = pika.URLParameters(RABBITMQ_URL)
        params.socket_timeout = 3
        ssl_opts = _ssl_options()
        if ssl_opts is not None:
            params.ssl_options = ssl_opts
        conn = pika.BlockingConnection(params)
        conn.close()
        return True
    except Exception as exc:
        log.debug("RabbitMQ not available: %s", exc)
        return False


RESULTS_EXCHANGE = 'scan.results'


def pre_declare_result_queue(scan_id: str) -> bool:
    """Pre-declare the per-scan result queue BEFORE dispatching to the worker.

    Without this, the topic exchange silently drops all events published
    before ResultConsumerManager has a chance to bind the queue (up to 10 s).
    Declaring the queue here ensures messages are buffered from the very first
    event the worker emits.

    The queue settings must match those used by ConsumerThread exactly so that
    a passive re-declare by the consumer succeeds without conflict.

    Args:
        scan_id: Scan ID — becomes the queue name scan.results.{scan_id}

    Returns:
        True on success, False on any error.
    """
    if not RABBITMQ_URL:
        return False

    queue_name = f'scan.results.{scan_id}'
    try:
        import pika  # type: ignore[import]

        params = pika.URLParameters(RABBITMQ_URL)
        params.socket_timeout = 5
        ssl_opts = _ssl_options()
        if ssl_opts is not None:
            params.ssl_options = ssl_opts

        conn = pika.BlockingConnection(params)
        ch = conn.channel()

        ch.exchange_declare(exchange=RESULTS_EXCHANGE, exchange_type='topic', durable=True)
        ch.queue_declare(
            queue=queue_name,
            durable=True,
            exclusive=False,
            auto_delete=False,
            arguments={'x-message-ttl': 86400000},  # 24 h TTL
        )
        ch.queue_bind(queue=queue_name, exchange=RESULTS_EXCHANGE, routing_key=scan_id)
        conn.close()

        log.info("Pre-declared result queue '%s' for scan %s", queue_name, scan_id)
        return True
    except Exception as exc:
        log.error("Failed to pre-declare result queue for scan %s: %s", scan_id, exc)
        return False


def publish_scan_task(scan_task: dict, queue_type: str = 'fast') -> bool:
    """Publish a scan task message to the appropriate RabbitMQ queue.

    The message is published as a durable, persistent JSON payload so it
    survives RabbitMQ restarts.

    Args:
        scan_task: Dict with keys:
            scan_id, scan_name, scan_target, target_type,
            module_list, queue_type, api_url, result_mode
        queue_type: 'fast' or 'slow' — determines the target queue

    Returns:
        True if the message was accepted by the broker, False on any error.
    """
    if not RABBITMQ_URL:
        log.warning("RABBITMQ_URL is not set — cannot publish scan task")
        return False

    queue = _queue_name(queue_type)
    try:
        import pika  # type: ignore[import]
        params = pika.URLParameters(RABBITMQ_URL)
        params.socket_timeout = 5
        ssl_opts = _ssl_options()
        if ssl_opts is not None:
            params.ssl_options = ssl_opts
        conn = pika.BlockingConnection(params)
        channel = conn.channel()

        # Declare queue as durable so tasks survive broker restart
        channel.queue_declare(queue=queue, durable=True)

        channel.basic_publish(
            exchange='',
            routing_key=queue,
            body=json.dumps(scan_task).encode(),
            properties=pika.BasicProperties(
                delivery_mode=2,          # persistent message
                content_type='application/json',
            ),
        )
        conn.close()
        log.info("Scan %s published to queue '%s'", scan_task.get('scan_id'), queue)
        return True
    except Exception as exc:
        log.error("Failed to publish scan task to RabbitMQ: %s", exc)
        return False
