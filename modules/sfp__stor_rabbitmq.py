# -*- coding: utf-8 -*-
"""SpiderFoot plugin for storing scan results to RabbitMQ.

Publishes scan events to RabbitMQ queues for stateless worker deployments.
Events are consumed by the API server's result consumer and written to the
database, eliminating the need for shared filesystem (NFS) access.

Result queue naming: scan.results.{scan_id}
Exchange: scan.results (topic, durable)
Routing key: {scan_id}

Each event is published as a JSON message with the event data and metadata.
On scan completion, a lifecycle FINISHED message is sent to signal completion.
"""

import json
import logging
import os
import ssl
from spiderfoot import SpiderFootPlugin


class sfp__stor_rabbitmq(SpiderFootPlugin):

    meta = {
        'name': "RabbitMQ Storage",
        'summary': "Stores scan results to RabbitMQ for stateless workers. Results are consumed by the API server."
    }

    _priority = 0  # Highest priority, same as sfp__stor_db

    # Default options
    opts = {
        '_store': True
    }

    # Option descriptions
    optdescs = {}

    def setup(self, sfc, userOpts=None):
        """Initialize the module.

        Args:
            sfc: SpiderFoot context
            userOpts: User configuration options
        """
        if userOpts is None:
            userOpts = {}

        self.sf = sfc

        for opt in list(userOpts.keys()):
            self.opts[opt] = userOpts[opt]

        # RabbitMQ configuration from environment
        self.rabbitmq_url = os.environ.get('RABBITMQ_URL', '')
        self.rabbitmq_ca_cert = os.environ.get('RABBITMQ_CA_CERT', '/etc/rabbitmq/certs/ca.crt')
        self.exchange_name = 'scan.results'

        # Connection state
        self.connection = None
        self.channel = None

        if not self.rabbitmq_url:
            self.error("RABBITMQ_URL not set — cannot publish results")
            return

        # Initialize RabbitMQ connection
        try:
            self._connect()
        except Exception as e:
            self.error(f"Failed to connect to RabbitMQ: {e}")

    def _ssl_options(self):
        """Return pika SSLOptions for TLS connections, or None.

        Reuses logic from api/services/task_publisher.py.
        """
        if not self.rabbitmq_url.startswith('amqps://'):
            return None

        try:
            import pika
        except ImportError:
            self.error("pika module not found — install via: pip install pika")
            return None

        ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
        ctx.check_hostname = False

        if os.path.isfile(self.rabbitmq_ca_cert):
            ctx.load_verify_locations(self.rabbitmq_ca_cert)
            ctx.verify_mode = ssl.CERT_REQUIRED
            self.debug(f"TLS: verifying broker cert against CA {self.rabbitmq_ca_cert}")
        else:
            # CA cert not found — still use TLS but skip verification
            ctx.verify_mode = ssl.CERT_NONE
            self.info(f"TLS: CA cert not found at {self.rabbitmq_ca_cert} — skipping verification")

        return pika.SSLOptions(ctx)

    def _connect(self):
        """Establish connection to RabbitMQ and declare exchange."""
        try:
            import pika
        except ImportError:
            self.error("pika module not found — install via: pip install pika")
            return

        params = pika.URLParameters(self.rabbitmq_url)
        params.socket_timeout = 5

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

        self.info(f"Connected to RabbitMQ for scan {self.getScanId()}")

    def watchedEvents(self):
        """Return list of event types this module watches.

        Returns:
            list: ["*"] to receive all events
        """
        return ["*"]

    def handleEvent(self, sfEvent):
        """Handle an event by publishing it to RabbitMQ.

        Args:
            sfEvent: SpiderFootEvent to store
        """
        if not self.opts['_store']:
            return

        if not self.channel:
            self.error("RabbitMQ channel not available — skipping event storage")
            return

        scan_id = self.getScanId()

        # Serialize event to JSON message
        # Using event attributes directly instead of asDict() for more control
        event_data = {
            'hash': sfEvent.hash if hasattr(sfEvent, 'hash') else '',
            'type': sfEvent.eventType,
            'generated': sfEvent.generated,
            'confidence': sfEvent.confidence if hasattr(sfEvent, 'confidence') else 100,
            'visibility': sfEvent.visibility if hasattr(sfEvent, 'visibility') else 100,
            'risk': sfEvent.risk if hasattr(sfEvent, 'risk') else 0,
            'module': sfEvent.module,
            'data': sfEvent.data,
            'source_event_hash': sfEvent.sourceEventHash if hasattr(sfEvent, 'sourceEventHash') else None
        }

        message = {
            'scan_id': scan_id,
            'event': event_data,
            'lifecycle': None
        }

        try:
            self.channel.basic_publish(
                exchange=self.exchange_name,
                routing_key=scan_id,  # Route to scan-specific queue
                body=json.dumps(message).encode('utf-8'),
                properties=pika.BasicProperties(
                    delivery_mode=2,  # Persistent message
                    content_type='application/json',
                )
            )
            self.debug(f"Published event {sfEvent.eventType} to RabbitMQ")
        except Exception as e:
            self.error(f"Failed to publish event to RabbitMQ: {e}")
            # Attempt to reconnect
            try:
                self._connect()
            except Exception as reconnect_error:
                self.error(f"Failed to reconnect to RabbitMQ: {reconnect_error}")

    def finished(self):
        """Called when scan finishes. Send lifecycle FINISHED message."""
        if not self.channel:
            return

        scan_id = self.getScanId()

        # Send lifecycle completion message
        message = {
            'scan_id': scan_id,
            'event': None,
            'lifecycle': 'FINISHED'
        }

        try:
            self.channel.basic_publish(
                exchange=self.exchange_name,
                routing_key=scan_id,
                body=json.dumps(message).encode('utf-8'),
                properties=pika.BasicProperties(
                    delivery_mode=2,
                    content_type='application/json',
                )
            )
            self.info(f"Published FINISHED lifecycle message for scan {scan_id}")
        except Exception as e:
            self.error(f"Failed to publish FINISHED message: {e}")
        finally:
            # Close connection
            try:
                if self.connection and not self.connection.is_closed:
                    self.connection.close()
                    self.debug("Closed RabbitMQ connection")
            except Exception as close_error:
                self.error(f"Error closing RabbitMQ connection: {close_error}")

# End of sfp__stor_rabbitmq class
