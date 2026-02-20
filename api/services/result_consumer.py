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
import threading
import time
from typing import Optional

log = logging.getLogger(__name__)


class ResultConsumerManager:
    """Manages result consumer threads for all active scans.

    Monitors tbl_scan_instance for scans in RUNNING state and spawns a
    ConsumerThread for each scan. Stops consumers when scans complete.
    """

    def __init__(self, dbh, rabbitmq_url: str):
        """Initialize the result consumer manager.

        Args:
            dbh: Database handle (SpiderFootDb instance)
            rabbitmq_url: RabbitMQ connection URL
        """
        self.dbh = dbh
        self.rabbitmq_url = rabbitmq_url
        self.rabbitmq_ca_cert = os.environ.get('RABBITMQ_CA_CERT', '/etc/rabbitmq/certs/ca.crt')
        self.exchange_name = 'scan.results'

        self.consumers = {}  # {scan_id: ConsumerThread}
        self.shutdown_event = threading.Event()
        self.monitor_thread: Optional[threading.Thread] = None

        # RabbitMQ connection (shared by monitor for queue operations)
        self.connection = None
        self.channel = None

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

    def _monitor_scans(self):
        """Monitor active scans and spawn/stop consumers as needed.

        Runs in a background thread. Polls tbl_scan_instance every 10 seconds.
        """
        log.info("Scan monitor thread started")

        while not self.shutdown_event.is_set():
            try:
                # Query for scans in RUNNING state
                running_scans = self._get_running_scans()

                # Start consumers for new scans
                for scan_id in running_scans:
                    if scan_id not in self.consumers:
                        log.info(f"Starting result consumer for scan {scan_id}")
                        consumer = ConsumerThread(
                            scan_id=scan_id,
                            dbh=self.dbh,
                            rabbitmq_url=self.rabbitmq_url,
                            rabbitmq_ca_cert=self.rabbitmq_ca_cert,
                            exchange_name=self.exchange_name
                        )
                        consumer.start()
                        self.consumers[scan_id] = consumer

                # Stop consumers for completed scans
                for scan_id in list(self.consumers.keys()):
                    if scan_id not in running_scans:
                        log.info(f"Stopping result consumer for completed scan {scan_id}")
                        consumer = self.consumers.pop(scan_id)
                        consumer.stop()

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
            query = "SELECT scan_id FROM tbl_scan_instance WHERE status = 'RUNNING'"
            result = self.dbh._query(query)
            return [row[0] for row in result]
        except Exception as e:
            log.error(f"Failed to query running scans: {e}")
            return []


class ConsumerThread(threading.Thread):
    """Consumes results for a single scan from RabbitMQ.

    Receives events from scan.results.{scan_id} queue and writes them to
    the database. Stops when FINISHED/FAILED lifecycle message is received.
    """

    def __init__(self, scan_id: str, dbh, rabbitmq_url: str, rabbitmq_ca_cert: str, exchange_name: str):
        """Initialize the consumer thread.

        Args:
            scan_id: Scan ID to consume results for
            dbh: Database handle
            rabbitmq_url: RabbitMQ connection URL
            rabbitmq_ca_cert: Path to CA certificate for TLS
            exchange_name: Exchange name to bind queue to
        """
        super().__init__(name=f"ResultConsumer-{scan_id}", daemon=True)

        self.scan_id = scan_id
        self.dbh = dbh
        self.rabbitmq_url = rabbitmq_url
        self.rabbitmq_ca_cert = rabbitmq_ca_cert
        self.exchange_name = exchange_name
        self.queue_name = f"scan.results.{scan_id}"

        self.connection = None
        self.channel = None
        self.stop_event = threading.Event()

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

            # Declare queue (auto-delete when consumer disconnects)
            self.channel.queue_declare(
                queue=self.queue_name,
                durable=False,
                exclusive=True,
                auto_delete=True,
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
            message = json.loads(body.decode('utf-8'))
            scan_id = message.get('scan_id')
            lifecycle = message.get('lifecycle')
            event_data = message.get('event')

            if scan_id != self.scan_id:
                log.warning(f"Received message for different scan {scan_id}, expected {self.scan_id}")
                channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
                return

            # Handle lifecycle messages
            if lifecycle:
                log.info(f"Received lifecycle {lifecycle} for scan {scan_id}")
                if lifecycle == 'FINISHED':
                    self.dbh.scanInstanceSet(scan_id, status='FINISHED', ended=int(time.time()))
                    # Stop consuming after FINISHED
                    self.stop()
                elif lifecycle == 'FAILED':
                    self.dbh.scanInstanceSet(scan_id, status='ERROR-FAILED', ended=int(time.time()))
                    self.stop()
                elif lifecycle == 'ABORTED':
                    self.dbh.scanInstanceSet(scan_id, status='ABORTED', ended=int(time.time()))
                    self.stop()

                channel.basic_ack(delivery_tag=method.delivery_tag)
                return

            # Handle regular event
            if event_data:
                # Reconstruct SpiderFootEvent from event_data
                # For now, just store the essential fields directly
                # The proper way would be to reconstruct a full SpiderFootEvent object
                # but that requires importing from spiderfoot module which may cause circular deps

                # Simple approach: store using scanEventStore with a minimal event object
                # We'll need to create a simple event-like object
                from spiderfoot.event import SpiderFootEvent

                # Create a minimal event for storage
                # We need to reconstruct the sourceEvent chain, but for now use None
                event_type = event_data.get('type', 'UNKNOWN')
                event_module = event_data.get('module', 'unknown')
                event_data_str = event_data.get('data', '')

                # Create event (sourceEvent=None for now, as we don't have the full chain)
                sfEvent = SpiderFootEvent(event_type, event_data_str, event_module, None)

                # Set additional attributes
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

                # Store event to database
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

    def stop(self):
        """Stop the consumer thread."""
        self.stop_event.set()
        if self.channel and self.channel.is_open:
            try:
                self.channel.stop_consuming()
            except Exception:
                pass
