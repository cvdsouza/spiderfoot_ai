# -*- coding: utf-8 -*-
"""RabbitMQ result consumer for stateless workers (Phase 12).

Consumes scan results from RabbitMQ queues and writes them to the database.
This enables fully stateless workers that don't need direct database access
or shared filesystem (NFS) mounts.

Architecture:
- ResultConsumerManager: Monitors active scans, spawns ConsumerThread per scan
- ConsumerThread: Consumes results from scan.results.{scan_id}, writes to DB

Result queue naming: scan.results.{scan_id}
Exchange: scan.results (topic, durable)
Routing key: {scan_id}

Started automatically when API server starts (if RABBITMQ_URL configured).
Shuts down gracefully when API server stops.
"""

import json
import logging
import os
import ssl
import subprocess
import sys
import textwrap
import threading
import time
from typing import Optional

log = logging.getLogger(__name__)

# Root directory of the SpiderFoot application (two levels up from this file).
_APP_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Built-in correlation rules directory (must end with / for loadCorrelationRulesRaw).
_CORR_DIR = os.path.join(_APP_DIR, 'correlations') + os.sep


def _run_correlations(dbh, config: dict, scan_id: str) -> None:
    """Run correlation rules in an isolated subprocess for a completed scan.

    Running in a subprocess means an OOM-kill from processing large scans
    (40k+ events can consume several GiB) only kills the subprocess, not
    the API server.  The subprocess creates its own DB connection and loads
    correlation rules directly from the correlations/ directory.

    Falls back to in-process execution if the subprocess cannot be launched.
    """
    if not config.get('__correlationrules__'):
        log.debug(f"No correlation rules configured — skipping for scan {scan_id}")
        return

    db_path = config.get('__database', '')
    if not db_path:
        log.error("Cannot run correlations: __database not set in config")
        return

    # Inline script executed by the subprocess.  Uses repr() for all
    # string literals so the values are safely embedded regardless of
    # quotes or special characters.
    #
    # Rules that need source/child/entity enrichment load all matched
    # events plus their full relationship graphs into memory — for large
    # scans (40k+ events) this can exceed available RAM and OOM-kill the
    # subprocess.  We therefore process one rule at a time and skip any
    # rule whose analyze_rule_scope() reports that it needs enrichment,
    # logging the skipped rules so the operator knows which ones require
    # more RAM.
    script = textwrap.dedent(f"""\
        import sys
        sys.path.insert(0, {repr(_APP_DIR)})
        from spiderfoot import SpiderFootDb, SpiderFootCorrelator, SpiderFootHelpers
        config = {{'__database': {repr(db_path)}}}
        dbh = SpiderFootDb(config)
        rules_raw = SpiderFootHelpers.loadCorrelationRulesRaw(
            {repr(_CORR_DIR)}, ['template.yaml'])
        if not rules_raw:
            print("No correlation rules found", flush=True)
            sys.exit(0)

        completed = 0
        skipped_heavy = 0
        failed = 0
        for rule_id, rule_yaml in rules_raw.items():
            try:
                corr = SpiderFootCorrelator(dbh, {{rule_id: rule_yaml}}, {repr(scan_id)})
                parsed = corr.get_ruleset()
                if not parsed:
                    continue
                needs_children, needs_sources, needs_entities = corr.analyze_rule_scope(parsed[0])
                if needs_children or needs_sources or needs_entities:
                    print(f"SKIP_HEAVY {{rule_id}}", flush=True)
                    skipped_heavy += 1
                    continue
                corr.run_correlations()
                completed += 1
            except Exception as e:
                print(f"RULE_ERROR {{rule_id}}: {{e}}", flush=True)
                failed += 1
        print(f"DONE completed={{completed}} skipped_heavy={{skipped_heavy}} failed={{failed}}", flush=True)
    """)

    try:
        result = subprocess.run(
            [sys.executable, '-c', script],
            capture_output=True,
            text=True,
            timeout=900,  # 15-minute hard cap
        )
        stdout = result.stdout.strip()
        stderr = result.stderr.strip()

        if result.returncode == 0:
            # Log per-rule skip/error lines at appropriate levels
            for line in stdout.splitlines():
                if line.startswith("SKIP_HEAVY "):
                    log.info(f"Correlation rule skipped (needs enrichment, insufficient RAM): {line[11:]}")
                elif line.startswith("RULE_ERROR "):
                    log.warning(f"Correlation rule error: {line[11:]}")
                elif line.startswith("DONE "):
                    log.info(f"Correlations done for scan {scan_id}: {line[5:]}")
            if stderr:
                log.warning(f"Correlation subprocess stderr for scan {scan_id}: {stderr[:500]}")
        elif result.returncode in (-9, 137):
            log.error(
                f"Correlation subprocess OOM-killed for scan {scan_id}. "
                "The scan has too many events for the available memory. "
                "Consider running on a host with more RAM or a smaller scan."
            )
        else:
            log.error(
                f"Correlation subprocess failed for scan {scan_id} "
                f"(exit={result.returncode}). "
                f"stdout={stdout[:500]} stderr={stderr[:500]}"
            )
    except subprocess.TimeoutExpired:
        log.error(f"Correlation subprocess timed out for scan {scan_id} after 15 minutes")
    except Exception as e:
        log.error(f"Failed to launch correlation subprocess for scan {scan_id}: {e}", exc_info=True)


class ResultConsumerManager:
    """Manages result consumer threads for all active scans.

    Monitors tbl_scan_instance for scans in RUNNING state and spawns a
    ConsumerThread for each scan. Stops consumers when scans complete.
    """

    def __init__(self, dbh, rabbitmq_url: str, config: dict = None):
        """Initialize the result consumer manager.

        Args:
            dbh: Database handle (SpiderFootDb instance)
            rabbitmq_url: RabbitMQ connection URL
            config: SpiderFoot config dict (must include __correlationrules__)
        """
        self.dbh = dbh
        self.rabbitmq_url = rabbitmq_url
        self.config = config or {}
        self.rabbitmq_ca_cert = os.environ.get('RABBITMQ_CA_CERT', '/etc/rabbitmq/certs/ca.crt')
        self.exchange_name = 'scan.results'

        self.consumers = {}  # {scan_id: ConsumerThread}
        self.shutdown_event = threading.Event()
        self.monitor_thread: Optional[threading.Thread] = None

        # RabbitMQ connection (shared by monitor for queue operations)
        self.connection = None
        self.channel = None

        # Worker cleanup configuration
        self.worker_cleanup_timeout = int(os.environ.get('WORKER_CLEANUP_TIMEOUT', '300'))  # 5 minutes default
        self.last_cleanup_time = 0

    def _ssl_options(self):
        """Return pika SSLOptions for TLS connections, or None."""
        if not self.rabbitmq_url.startswith('amqps://'):
            return None

        try:
            import pika
        except ImportError:
            log.error("pika module not found — install via: pip install pika")
            return None

        ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
        ctx.check_hostname = False

        if os.path.isfile(self.rabbitmq_ca_cert):
            ctx.load_verify_locations(self.rabbitmq_ca_cert)
            ctx.verify_mode = ssl.CERT_REQUIRED
            log.debug(f"TLS: verifying broker cert against CA {self.rabbitmq_ca_cert}")
        else:
            ctx.verify_mode = ssl.CERT_NONE
            log.warning(f"TLS: CA cert not found at {self.rabbitmq_ca_cert} — skipping verification")

        return pika.SSLOptions(ctx)

    def _connect(self):
        """Establish connection to RabbitMQ."""
        try:
            import pika
        except ImportError:
            log.error("pika module not found — install via: pip install pika")
            return False

        try:
            params = pika.URLParameters(self.rabbitmq_url)
            params.socket_timeout = 10

            ssl_opts = self._ssl_options()
            if ssl_opts is not None:
                params.ssl_options = ssl_opts

            self.connection = pika.BlockingConnection(params)
            self.channel = self.connection.channel()

            # Declare the results exchange (topic, durable)
            self.channel.exchange_declare(
                exchange=self.exchange_name,
                exchange_type='topic',
                durable=True
            )

            log.info("Result consumer manager connected to RabbitMQ")
            return True
        except Exception as e:
            log.error(f"Failed to connect to RabbitMQ: {e}")
            return False

    def start(self):
        """Start the result consumer manager.

        Connects to RabbitMQ and starts the scan monitor thread.
        """
        if not self._connect():
            log.error("Failed to connect to RabbitMQ — result consumer not started")
            return

        # Start monitor thread to watch for new/completed scans
        self.monitor_thread = threading.Thread(
            target=self._monitor_scans,
            name="ResultConsumerMonitor",
            daemon=True
        )
        self.monitor_thread.start()
        log.info("Result consumer manager started")

    def shutdown(self):
        """Shutdown the result consumer manager and all consumer threads."""
        log.info("Shutting down result consumer manager...")
        self.shutdown_event.set()

        # Stop all consumer threads
        for scan_id, consumer in list(self.consumers.items()):
            log.debug(f"Stopping consumer for scan {scan_id}")
            consumer.stop()

        # Wait for monitor thread to finish
        if self.monitor_thread and self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)

        # Close RabbitMQ connection
        if self.connection and not self.connection.is_closed:
            self.connection.close()

        log.info("Result consumer manager shut down")

    # How long (seconds) a ConsumerThread may be idle before the watchdog
    # assumes the FINISHED message was dropped and marks the scan complete.
    STALE_CONSUMER_TIMEOUT = 600  # 10 minutes

    def _monitor_scans(self):
        """Monitor active scans and spawn/stop consumers as needed.

        Runs in a background thread. Polls tbl_scan_instance every 10 seconds.
        Also periodically cleans up offline workers.
        """
        log.info("Scan monitor thread started")

        while not self.shutdown_event.is_set():
            try:
                # Query for scans in RUNNING state
                running_scans = self._get_running_scans()

                # ── Step 1: clean up dead ConsumerThreads ────────────────
                # A thread can die before receiving FINISHED (e.g. connection
                # reset).  Without this check the thread stays in self.consumers
                # and _monitor_scans never spawns a replacement, leaving the
                # scan stuck at RUNNING indefinitely.
                for scan_id in list(self.consumers.keys()):
                    consumer = self.consumers[scan_id]
                    if not consumer.is_alive():
                        if scan_id in running_scans:
                            log.warning(
                                f"Consumer thread for scan {scan_id} died unexpectedly "
                                f"(lifecycle_received={consumer.lifecycle_received}) — will restart"
                            )
                        else:
                            log.debug(f"Consumer for scan {scan_id} exited normally")
                        self.consumers.pop(scan_id)

                # ── Step 2: start consumers for new / restarted scans ────
                for scan_id in running_scans:
                    if scan_id not in self.consumers:
                        log.info(f"Starting result consumer for scan {scan_id}")
                        consumer = ConsumerThread(
                            scan_id=scan_id,
                            dbh=self.dbh,
                            rabbitmq_url=self.rabbitmq_url,
                            rabbitmq_ca_cert=self.rabbitmq_ca_cert,
                            exchange_name=self.exchange_name,
                            config=self.config,
                        )
                        consumer.start()
                        self.consumers[scan_id] = consumer

                # ── Step 3: stop live consumers for completed scans ──────
                for scan_id in list(self.consumers.keys()):
                    if scan_id not in running_scans:
                        log.info(f"Stopping result consumer for completed scan {scan_id}")
                        consumer = self.consumers.pop(scan_id)
                        consumer.stop()

                # ── Step 4: watchdog — detect scans whose FINISHED was dropped
                # If a ConsumerThread has received no messages for
                # STALE_CONSUMER_TIMEOUT seconds the FINISHED lifecycle message
                # was almost certainly dropped (connection broken in the worker's
                # sfp__stor_rabbitmq or queue deleted prematurely).  Mark the
                # scan FINISHED so the UI reflects reality.
                now = time.time()
                for scan_id, consumer in list(self.consumers.items()):
                    idle_secs = now - getattr(consumer, 'last_message_time', now)
                    if idle_secs >= self.STALE_CONSUMER_TIMEOUT:
                        log.warning(
                            f"Scan {scan_id} consumer has been idle for {idle_secs:.0f}s "
                            f"(>{self.STALE_CONSUMER_TIMEOUT}s threshold) — "
                            f"FINISHED message likely dropped; running correlations and marking FINISHED"
                        )
                        consumer.stop()
                        self.consumers.pop(scan_id)
                        # Run correlations before marking complete — same as the
                        # normal FINISHED lifecycle path in ConsumerThread.
                        _run_correlations(self.dbh, self.config, scan_id)
                        try:
                            self.dbh.scanInstanceSet(scan_id, status='FINISHED', ended=int(now * 1000))
                        except Exception as e:
                            log.error(f"Failed to mark stale scan {scan_id} as FINISHED: {e}")

                # ── Step 5: cleanup offline workers every 2 minutes ──────
                current_time = time.time()
                if current_time - self.last_cleanup_time >= 120:
                    self._cleanup_offline_workers()
                    self.last_cleanup_time = current_time

            except Exception as e:
                log.error(f"Error in scan monitor: {e}")

            # Sleep 10 seconds before next poll
            self.shutdown_event.wait(timeout=10)

        log.info("Scan monitor thread stopped")

    def _get_running_scans(self):
        """Query database for scans in RUNNING state.

        Returns:
            list: List of scan IDs in RUNNING state
        """
        try:
            # Include ABORT-REQUESTED: the scan is still active and its worker
            # may still publish a lifecycle message (ABORTED/FAILED) that the
            # ConsumerThread must receive to update the final status.
            with self.dbh.dbhLock:
                self.dbh.dbh.execute(
                    "SELECT guid FROM tbl_scan_instance WHERE status IN ('RUNNING', 'ABORT-REQUESTED')"
                )
                result = self.dbh.dbh.fetchall()
                return [row[0] for row in result]
        except Exception as e:
            log.error(f"Failed to query running scans: {e}")
            return []

    def _cleanup_offline_workers(self):
        """Clean up workers that have been offline for longer than the configured timeout.

        Workers are stateless and automatically re-register on heartbeat, so it's safe
        to delete their database records. They will reconnect and re-register when they
        come back online.
        """
        try:
            # First mark stale workers as offline (not seen in 60 seconds)
            self.dbh.workerOfflineStale(max_age_seconds=60)

            # Then delete workers that have been offline for the configured timeout
            deleted_count = self.dbh.workerDeleteOffline(max_age_seconds=self.worker_cleanup_timeout)

            if deleted_count > 0:
                log.info(f"Cleaned up {deleted_count} offline worker(s) (timeout: {self.worker_cleanup_timeout}s)")
        except Exception as e:
            log.error(f"Failed to cleanup offline workers: {e}")


class ConsumerThread(threading.Thread):
    """Consumes results for a single scan from RabbitMQ.

    Receives events from scan.results.{scan_id} queue and writes them to
    the database. Stops when FINISHED/FAILED lifecycle message is received.
    """

    def __init__(self, scan_id: str, dbh, rabbitmq_url: str, rabbitmq_ca_cert: str, exchange_name: str, config: dict = None):
        """Initialize the consumer thread.

        Args:
            scan_id: Scan ID to consume results for
            dbh: Database handle
            rabbitmq_url: RabbitMQ connection URL
            rabbitmq_ca_cert: Path to CA certificate for TLS
            exchange_name: Exchange name to bind queue to
            config: SpiderFoot config dict (used to run correlation rules on FINISHED)
        """
        super().__init__(name=f"ResultConsumer-{scan_id}", daemon=True)

        self.scan_id = scan_id
        self.dbh = dbh
        self.rabbitmq_url = rabbitmq_url
        self.rabbitmq_ca_cert = rabbitmq_ca_cert
        self.exchange_name = exchange_name
        self.queue_name = f"scan.results.{scan_id}"
        self.config = config or {}

        self.connection = None
        self.channel = None
        self.stop_event = threading.Event()
        # Set to True when a FINISHED/FAILED/ABORTED lifecycle is received.
        # The queue is only deleted when this is True; premature exits (e.g.
        # connection drops) leave the queue intact so a replacement thread or
        # a late FINISHED message from the worker can still be consumed.
        self.lifecycle_received = False
        # Tracks the last time any message was received. Used by the watchdog
        # in _monitor_scans to detect scans whose FINISHED was dropped.
        self.last_message_time = time.time()

    def _ssl_options(self):
        """Return pika SSLOptions for TLS connections, or None."""
        if not self.rabbitmq_url.startswith('amqps://'):
            return None

        try:
            import pika
        except ImportError:
            return None

        ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
        ctx.check_hostname = False

        if os.path.isfile(self.rabbitmq_ca_cert):
            ctx.load_verify_locations(self.rabbitmq_ca_cert)
            ctx.verify_mode = ssl.CERT_REQUIRED
        else:
            ctx.verify_mode = ssl.CERT_NONE

        return pika.SSLOptions(ctx)

    def run(self):
        """Main consumer loop. Connects to RabbitMQ and processes messages."""
        log.info(f"Consumer thread started for scan {self.scan_id}")

        try:
            import pika
        except ImportError:
            log.error("pika module not found")
            return

        try:
            # Connect to RabbitMQ
            params = pika.URLParameters(self.rabbitmq_url)
            params.socket_timeout = 10

            ssl_opts = self._ssl_options()
            if ssl_opts is not None:
                params.ssl_options = ssl_opts

            self.connection = pika.BlockingConnection(params)
            self.channel = self.connection.channel()

            # Declare queue with settings that match the pre-declared queue
            # created by pre_declare_result_queue() in scan_manager.py.
            # Must NOT be exclusive — the queue is pre-created by a different
            # connection so that worker events are buffered from t=0.
            self.channel.queue_declare(
                queue=self.queue_name,
                durable=True,
                exclusive=False,
                auto_delete=False,
                arguments={'x-message-ttl': 86400000}  # 24h TTL
            )

            # Bind queue to exchange
            self.channel.queue_bind(
                queue=self.queue_name,
                exchange=self.exchange_name,
                routing_key=self.scan_id
            )

            log.info(f"Consumer bound to queue {self.queue_name}")

            # Start consuming
            self.channel.basic_consume(
                queue=self.queue_name,
                on_message_callback=self._handle_message,
                auto_ack=False
            )

            # Process messages until stop event is set
            while not self.stop_event.is_set() and self.channel._consumer_infos:
                try:
                    self.connection.process_data_events(time_limit=1)
                except Exception as e:
                    log.error(f"Error processing messages for scan {self.scan_id}: {e}")
                    break

        except Exception as e:
            log.error(f"Consumer thread error for scan {self.scan_id}: {e}")
        finally:
            # Only delete the queue when a lifecycle message (FINISHED/FAILED/
            # ABORTED) was received and all messages have been consumed.
            # If we exit due to a connection error (lifecycle_received=False),
            # leave the queue intact so a replacement ConsumerThread can pick
            # up any pending messages — including a FINISHED that the worker
            # may publish after this thread has gone away.
            if self.lifecycle_received and self.channel and self.channel.is_open:
                try:
                    self.channel.queue_delete(queue=self.queue_name)
                    log.debug(f"Deleted result queue {self.queue_name}")
                except Exception:
                    pass

            # Close connection
            if self.connection and not self.connection.is_closed:
                try:
                    self.connection.close()
                except Exception:
                    pass

            log.info(f"Consumer thread stopped for scan {self.scan_id}")

    def _handle_message(self, channel, method, properties, body):
        """Process a single result message.

        Args:
            channel: Pika channel
            method: Delivery method
            properties: Message properties
            body: Message body (JSON)
        """
        try:
            self.last_message_time = time.time()
            message = json.loads(body.decode('utf-8'))
            scan_id = message.get('scan_id')
            lifecycle = message.get('lifecycle')
            event_data = message.get('event')
            log_data = message.get('log')

            if scan_id != self.scan_id:
                log.warning(f"Received message for different scan {scan_id}, expected {self.scan_id}")
                channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                return

            # Handle log entry forwarded from worker via _RabbitMQLogHandler
            if log_data:
                level = log_data.get('level', 'STATUS')
                msg = log_data.get('message', '')
                component = log_data.get('component', 'SpiderFoot')
                log_time = log_data.get('time', time.time())
                self.dbh.scanLogEvents([(scan_id, level, msg, component, log_time)])
                log.debug(f"Stored log [{level}] for scan {scan_id}")
                channel.basic_ack(delivery_tag=method.delivery_tag)
                return

            # Handle lifecycle messages
            if lifecycle:
                log.info(f"Received lifecycle {lifecycle} for scan {scan_id}")
                self.lifecycle_received = True
                if lifecycle == 'FINISHED':
                    # Run correlations before marking complete.  In stateless
                    # worker mode sfp__stor_db is removed from the modlist so
                    # the worker's local DB is empty; all events are in the API
                    # DB by the time we reach here, so we run correlations here
                    # on the server side instead.
                    self._run_correlations(scan_id)
                    self.dbh.scanInstanceSet(scan_id, status='FINISHED', ended=int(time.time() * 1000))
                    # Stop consuming after FINISHED
                    self.stop()
                elif lifecycle == 'FAILED':
                    self.dbh.scanInstanceSet(scan_id, status='ERROR-FAILED', ended=int(time.time() * 1000))
                    self.stop()
                elif lifecycle == 'ABORTED':
                    self.dbh.scanInstanceSet(scan_id, status='ABORTED', ended=int(time.time() * 1000))
                    self.stop()

                channel.basic_ack(delivery_tag=method.delivery_tag)
                return

            # Handle regular event
            if event_data:
                # Reconstruct SpiderFootEvent from event_data
                from spiderfoot.event import SpiderFootEvent

                event_type = event_data.get('type', 'UNKNOWN')
                event_module = event_data.get('module', 'unknown')
                event_data_str = event_data.get('data', '')
                source_event_hash = event_data.get('source_event_hash', 'ROOT')

                # For ROOT events, sourceEvent can be None.
                # For ALL other events (including direct ROOT children whose
                # source_event_hash == 'ROOT'), supply a minimal dummy source event —
                # the DB only stores the hash, never the object itself.
                # Passing None for a non-ROOT eventType raises TypeError in the
                # sourceEvent setter → nack(requeue=True) → infinite redelivery storm.
                if event_type == 'ROOT':
                    source_event = None
                else:
                    # Use 'ROOT' as placeholder data — the data setter raises for
                    # empty strings on ALL event types, and the DB only stores the
                    # hash, never the object's data field.
                    source_event = SpiderFootEvent('ROOT', 'ROOT', '', None)
                    source_event._hash = source_event_hash

                # Create the actual event
                sfEvent = SpiderFootEvent(event_type, event_data_str, event_module, source_event)

                # Set additional attributes from the message
                if 'generated' in event_data:
                    sfEvent._generated = event_data['generated']
                if 'confidence' in event_data:
                    sfEvent.confidence = event_data['confidence']
                if 'visibility' in event_data:
                    sfEvent.visibility = event_data['visibility']
                if 'risk' in event_data:
                    sfEvent.risk = event_data['risk']
                if 'hash' in event_data:
                    sfEvent._hash = event_data['hash']
                if 'source_event_hash' in event_data:
                    sfEvent._sourceEventHash = event_data['source_event_hash']

                # Idempotent insert: skip if this exact hash already exists.
                # Duplicate hashes arise from at-least-once RabbitMQ delivery
                # (nack → requeue → redeliver) or scan task redelivery.
                with self.dbh.dbhLock:
                    self.dbh.dbh.execute(
                        "SELECT 1 FROM tbl_scan_results WHERE scan_instance_id=? AND hash=? LIMIT 1",
                        (scan_id, sfEvent.hash)
                    )
                    already_stored = self.dbh.dbh.fetchone() is not None

                if already_stored:
                    log.debug(f"Skipping duplicate event {event_type} (hash={sfEvent.hash}) for scan {scan_id}")
                else:
                    self.dbh.scanEventStore(scan_id, sfEvent)
                    log.debug(f"Stored event {event_type} for scan {scan_id}")

            channel.basic_ack(delivery_tag=method.delivery_tag)

        except json.JSONDecodeError as e:
            log.error(f"Invalid JSON in message: {e}")
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        except Exception as e:
            log.error(f"Error handling message for scan {self.scan_id}: {e}")
            # Retry transient errors
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

    def _run_correlations(self, scan_id: str) -> None:
        """Run correlation rules — delegates to module-level helper."""
        _run_correlations(self.dbh, self.config, scan_id)

    def stop(self):
        """Stop the consumer thread."""
        self.stop_event.set()
        if self.channel and self.channel.is_open:
            try:
                self.channel.stop_consuming()
            except Exception:
                pass
