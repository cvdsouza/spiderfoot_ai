# -*- coding: utf-8 -*-
# -------------------------------------------------------------------------------
# Name:         sfdb
# Purpose:      Common functions for working with the database back-end.
#
# Author:      Steve Micallef <steve@binarypool.com>
#
# Created:     15/05/2012
# Copyright:   (c) Steve Micallef 2012
# Licence:     MIT
# -------------------------------------------------------------------------------

from pathlib import Path
import hashlib
import logging
import random
import re
import sqlite3
import threading
import time

log = logging.getLogger(f"spiderfoot.{__name__}")


class SpiderFootDb:
    """SpiderFoot database

    Attributes:
        conn: SQLite connect() connection
        dbh: SQLite cursor() database handle
        dbhLock (_thread.RLock): thread lock on database handle
    """

    dbh = None
    conn = None

    # Prevent multithread access to sqlite database
    dbhLock = threading.RLock()

    # Queries for creating the SpiderFoot database
    createSchemaQueries = [
        "PRAGMA journal_mode=WAL",
        "CREATE TABLE tbl_event_types ( \
            event       VARCHAR NOT NULL PRIMARY KEY, \
            event_descr VARCHAR NOT NULL, \
            event_raw   INT NOT NULL DEFAULT 0, \
            event_type  VARCHAR NOT NULL \
        )",
        "CREATE TABLE tbl_config ( \
            scope   VARCHAR NOT NULL, \
            opt     VARCHAR NOT NULL, \
            val     VARCHAR NOT NULL, \
            PRIMARY KEY (scope, opt) \
        )",
        "CREATE TABLE tbl_scan_instance ( \
            guid        VARCHAR NOT NULL PRIMARY KEY, \
            name        VARCHAR NOT NULL, \
            seed_target VARCHAR NOT NULL, \
            created     INT DEFAULT 0, \
            started     INT DEFAULT 0, \
            ended       INT DEFAULT 0, \
            status      VARCHAR NOT NULL \
        )",
        "CREATE TABLE tbl_scan_log ( \
            scan_instance_id    VARCHAR NOT NULL REFERENCES tbl_scan_instance(guid), \
            generated           INT NOT NULL, \
            component           VARCHAR, \
            type                VARCHAR NOT NULL, \
            message             VARCHAR \
        )",
        "CREATE TABLE tbl_scan_config ( \
            scan_instance_id    VARCHAR NOT NULL REFERENCES tbl_scan_instance(guid), \
            component           VARCHAR NOT NULL, \
            opt                 VARCHAR NOT NULL, \
            val                 VARCHAR NOT NULL \
        )",
        "CREATE TABLE tbl_scan_results ( \
            scan_instance_id    VARCHAR NOT NULL REFERENCES tbl_scan_instance(guid), \
            hash                VARCHAR NOT NULL, \
            type                VARCHAR NOT NULL REFERENCES tbl_event_types(event), \
            generated           INT NOT NULL, \
            confidence          INT NOT NULL DEFAULT 100, \
            visibility          INT NOT NULL DEFAULT 100, \
            risk                INT NOT NULL DEFAULT 0, \
            module              VARCHAR NOT NULL, \
            data                VARCHAR, \
            false_positive      INT NOT NULL DEFAULT 0, \
            source_event_hash  VARCHAR DEFAULT 'ROOT' \
        )",
        "CREATE TABLE tbl_scan_correlation_results ( \
            id                  VARCHAR NOT NULL PRIMARY KEY, \
            scan_instance_id    VARCHAR NOT NULL REFERENCES tbl_scan_instances(guid), \
            title               VARCHAR NOT NULL, \
            rule_risk           VARCHAR NOT NULL, \
            rule_id             VARCHAR NOT NULL, \
            rule_name           VARCHAR NOT NULL, \
            rule_descr          VARCHAR NOT NULL, \
            rule_logic          VARCHAR NOT NULL \
        )",
        "CREATE TABLE tbl_scan_correlation_results_events ( \
            correlation_id      VARCHAR NOT NULL REFERENCES tbl_scan_correlation_results(id), \
            event_hash          VARCHAR NOT NULL REFERENCES tbl_scan_results(hash) \
        )",
        "CREATE INDEX idx_scan_results_id ON tbl_scan_results (scan_instance_id)",
        "CREATE INDEX idx_scan_results_type ON tbl_scan_results (scan_instance_id, type)",
        "CREATE INDEX idx_scan_results_hash ON tbl_scan_results (scan_instance_id, hash)",
        "CREATE INDEX idx_scan_results_module ON tbl_scan_results(scan_instance_id, module)",
        "CREATE INDEX idx_scan_results_srchash ON tbl_scan_results (scan_instance_id, source_event_hash)",
        "CREATE INDEX idx_scan_logs ON tbl_scan_log (scan_instance_id)",
        "CREATE INDEX idx_scan_correlation ON tbl_scan_correlation_results (scan_instance_id, id)",
        "CREATE INDEX idx_scan_correlation_events ON tbl_scan_correlation_results_events (correlation_id)",
        "CREATE TABLE tbl_scan_ai_analysis ( \
            id                  VARCHAR NOT NULL PRIMARY KEY, \
            scan_instance_id    VARCHAR NOT NULL REFERENCES tbl_scan_instance(guid), \
            provider            VARCHAR NOT NULL, \
            model               VARCHAR NOT NULL, \
            mode                VARCHAR NOT NULL, \
            created             INT DEFAULT 0, \
            status              VARCHAR NOT NULL DEFAULT 'pending', \
            result_json         TEXT, \
            token_usage         INT DEFAULT 0, \
            error               VARCHAR \
        )",
        "CREATE INDEX idx_scan_ai_analysis ON tbl_scan_ai_analysis (scan_instance_id)",
        "CREATE TABLE tbl_scan_ai_chat ( \
            id                  VARCHAR NOT NULL PRIMARY KEY, \
            scan_instance_id    VARCHAR NOT NULL REFERENCES tbl_scan_instance(guid), \
            role                VARCHAR NOT NULL, \
            content             TEXT NOT NULL, \
            token_usage         INT DEFAULT 0, \
            created             INT NOT NULL \
        )",
        "CREATE INDEX idx_scan_ai_chat ON tbl_scan_ai_chat (scan_instance_id, created)",
        "CREATE TABLE tbl_correlation_rules ( \
            id              VARCHAR NOT NULL PRIMARY KEY, \
            rule_id         VARCHAR NOT NULL UNIQUE, \
            yaml_content    TEXT NOT NULL, \
            enabled         INT DEFAULT 1, \
            created         INT NOT NULL, \
            updated         INT NOT NULL \
        )",
        # ── RBAC tables (Phase 10) ──────────────────────────────────────
        "CREATE TABLE tbl_users ( \
            id           VARCHAR NOT NULL PRIMARY KEY, \
            username     VARCHAR NOT NULL UNIQUE, \
            password     VARCHAR NOT NULL, \
            display_name VARCHAR NOT NULL DEFAULT '', \
            email        VARCHAR NOT NULL DEFAULT '', \
            is_active    INT NOT NULL DEFAULT 1, \
            created      INT NOT NULL DEFAULT 0, \
            updated      INT NOT NULL DEFAULT 0 \
        )",
        "CREATE TABLE tbl_roles ( \
            id          VARCHAR NOT NULL PRIMARY KEY, \
            name        VARCHAR NOT NULL UNIQUE, \
            description VARCHAR NOT NULL DEFAULT '' \
        )",
        "CREATE TABLE tbl_permissions ( \
            id       VARCHAR NOT NULL PRIMARY KEY, \
            resource VARCHAR NOT NULL, \
            action   VARCHAR NOT NULL, \
            UNIQUE(resource, action) \
        )",
        "CREATE TABLE tbl_user_roles ( \
            user_id VARCHAR NOT NULL, \
            role_id VARCHAR NOT NULL, \
            PRIMARY KEY (user_id, role_id) \
        )",
        "CREATE TABLE tbl_role_permissions ( \
            role_id       VARCHAR NOT NULL, \
            permission_id VARCHAR NOT NULL, \
            PRIMARY KEY (role_id, permission_id) \
        )",
        "CREATE TABLE tbl_audit_log ( \
            id          VARCHAR NOT NULL PRIMARY KEY, \
            user_id     VARCHAR NOT NULL, \
            username    VARCHAR NOT NULL, \
            action      VARCHAR NOT NULL, \
            resource    VARCHAR NOT NULL, \
            resource_id VARCHAR NOT NULL DEFAULT '', \
            details     VARCHAR NOT NULL DEFAULT '', \
            ip_address  VARCHAR NOT NULL DEFAULT '', \
            created     INT NOT NULL DEFAULT 0 \
        )",
        "CREATE INDEX idx_audit_log_user ON tbl_audit_log (user_id)",
        "CREATE INDEX idx_audit_log_created ON tbl_audit_log (created)",
        # ── Worker registry (Phase 11) ───────────────────────────────────
        "CREATE TABLE tbl_workers ( \
            id           VARCHAR NOT NULL PRIMARY KEY, \
            name         VARCHAR NOT NULL, \
            host         VARCHAR NOT NULL, \
            queue_type   VARCHAR NOT NULL DEFAULT 'fast', \
            status       VARCHAR NOT NULL DEFAULT 'idle', \
            current_scan VARCHAR NOT NULL DEFAULT '', \
            last_seen    INT NOT NULL DEFAULT 0, \
            registered   INT NOT NULL DEFAULT 0 \
        )",
        "CREATE INDEX idx_workers_status ON tbl_workers (status)",
    ]

    eventDetails = [
        ['ROOT', 'Internal SpiderFoot Root event', 1, 'INTERNAL'],
        ['ACCOUNT_EXTERNAL_OWNED', 'Account on External Site', 0, 'ENTITY'],
        ['ACCOUNT_EXTERNAL_OWNED_COMPROMISED', 'Hacked Account on External Site', 0, 'DESCRIPTOR'],
        ['ACCOUNT_EXTERNAL_USER_SHARED_COMPROMISED', 'Hacked User Account on External Site', 0, 'DESCRIPTOR'],
        ['AFFILIATE_EMAILADDR', 'Affiliate - Email Address', 0, 'ENTITY'],
        ['AFFILIATE_INTERNET_NAME', 'Affiliate - Internet Name', 0, 'ENTITY'],
        ['AFFILIATE_INTERNET_NAME_HIJACKABLE', 'Affiliate - Internet Name Hijackable', 0, 'ENTITY'],
        ['AFFILIATE_INTERNET_NAME_UNRESOLVED', 'Affiliate - Internet Name - Unresolved', 0, 'ENTITY'],
        ['AFFILIATE_IPADDR', 'Affiliate - IP Address', 0, 'ENTITY'],
        ['AFFILIATE_IPV6_ADDRESS', 'Affiliate - IPv6 Address', 0, 'ENTITY'],
        ['AFFILIATE_WEB_CONTENT', 'Affiliate - Web Content', 1, 'DATA'],
        ['AFFILIATE_DOMAIN_NAME', 'Affiliate - Domain Name', 0, 'ENTITY'],
        ['AFFILIATE_DOMAIN_UNREGISTERED', 'Affiliate - Domain Name Unregistered', 0, 'ENTITY'],
        ['AFFILIATE_COMPANY_NAME', 'Affiliate - Company Name', 0, 'ENTITY'],
        ['AFFILIATE_DOMAIN_WHOIS', 'Affiliate - Domain Whois', 1, 'DATA'],
        ['AFFILIATE_DESCRIPTION_CATEGORY', 'Affiliate Description - Category', 0, 'DESCRIPTOR'],
        ['AFFILIATE_DESCRIPTION_ABSTRACT', 'Affiliate Description - Abstract', 0, 'DESCRIPTOR'],
        ['APPSTORE_ENTRY', 'App Store Entry', 0, 'ENTITY'],
        ['CLOUD_STORAGE_BUCKET', 'Cloud Storage Bucket', 0, 'ENTITY'],
        ['CLOUD_STORAGE_BUCKET_OPEN', 'Cloud Storage Bucket Open', 0, 'DESCRIPTOR'],
        ['COMPANY_NAME', 'Company Name', 0, 'ENTITY'],
        ['CREDIT_CARD_NUMBER', 'Credit Card Number', 0, 'ENTITY'],
        ['BASE64_DATA', 'Base64-encoded Data', 1, 'DATA'],
        ['BITCOIN_ADDRESS', 'Bitcoin Address', 0, 'ENTITY'],
        ['BITCOIN_BALANCE', 'Bitcoin Balance', 0, 'DESCRIPTOR'],
        ['BGP_AS_OWNER', 'BGP AS Ownership', 0, 'ENTITY'],
        ['BGP_AS_MEMBER', 'BGP AS Membership', 0, 'ENTITY'],
        ['BLACKLISTED_COHOST', 'Blacklisted Co-Hosted Site', 0, 'DESCRIPTOR'],
        ['BLACKLISTED_INTERNET_NAME', 'Blacklisted Internet Name', 0, 'DESCRIPTOR'],
        ['BLACKLISTED_AFFILIATE_INTERNET_NAME', 'Blacklisted Affiliate Internet Name', 0, 'DESCRIPTOR'],
        ['BLACKLISTED_IPADDR', 'Blacklisted IP Address', 0, 'DESCRIPTOR'],
        ['BLACKLISTED_AFFILIATE_IPADDR', 'Blacklisted Affiliate IP Address', 0, 'DESCRIPTOR'],
        ['BLACKLISTED_SUBNET', 'Blacklisted IP on Same Subnet', 0, 'DESCRIPTOR'],
        ['BLACKLISTED_NETBLOCK', 'Blacklisted IP on Owned Netblock', 0, 'DESCRIPTOR'],
        ['COUNTRY_NAME', 'Country Name', 0, 'ENTITY'],
        ['CO_HOSTED_SITE', 'Co-Hosted Site', 0, 'ENTITY'],
        ['CO_HOSTED_SITE_DOMAIN', 'Co-Hosted Site - Domain Name', 0, 'ENTITY'],
        ['CO_HOSTED_SITE_DOMAIN_WHOIS', 'Co-Hosted Site - Domain Whois', 1, 'DATA'],
        ['DARKNET_MENTION_URL', 'Darknet Mention URL', 0, 'DESCRIPTOR'],
        ['DARKNET_MENTION_CONTENT', 'Darknet Mention Web Content', 1, 'DATA'],
        ['DATE_HUMAN_DOB', 'Date of Birth', 0, 'ENTITY'],
        ['DEFACED_INTERNET_NAME', 'Defaced', 0, 'DESCRIPTOR'],
        ['DEFACED_IPADDR', 'Defaced IP Address', 0, 'DESCRIPTOR'],
        ['DEFACED_AFFILIATE_INTERNET_NAME', 'Defaced Affiliate', 0, 'DESCRIPTOR'],
        ['DEFACED_COHOST', 'Defaced Co-Hosted Site', 0, 'DESCRIPTOR'],
        ['DEFACED_AFFILIATE_IPADDR', 'Defaced Affiliate IP Address', 0, 'DESCRIPTOR'],
        ['DESCRIPTION_CATEGORY', 'Description - Category', 0, 'DESCRIPTOR'],
        ['DESCRIPTION_ABSTRACT', 'Description - Abstract', 0, 'DESCRIPTOR'],
        ['DEVICE_TYPE', 'Device Type', 0, 'DESCRIPTOR'],
        ['DNS_TEXT', 'DNS TXT Record', 0, 'DATA'],
        ['DNS_SRV', 'DNS SRV Record', 0, 'DATA'],
        ['DNS_SPF', 'DNS SPF Record', 0, 'DATA'],
        ['DOMAIN_NAME', 'Domain Name', 0, 'ENTITY'],
        ['DOMAIN_NAME_PARENT', 'Domain Name (Parent)', 0, 'ENTITY'],
        ['DOMAIN_REGISTRAR', 'Domain Registrar', 0, 'ENTITY'],
        ['DOMAIN_WHOIS', 'Domain Whois', 1, 'DATA'],
        ['EMAILADDR', 'Email Address', 0, 'ENTITY'],
        ['EMAILADDR_COMPROMISED', 'Hacked Email Address', 0, 'DESCRIPTOR'],
        ['EMAILADDR_DELIVERABLE', 'Deliverable Email Address', 0, 'DESCRIPTOR'],
        ['EMAILADDR_DISPOSABLE', 'Disposable Email Address', 0, 'DESCRIPTOR'],
        ['EMAILADDR_GENERIC', 'Email Address - Generic', 0, 'ENTITY'],
        ['EMAILADDR_UNDELIVERABLE', 'Undeliverable Email Address', 0, 'DESCRIPTOR'],
        ['ERROR_MESSAGE', 'Error Message', 0, 'DATA'],
        ['ETHEREUM_ADDRESS', 'Ethereum Address', 0, 'ENTITY'],
        ['ETHEREUM_BALANCE', 'Ethereum Balance', 0, 'DESCRIPTOR'],
        ['GEOINFO', 'Physical Location', 0, 'DESCRIPTOR'],
        ['HASH', 'Hash', 0, 'DATA'],
        ['HASH_COMPROMISED', 'Compromised Password Hash', 0, 'DATA'],
        ['HTTP_CODE', 'HTTP Status Code', 0, 'DATA'],
        ['HUMAN_NAME', 'Human Name', 0, 'ENTITY'],
        ['IBAN_NUMBER', 'IBAN Number', 0, 'ENTITY'],
        ['INTERESTING_FILE', 'Interesting File', 0, 'DESCRIPTOR'],
        ['INTERESTING_FILE_HISTORIC', 'Historic Interesting File', 0, 'DESCRIPTOR'],
        ['JUNK_FILE', 'Junk File', 0, 'DESCRIPTOR'],
        ['INTERNAL_IP_ADDRESS', 'IP Address - Internal Network', 0, 'ENTITY'],
        ['INTERNET_NAME', 'Internet Name', 0, 'ENTITY'],
        ['INTERNET_NAME_UNRESOLVED', 'Internet Name - Unresolved', 0, 'ENTITY'],
        ['IP_ADDRESS', 'IP Address', 0, 'ENTITY'],
        ['IPV6_ADDRESS', 'IPv6 Address', 0, 'ENTITY'],
        ['LEI', 'Legal Entity Identifier', 0, 'ENTITY'],
        ['JOB_TITLE', 'Job Title', 0, 'DESCRIPTOR'],
        ['LINKED_URL_INTERNAL', 'Linked URL - Internal', 0, 'SUBENTITY'],
        ['LINKED_URL_EXTERNAL', 'Linked URL - External', 0, 'SUBENTITY'],
        ['MALICIOUS_ASN', 'Malicious AS', 0, 'DESCRIPTOR'],
        ['MALICIOUS_BITCOIN_ADDRESS', 'Malicious Bitcoin Address', 0, 'DESCRIPTOR'],
        ['MALICIOUS_IPADDR', 'Malicious IP Address', 0, 'DESCRIPTOR'],
        ['MALICIOUS_COHOST', 'Malicious Co-Hosted Site', 0, 'DESCRIPTOR'],
        ['MALICIOUS_EMAILADDR', 'Malicious E-mail Address', 0, 'DESCRIPTOR'],
        ['MALICIOUS_INTERNET_NAME', 'Malicious Internet Name', 0, 'DESCRIPTOR'],
        ['MALICIOUS_AFFILIATE_INTERNET_NAME', 'Malicious Affiliate', 0, 'DESCRIPTOR'],
        ['MALICIOUS_AFFILIATE_IPADDR', 'Malicious Affiliate IP Address', 0, 'DESCRIPTOR'],
        ['MALICIOUS_NETBLOCK', 'Malicious IP on Owned Netblock', 0, 'DESCRIPTOR'],
        ['MALICIOUS_PHONE_NUMBER', 'Malicious Phone Number', 0, 'DESCRIPTOR'],
        ['MALICIOUS_SUBNET', 'Malicious IP on Same Subnet', 0, 'DESCRIPTOR'],
        ['NETBLOCK_OWNER', 'Netblock Ownership', 0, 'ENTITY'],
        ['NETBLOCKV6_OWNER', 'Netblock IPv6 Ownership', 0, 'ENTITY'],
        ['NETBLOCK_MEMBER', 'Netblock Membership', 0, 'ENTITY'],
        ['NETBLOCKV6_MEMBER', 'Netblock IPv6 Membership', 0, 'ENTITY'],
        ['NETBLOCK_WHOIS', 'Netblock Whois', 1, 'DATA'],
        ['OPERATING_SYSTEM', 'Operating System', 0, 'DESCRIPTOR'],
        ['LEAKSITE_URL', 'Leak Site URL', 0, 'ENTITY'],
        ['LEAKSITE_CONTENT', 'Leak Site Content', 1, 'DATA'],
        ['PASSWORD_COMPROMISED', 'Compromised Password', 0, 'DATA'],
        ['PHONE_NUMBER', 'Phone Number', 0, 'ENTITY'],
        ['PHONE_NUMBER_COMPROMISED', 'Phone Number Compromised', 0, 'DESCRIPTOR'],
        ['PHONE_NUMBER_TYPE', 'Phone Number Type', 0, 'DESCRIPTOR'],
        ['PHYSICAL_ADDRESS', 'Physical Address', 0, 'ENTITY'],
        ['PHYSICAL_COORDINATES', 'Physical Coordinates', 0, 'ENTITY'],
        ['PGP_KEY', 'PGP Public Key', 0, 'DATA'],
        ['PROXY_HOST', 'Proxy Host', 0, 'DESCRIPTOR'],
        ['PROVIDER_DNS', 'Name Server (DNS ''NS'' Records)', 0, 'ENTITY'],
        ['PROVIDER_JAVASCRIPT', 'Externally Hosted Javascript', 0, 'ENTITY'],
        ['PROVIDER_MAIL', 'Email Gateway (DNS ''MX'' Records)', 0, 'ENTITY'],
        ['PROVIDER_HOSTING', 'Hosting Provider', 0, 'ENTITY'],
        ['PROVIDER_TELCO', 'Telecommunications Provider', 0, 'ENTITY'],
        ['PUBLIC_CODE_REPO', 'Public Code Repository', 0, 'ENTITY'],
        ['RAW_RIR_DATA', 'Raw Data from RIRs/APIs', 1, 'DATA'],
        ['RAW_DNS_RECORDS', 'Raw DNS Records', 1, 'DATA'],
        ['RAW_FILE_META_DATA', 'Raw File Meta Data', 1, 'DATA'],
        ['SEARCH_ENGINE_WEB_CONTENT', 'Search Engine Web Content', 1, 'DATA'],
        ['SOCIAL_MEDIA', 'Social Media Presence', 0, 'ENTITY'],
        ['SIMILAR_ACCOUNT_EXTERNAL', 'Similar Account on External Site', 0, 'ENTITY'],
        ['SIMILARDOMAIN', 'Similar Domain', 0, 'ENTITY'],
        ['SIMILARDOMAIN_WHOIS', 'Similar Domain - Whois', 1, 'DATA'],
        ['SOFTWARE_USED', 'Software Used', 0, 'SUBENTITY'],
        ['SSL_CERTIFICATE_RAW', 'SSL Certificate - Raw Data', 1, 'DATA'],
        ['SSL_CERTIFICATE_ISSUED', 'SSL Certificate - Issued to', 0, 'ENTITY'],
        ['SSL_CERTIFICATE_ISSUER', 'SSL Certificate - Issued by', 0, 'ENTITY'],
        ['SSL_CERTIFICATE_MISMATCH', 'SSL Certificate Host Mismatch', 0, 'DESCRIPTOR'],
        ['SSL_CERTIFICATE_EXPIRED', 'SSL Certificate Expired', 0, 'DESCRIPTOR'],
        ['SSL_CERTIFICATE_EXPIRING', 'SSL Certificate Expiring', 0, 'DESCRIPTOR'],
        ['TARGET_WEB_CONTENT', 'Web Content', 1, 'DATA'],
        ['TARGET_WEB_CONTENT_TYPE', 'Web Content Type', 0, 'DESCRIPTOR'],
        ['TARGET_WEB_COOKIE', 'Cookies', 0, 'DATA'],
        ['TCP_PORT_OPEN', 'Open TCP Port', 0, 'SUBENTITY'],
        ['TCP_PORT_OPEN_BANNER', 'Open TCP Port Banner', 0, 'DATA'],
        ['TOR_EXIT_NODE', 'TOR Exit Node', 0, 'DESCRIPTOR'],
        ['UDP_PORT_OPEN', 'Open UDP Port', 0, 'SUBENTITY'],
        ['UDP_PORT_OPEN_INFO', 'Open UDP Port Information', 0, 'DATA'],
        ['URL_ADBLOCKED_EXTERNAL', 'URL (AdBlocked External)', 0, 'DESCRIPTOR'],
        ['URL_ADBLOCKED_INTERNAL', 'URL (AdBlocked Internal)', 0, 'DESCRIPTOR'],
        ['URL_FORM', 'URL (Form)', 0, 'DESCRIPTOR'],
        ['URL_FLASH', 'URL (Uses Flash)', 0, 'DESCRIPTOR'],
        ['URL_JAVASCRIPT', 'URL (Uses Javascript)', 0, 'DESCRIPTOR'],
        ['URL_WEB_FRAMEWORK', 'URL (Uses a Web Framework)', 0, 'DESCRIPTOR'],
        ['URL_JAVA_APPLET', 'URL (Uses Java Applet)', 0, 'DESCRIPTOR'],
        ['URL_STATIC', 'URL (Purely Static)', 0, 'DESCRIPTOR'],
        ['URL_PASSWORD', 'URL (Accepts Passwords)', 0, 'DESCRIPTOR'],
        ['URL_UPLOAD', 'URL (Accepts Uploads)', 0, 'DESCRIPTOR'],
        ['URL_FORM_HISTORIC', 'Historic URL (Form)', 0, 'DESCRIPTOR'],
        ['URL_FLASH_HISTORIC', 'Historic URL (Uses Flash)', 0, 'DESCRIPTOR'],
        ['URL_JAVASCRIPT_HISTORIC', 'Historic URL (Uses Javascript)', 0, 'DESCRIPTOR'],
        ['URL_WEB_FRAMEWORK_HISTORIC', 'Historic URL (Uses a Web Framework)', 0, 'DESCRIPTOR'],
        ['URL_JAVA_APPLET_HISTORIC', 'Historic URL (Uses Java Applet)', 0, 'DESCRIPTOR'],
        ['URL_STATIC_HISTORIC', 'Historic URL (Purely Static)', 0, 'DESCRIPTOR'],
        ['URL_PASSWORD_HISTORIC', 'Historic URL (Accepts Passwords)', 0, 'DESCRIPTOR'],
        ['URL_UPLOAD_HISTORIC', 'Historic URL (Accepts Uploads)', 0, 'DESCRIPTOR'],
        ['USERNAME', 'Username', 0, 'ENTITY'],
        ['VPN_HOST', 'VPN Host', 0, 'DESCRIPTOR'],
        ['VULNERABILITY_DISCLOSURE', 'Vulnerability - Third Party Disclosure', 0, 'DESCRIPTOR'],
        ['VULNERABILITY_CVE_CRITICAL', 'Vulnerability - CVE Critical', 0, 'DESCRIPTOR'],
        ['VULNERABILITY_CVE_HIGH', 'Vulnerability - CVE High', 0, 'DESCRIPTOR'],
        ['VULNERABILITY_CVE_MEDIUM', 'Vulnerability - CVE Medium', 0, 'DESCRIPTOR'],
        ['VULNERABILITY_CVE_LOW', 'Vulnerability - CVE Low', 0, 'DESCRIPTOR'],
        ['VULNERABILITY_GENERAL', 'Vulnerability - General', 0, 'DESCRIPTOR'],
        ['WEB_ANALYTICS_ID', 'Web Analytics', 0, 'ENTITY'],
        ['WEBSERVER_BANNER', 'Web Server', 0, 'DATA'],
        ['WEBSERVER_HTTPHEADERS', 'HTTP Headers', 1, 'DATA'],
        ['WEBSERVER_STRANGEHEADER', 'Non-Standard HTTP Header', 0, 'DATA'],
        ['WEBSERVER_TECHNOLOGY', 'Web Technology', 0, 'DESCRIPTOR'],
        ['WIFI_ACCESS_POINT', 'WiFi Access Point Nearby', 0, 'ENTITY'],
        ['WIKIPEDIA_PAGE_EDIT', 'Wikipedia Page Edit', 0, 'DESCRIPTOR'],
    ]

    def __init__(self, opts: dict, init: bool = False) -> None:
        """Initialize database and create handle to the SQLite database file.
        Creates the database file if it does not exist.
        Creates database schema if it does not exist.

        Args:
            opts (dict): must specify the database file path in the '__database' key
            init (bool): initialise the database schema.
                         if the database file does not exist this option will be ignored.

        Raises:
            TypeError: arg type was invalid
            ValueError: arg value was invalid
            IOError: database I/O failed
        """

        if not isinstance(opts, dict):
            raise TypeError(f"opts is {type(opts)}; expected dict()") from None
        if not opts:
            raise ValueError("opts is empty") from None
        if not opts.get('__database'):
            raise ValueError("opts['__database'] is empty") from None

        database_path = opts['__database']

        # create database directory
        Path(database_path).parent.mkdir(exist_ok=True, parents=True)

        # connect() will create the database file if it doesn't exist, but
        # at least we can use this opportunity to ensure we have permissions to
        # read and write to such a file.
        try:
            dbh = sqlite3.connect(database_path, check_same_thread=False)
        except Exception as e:
            raise IOError(f"Error connecting to internal database {database_path}") from e

        if dbh is None:
            raise IOError(f"Could not connect to internal database, and could not create {database_path}") from None

        dbh.text_factory = str

        self.conn = dbh
        self.dbh = dbh.cursor()

        def __dbregex__(qry: str, data: str) -> bool:
            """SQLite doesn't support regex queries, so we create
            a custom function to do so.

            Args:
                qry (str): TBD
                data (str): TBD

            Returns:
                bool: matches
            """

            try:
                rx = re.compile(qry, re.IGNORECASE | re.DOTALL)
                ret = rx.match(data)
            except Exception:
                return False
            return ret is not None

        # Now we actually check to ensure the database file has the schema set
        # up correctly.
        with self.dbhLock:
            try:
                self.dbh.execute('SELECT COUNT(*) FROM tbl_scan_config')
                self.conn.create_function("REGEXP", 2, __dbregex__)
            except sqlite3.Error:
                init = True
                try:
                    self.create()
                except Exception as e:
                    raise IOError("Tried to set up the SpiderFoot database schema, but failed") from e

            # For users with pre 4.0 databases, add the correlation
            # tables + indexes if they don't exist.
            try:
                self.dbh.execute("SELECT COUNT(*) FROM tbl_scan_correlation_results")
            except sqlite3.Error:
                try:
                    for query in self.createSchemaQueries:
                        if "correlation" in query:
                            self.dbh.execute(query)
                        self.conn.commit()
                except sqlite3.Error:
                    raise IOError("Looks like you are running a pre-4.0 database. Unfortunately "
                                  "SpiderFoot wasn't able to migrate you, so you'll need to delete "
                                  "your SpiderFoot database in order to proceed.") from None

            # Add AI analysis table if it doesn't exist (for pre-Phase 8 databases)
            try:
                self.dbh.execute("SELECT COUNT(*) FROM tbl_scan_ai_analysis")
            except sqlite3.Error:
                try:
                    for query in self.createSchemaQueries:
                        if "ai_analysis" in query:
                            self.dbh.execute(query)
                    self.conn.commit()
                except sqlite3.Error:
                    pass  # Non-critical, will be created on next full init

            # Add AI chat table if it doesn't exist (for pre-Phase 8b databases)
            try:
                self.dbh.execute("SELECT COUNT(*) FROM tbl_scan_ai_chat")
            except sqlite3.Error:
                try:
                    for query in self.createSchemaQueries:
                        if "ai_chat" in query:
                            self.dbh.execute(query)
                    self.conn.commit()
                except sqlite3.Error:
                    pass  # Non-critical, will be created on next full init

            # Add correlation rules table if it doesn't exist (for pre-Phase 9 databases)
            try:
                self.dbh.execute("SELECT COUNT(*) FROM tbl_correlation_rules")
            except sqlite3.Error:
                try:
                    for query in self.createSchemaQueries:
                        if "correlation_rules" in query and "tbl_scan_correlation" not in query:
                            self.dbh.execute(query)
                    self.conn.commit()
                except sqlite3.Error:
                    pass  # Non-critical, will be created on next full init

            # Add RBAC tables if they don't exist (Phase 10)
            try:
                self.dbh.execute("SELECT COUNT(*) FROM tbl_users")
            except sqlite3.Error:
                try:
                    rbac_keywords = ("tbl_users", "tbl_roles", "tbl_permissions",
                                     "tbl_user_roles", "tbl_role_permissions",
                                     "tbl_audit_log", "idx_audit_log")
                    for query in self.createSchemaQueries:
                        if any(kw in query for kw in rbac_keywords):
                            self.dbh.execute(query)
                    self.conn.commit()
                except sqlite3.Error as e:
                    log.error(f"Failed to create RBAC tables: {e}")

            # Seed RBAC data (idempotent)
            self._seed_rbac_data()

            # Add worker registry table if it doesn't exist (Phase 11)
            try:
                self.dbh.execute("SELECT COUNT(*) FROM tbl_workers")
            except sqlite3.Error:
                try:
                    for query in self.createSchemaQueries:
                        if "tbl_workers" in query or "idx_workers" in query:
                            self.dbh.execute(query)
                    self.conn.commit()
                except sqlite3.Error as e:
                    log.error(f"Failed to create tbl_workers: {e}")

            if init:
                for row in self.eventDetails:
                    event = row[0]
                    event_descr = row[1]
                    event_raw = row[2]
                    event_type = row[3]
                    qry = "INSERT INTO tbl_event_types (event, event_descr, event_raw, event_type) VALUES (?, ?, ?, ?)"

                    try:
                        self.dbh.execute(qry, (
                            event, event_descr, event_raw, event_type
                        ))
                        self.conn.commit()
                    except Exception:
                        continue
                self.conn.commit()

    #
    # Back-end database operations
    #

    def create(self) -> None:
        """Create the database schema.

        Raises:
            IOError: database I/O failed
        """

        with self.dbhLock:
            try:
                for qry in self.createSchemaQueries:
                    self.dbh.execute(qry)
                self.conn.commit()
                for row in self.eventDetails:
                    event = row[0]
                    event_descr = row[1]
                    event_raw = row[2]
                    event_type = row[3]
                    qry = "INSERT INTO tbl_event_types (event, event_descr, event_raw, event_type) VALUES (?, ?, ?, ?)"

                    self.dbh.execute(qry, (
                        event, event_descr, event_raw, event_type
                    ))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when setting up database") from e

    def close(self) -> None:
        """Close the database handle."""

        with self.dbhLock:
            self.dbh.close()

    def vacuumDB(self) -> None:
        """Vacuum the database. Clears unused database file pages.

        Returns:
            bool: success

        Raises:
            IOError: database I/O failed
        """
        with self.dbhLock:
            try:
                self.dbh.execute("VACUUM")
                self.conn.commit()
                return True
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when vacuuming the database") from e
        return False

    def search(self, criteria: dict, filterFp: bool = False) -> list:
        """Search database.

        Args:
            criteria (dict): search criteria such as:
                - scan_id (search within a scan, if omitted search all)
                - type (search a specific type, if omitted search all)
                - value (search values for a specific string, if omitted search all)
                - regex (search values for a regular expression)
                ** at least two criteria must be set **
            filterFp (bool): filter out false positives

        Returns:
            list: search results

        Raises:
            TypeError: arg type was invalid
            ValueError: arg value was invalid
            IOError: database I/O failed
        """
        if not isinstance(criteria, dict):
            raise TypeError(f"criteria is {type(criteria)}; expected dict()") from None

        valid_criteria = ['scan_id', 'type', 'value', 'regex']

        for key in list(criteria.keys()):
            if key not in valid_criteria:
                criteria.pop(key, None)
                continue

            if not isinstance(criteria.get(key), str):
                raise TypeError(f"criteria[{key}] is {type(criteria.get(key))}; expected str()") from None

            if not criteria[key]:
                criteria.pop(key, None)
                continue

        if len(criteria) == 0:
            raise ValueError(f"No valid search criteria provided; expected: {', '.join(valid_criteria)}") from None

        if len(criteria) == 1:
            raise ValueError("Only one search criteria provided; expected at least two")

        qvars = list()
        qry = "SELECT ROUND(c.generated) AS generated, c.data, \
            s.data as 'source_data', \
            c.module, c.type, c.confidence, c.visibility, c.risk, c.hash, \
            c.source_event_hash, t.event_descr, t.event_type, c.scan_instance_id, \
            c.false_positive as 'fp', s.false_positive as 'parent_fp' \
            FROM tbl_scan_results c, tbl_scan_results s, tbl_event_types t \
            WHERE s.scan_instance_id = c.scan_instance_id AND \
            t.event = c.type AND c.source_event_hash = s.hash "

        if filterFp:
            qry += " AND COALESCE(c.false_positive, 0) <> 1 "

        if criteria.get('scan_id') is not None:
            qry += "AND c.scan_instance_id = ? "
            qvars.append(criteria['scan_id'])

        if criteria.get('type') is not None:
            qry += " AND c.type = ? "
            qvars.append(criteria['type'])

        if criteria.get('value') is not None:
            qry += " AND (c.data LIKE ? OR s.data LIKE ?) "
            qvars.append(criteria['value'])
            qvars.append(criteria['value'])

        if criteria.get('regex') is not None:
            qry += " AND (c.data REGEXP ? OR s.data REGEXP ?) "
            qvars.append(criteria['regex'])
            qvars.append(criteria['regex'])

        qry += " ORDER BY c.data"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching search results") from e

    def eventTypes(self) -> list:
        """Get event types.

        Returns:
            list: event types

        Raises:
            IOError: database I/O failed
        """

        qry = "SELECT event_descr, event, event_raw, event_type FROM tbl_event_types"
        with self.dbhLock:
            try:
                self.dbh.execute(qry)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when retrieving event types") from e

    def scanLogEvents(self, batch: list) -> bool:
        """Logs a batch of events to the database.

        Args:
            batch (list): tuples containing: instanceId, classification, message, component, logTime

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed

        Returns:
            bool: Whether the logging operation succeeded
        """

        inserts = []

        for instanceId, classification, message, component, logTime in batch:
            if not isinstance(instanceId, str):
                raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

            if not isinstance(classification, str):
                raise TypeError(f"classification is {type(classification)}; expected str()") from None

            if not isinstance(message, str):
                raise TypeError(f"message is {type(message)}; expected str()") from None

            if not component:
                component = "SpiderFoot"

            inserts.append((instanceId, logTime * 1000, component, classification, message))

        if inserts:
            qry = "INSERT INTO tbl_scan_log \
                (scan_instance_id, generated, component, type, message) \
                VALUES (?, ?, ?, ?, ?)"

            with self.dbhLock:
                try:
                    self.dbh.executemany(qry, inserts)
                    self.conn.commit()
                except sqlite3.Error as e:
                    if "locked" not in e.args[0] and "thread" not in e.args[0]:
                        raise IOError("Unable to log scan event in database") from e
                    return False
        return True

    def scanLogEvent(self, instanceId: str, classification: str, message: str, component: str = None) -> None:
        """Log an event to the database.

        Args:
            instanceId (str): scan instance ID
            classification (str): TBD
            message (str): TBD
            component (str): TBD

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed

        Todo:
            Do something smarter to handle database locks
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        if not isinstance(classification, str):
            raise TypeError(f"classification is {type(classification)}; expected str()") from None

        if not isinstance(message, str):
            raise TypeError(f"message is {type(message)}; expected str()") from None

        if not component:
            component = "SpiderFoot"

        qry = "INSERT INTO tbl_scan_log \
            (scan_instance_id, generated, component, type, message) \
            VALUES (?, ?, ?, ?, ?)"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, (
                    instanceId, time.time() * 1000, component, classification, message
                ))
                self.conn.commit()
            except sqlite3.Error as e:
                if "locked" not in e.args[0] and "thread" not in e.args[0]:
                    raise IOError("Unable to log scan event in database") from e
                # print("[warning] Couldn't log due to SQLite limitations. You can probably ignore this.")
                # log.critical(f"Unable to log event in DB due to lock: {e.args[0]}")
                pass

    def scanInstanceCreate(self, instanceId: str, scanName: str, scanTarget: str) -> None:
        """Store a scan instance in the database.

        Args:
            instanceId (str): scan instance ID
            scanName(str): scan name
            scanTarget (str): scan target

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        if not isinstance(scanName, str):
            raise TypeError(f"scanName is {type(scanName)}; expected str()") from None

        if not isinstance(scanTarget, str):
            raise TypeError(f"scanTarget is {type(scanTarget)}; expected str()") from None

        qry = "INSERT INTO tbl_scan_instance \
            (guid, name, seed_target, created, status) \
            VALUES (?, ?, ?, ?, ?)"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, (
                    instanceId, scanName, scanTarget, time.time() * 1000, 'CREATED'
                ))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("Unable to create scan instance in database") from e

    def scanInstanceSet(self, instanceId: str, started: str = None, ended: str = None, status: str = None) -> None:
        """Update the start time, end time or status (or all 3) of a scan instance.

        Args:
            instanceId (str): scan instance ID
            started (str): scan start time
            ended (str): scan end time
            status (str): scan status

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        qvars = list()
        qry = "UPDATE tbl_scan_instance SET "

        if started is not None:
            qry += " started = ?,"
            qvars.append(started)

        if ended is not None:
            qry += " ended = ?,"
            qvars.append(ended)

        if status is not None:
            qry += " status = ?,"
            qvars.append(status)

        # guid = guid is a little hack to avoid messing with , placement above
        qry += " guid = guid WHERE guid = ?"
        qvars.append(instanceId)

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                self.conn.commit()
            except sqlite3.Error:
                raise IOError("Unable to set information for the scan instance.") from None

    def scanInstanceGet(self, instanceId: str) -> list:
        """Return info about a scan instance (name, target, created, started, ended, status)

        Args:
            instanceId (str): scan instance ID

        Returns:
            list: scan instance info

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        qry = "SELECT name, seed_target, ROUND(created/1000) AS created, \
            ROUND(started/1000) AS started, ROUND(ended/1000) AS ended, status \
            FROM tbl_scan_instance WHERE guid = ?"
        qvars = [instanceId]

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                return self.dbh.fetchone()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when retrieving scan instance") from e

    def scanResultSummary(self, instanceId: str, by: str = "type") -> list:
        """Obtain a summary of the results, filtered by event type, module or entity.

        Args:
            instanceId (str): scan instance ID
            by (str): filter by type

        Returns:
            list: scan instance info

        Raises:
            TypeError: arg type was invalid
            ValueError: arg value was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        if not isinstance(by, str):
            raise TypeError(f"by is {type(by)}; expected str()") from None

        if by not in ["type", "module", "entity"]:
            raise ValueError(f"Invalid filter by value: {by}") from None

        if by == "type":
            qry = "SELECT r.type, e.event_descr, MAX(ROUND(generated)) AS last_in, \
                count(*) AS total, count(DISTINCT r.data) as utotal FROM \
                tbl_scan_results r, tbl_event_types e WHERE e.event = r.type \
                AND r.scan_instance_id = ? GROUP BY r.type ORDER BY e.event_descr"

        if by == "module":
            qry = "SELECT r.module, '', MAX(ROUND(generated)) AS last_in, \
                count(*) AS total, count(DISTINCT r.data) as utotal FROM \
                tbl_scan_results r, tbl_event_types e WHERE e.event = r.type \
                AND r.scan_instance_id = ? GROUP BY r.module ORDER BY r.module DESC"

        if by == "entity":
            qry = "SELECT r.data, e.event_descr, MAX(ROUND(generated)) AS last_in, \
                count(*) AS total, count(DISTINCT r.data) as utotal FROM \
                tbl_scan_results r, tbl_event_types e WHERE e.event = r.type \
                AND r.scan_instance_id = ? \
                AND e.event_type in ('ENTITY') \
                GROUP BY r.data, e.event_descr ORDER BY total DESC limit 50"

        qvars = [instanceId]

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching result summary") from e

    def scanCorrelationSummary(self, instanceId: str, by: str = "rule") -> list:
        """Obtain a summary of the correlations, filtered by rule or risk

        Args:
            instanceId (str): scan instance ID
            by (str): filter by rule or risk

        Returns:
            list: scan correlation summary

        Raises:
            TypeError: arg type was invalid
            ValueError: arg value was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        if not isinstance(by, str):
            raise TypeError(f"by is {type(by)}; expected str()") from None

        if by not in ["rule", "risk"]:
            raise ValueError(f"Invalid filter by value: {by}") from None

        if by == "risk":
            qry = "SELECT rule_risk, count(*) AS total FROM \
                tbl_scan_correlation_results \
                WHERE scan_instance_id = ? GROUP BY rule_risk ORDER BY rule_id"

        if by == "rule":
            qry = "SELECT rule_id, rule_name, rule_risk, rule_descr, \
                count(*) AS total FROM \
                tbl_scan_correlation_results \
                WHERE scan_instance_id = ? GROUP BY rule_id ORDER BY rule_id"

        qvars = [instanceId]

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching correlation summary") from e

    def scanCorrelationList(self, instanceId: str) -> list:
        """Obtain a list of the correlations from a scan

        Args:
            instanceId (str): scan instance ID

        Returns:
            list: scan correlation list

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        qry = "SELECT c.id, c.title, c.rule_id, c.rule_risk, c.rule_name, \
            c.rule_descr, c.rule_logic, count(e.event_hash) AS event_count FROM \
            tbl_scan_correlation_results c, tbl_scan_correlation_results_events e \
            WHERE scan_instance_id = ? AND c.id = e.correlation_id \
            GROUP BY c.id ORDER BY c.title, c.rule_risk"

        qvars = [instanceId]

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching correlation list") from e

    def scanResultEvent(
        self,
        instanceId: str,
        eventType: str = 'ALL',
        srcModule: str = None,
        data: list = None,
        sourceId: list = None,
        correlationId: str = None,
        filterFp: bool = False
    ) -> list:
        """Obtain the data for a scan and event type.

        Args:
            instanceId (str): scan instance ID
            eventType (str): filter by event type
            srcModule (str): filter by the generating module
            data (list): filter by the data
            sourceId (list): filter by the ID of the source event
            correlationId (str): filter by the ID of a correlation result
            filterFp (bool): filter false positives

        Returns:
            list: scan results

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        if not isinstance(eventType, str) and not isinstance(eventType, list):
            raise TypeError(f"eventType is {type(eventType)}; expected str() or list()") from None

        qry = "SELECT ROUND(c.generated) AS generated, c.data, \
            s.data as 'source_data', \
            c.module, c.type, c.confidence, c.visibility, c.risk, c.hash, \
            c.source_event_hash, t.event_descr, t.event_type, s.scan_instance_id, \
            c.false_positive as 'fp', s.false_positive as 'parent_fp' \
            FROM tbl_scan_results c, tbl_scan_results s, tbl_event_types t "

        if correlationId:
            qry += ", tbl_scan_correlation_results_events ce "

        qry += "WHERE c.scan_instance_id = ? AND c.source_event_hash = s.hash AND \
            s.scan_instance_id = c.scan_instance_id AND t.event = c.type"

        qvars = [instanceId]

        if correlationId:
            qry += " AND ce.event_hash = c.hash AND ce.correlation_id = ?"
            qvars.append(correlationId)

        if eventType != "ALL":
            if isinstance(eventType, list):
                qry += " AND c.type in (" + ','.join(['?'] * len(eventType)) + ")"
                qvars.extend(eventType)
            else:
                qry += " AND c.type = ?"
                qvars.append(eventType)

        if filterFp:
            qry += " AND COALESCE(c.false_positive, 0) <> 1"

        if srcModule:
            if isinstance(srcModule, list):
                qry += " AND c.module in (" + ','.join(['?'] * len(srcModule)) + ")"
                qvars.extend(srcModule)
            else:
                qry += " AND c.module = ?"
                qvars.append(srcModule)

        if data:
            if isinstance(data, list):
                qry += " AND c.data in (" + ','.join(['?'] * len(data)) + ")"
                qvars.extend(data)
            else:
                qry += " AND c.data = ?"
                qvars.append(data)

        if sourceId:
            if isinstance(sourceId, list):
                qry += " AND c.source_event_hash in (" + ','.join(['?'] * len(sourceId)) + ")"
                qvars.extend(sourceId)
            else:
                qry += " AND c.source_event_hash = ?"
                qvars.append(sourceId)

        qry += " ORDER BY c.data"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching result events") from e

    def scanResultEventUnique(self, instanceId: str, eventType: str = 'ALL', filterFp: bool = False) -> list:
        """Obtain a unique list of elements.

        Args:
            instanceId (str): scan instance ID
            eventType (str): filter by event type
            filterFp (bool): filter false positives

        Returns:
            list: unique scan results

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        if not isinstance(eventType, str):
            raise TypeError(f"eventType is {type(eventType)}; expected str()") from None

        qry = "SELECT DISTINCT data, type, COUNT(*) FROM tbl_scan_results \
            WHERE scan_instance_id = ?"
        qvars = [instanceId]

        if eventType != "ALL":
            qry += " AND type = ?"
            qvars.append(eventType)

        if filterFp:
            qry += " AND COALESCE(false_positive, 0) <> 1"

        qry += " GROUP BY type, data ORDER BY COUNT(*)"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching unique result events") from e

    def scanLogs(self, instanceId: str, limit: int = None, fromRowId: int = 0, reverse: bool = False) -> list:
        """Get scan logs.

        Args:
            instanceId (str): scan instance ID
            limit (int): limit number of results
            fromRowId (int): retrieve logs starting from row ID
            reverse (bool): search result order

        Returns:
            list: scan logs

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        qry = "SELECT generated AS generated, component, \
            type, message, rowid FROM tbl_scan_log WHERE scan_instance_id = ?"
        if fromRowId:
            qry += " and rowid > ?"

        qry += " ORDER BY generated "
        if reverse:
            qry += "ASC"
        else:
            qry += "DESC"
        qvars = [instanceId]

        if fromRowId:
            qvars.append(str(fromRowId))

        if limit is not None:
            qry += " LIMIT ?"
            qvars.append(str(limit))

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching scan logs") from e

    def scanErrors(self, instanceId: str, limit: int = 0) -> list:
        """Get scan errors.

        Args:
            instanceId (str): scan instance ID
            limit (int): limit number of results

        Returns:
            list: scan errors

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        if not isinstance(limit, int):
            raise TypeError(f"limit is {type(limit)}; expected int()") from None

        qry = "SELECT generated AS generated, component, \
            message FROM tbl_scan_log WHERE scan_instance_id = ? \
            AND type = 'ERROR' ORDER BY generated DESC"
        qvars = [instanceId]

        if limit:
            qry += " LIMIT ?"
            qvars.append(str(limit))

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching scan errors") from e

    def scanInstanceDelete(self, instanceId: str) -> bool:
        """Delete a scan instance.

        Args:
            instanceId (str): scan instance ID

        Returns:
            bool: success

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        qry1 = "DELETE FROM tbl_scan_instance WHERE guid = ?"
        qry2 = "DELETE FROM tbl_scan_config WHERE scan_instance_id = ?"
        qry3 = "DELETE FROM tbl_scan_results WHERE scan_instance_id = ?"
        qry4 = "DELETE FROM tbl_scan_log WHERE scan_instance_id = ?"
        qry5 = "DELETE FROM tbl_scan_ai_analysis WHERE scan_instance_id = ?"
        qry6 = "DELETE FROM tbl_scan_ai_chat WHERE scan_instance_id = ?"
        qvars = [instanceId]

        with self.dbhLock:
            try:
                self.dbh.execute(qry1, qvars)
                self.dbh.execute(qry2, qvars)
                self.dbh.execute(qry3, qvars)
                self.dbh.execute(qry4, qvars)
                self.dbh.execute(qry5, qvars)
                self.dbh.execute(qry6, qvars)
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when deleting scan") from e

        return True

    def scanResultsUpdateFP(self, instanceId: str, resultHashes: list, fpFlag: int) -> bool:
        """Set the false positive flag for a result.

        Args:
            instanceId (str): scan instance ID
            resultHashes (list): list of event hashes
            fpFlag (int): false positive

        Returns:
            bool: success

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        if not isinstance(resultHashes, list):
            raise TypeError(f"resultHashes is {type(resultHashes)}; expected list()") from None

        with self.dbhLock:
            for resultHash in resultHashes:
                qry = "UPDATE tbl_scan_results SET false_positive = ? WHERE \
                    scan_instance_id = ? AND hash = ?"
                qvars = [fpFlag, instanceId, resultHash]
                try:
                    self.dbh.execute(qry, qvars)
                except sqlite3.Error as e:
                    raise IOError("SQL error encountered when updating false-positive") from e

            try:
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when updating false-positive") from e

        return True

    def configSet(self, optMap: dict = {}) -> bool:
        """Store the default configuration in the database.

        Args:
            optMap (dict): config options

        Returns:
            bool: success

        Raises:
            TypeError: arg type was invalid
            ValueError: arg value was invalid
            IOError: database I/O failed
        """

        if not isinstance(optMap, dict):
            raise TypeError(f"optMap is {type(optMap)}; expected dict()") from None
        if not optMap:
            raise ValueError("optMap is empty") from None

        qry = "REPLACE INTO tbl_config (scope, opt, val) VALUES (?, ?, ?)"

        with self.dbhLock:
            for opt in list(optMap.keys()):
                # Module option
                if ":" in opt:
                    parts = opt.split(':')
                    qvals = [parts[0], parts[1], optMap[opt]]
                else:
                    # Global option
                    qvals = ["GLOBAL", opt, optMap[opt]]

                try:
                    self.dbh.execute(qry, qvals)
                except sqlite3.Error as e:
                    raise IOError("SQL error encountered when storing config, aborting") from e

            try:
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when storing config, aborting") from e

        return True

    def configGet(self) -> dict:
        """Retreive the config from the database

        Returns:
            dict: config

        Raises:
            IOError: database I/O failed
        """

        qry = "SELECT scope, opt, val FROM tbl_config"

        retval = dict()

        with self.dbhLock:
            try:
                self.dbh.execute(qry)
                for [scope, opt, val] in self.dbh.fetchall():
                    if scope == "GLOBAL":
                        retval[opt] = val
                    else:
                        retval[f"{scope}:{opt}"] = val

                return retval
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching configuration") from e

    def configClear(self) -> None:
        """Reset the config to default.

        Clears the config from the database and lets the hard-coded settings in the code take effect.

        Raises:
            IOError: database I/O failed
        """

        qry = "DELETE from tbl_config"
        with self.dbhLock:
            try:
                self.dbh.execute(qry)
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("Unable to clear configuration from the database") from e

    def scanConfigSet(self, scan_id, optMap=dict()) -> None:
        """Store a configuration value for a scan.

        Args:
            scan_id (int): scan instance ID
            optMap (dict): config options

        Raises:
            TypeError: arg type was invalid
            ValueError: arg value was invalid
            IOError: database I/O failed
        """

        if not isinstance(optMap, dict):
            raise TypeError(f"optMap is {type(optMap)}; expected dict()") from None
        if not optMap:
            raise ValueError("optMap is empty") from None

        qry = "REPLACE INTO tbl_scan_config \
                (scan_instance_id, component, opt, val) VALUES (?, ?, ?, ?)"

        with self.dbhLock:
            for opt in list(optMap.keys()):
                # Module option
                if ":" in opt:
                    parts = opt.split(':')
                    qvals = [scan_id, parts[0], parts[1], optMap[opt]]
                else:
                    # Global option
                    qvals = [scan_id, "GLOBAL", opt, optMap[opt]]

                try:
                    self.dbh.execute(qry, qvals)
                except sqlite3.Error as e:
                    raise IOError("SQL error encountered when storing config, aborting") from e

            try:
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when storing config, aborting") from e

    def scanConfigGet(self, instanceId: str) -> dict:
        """Retrieve configuration data for a scan component.

        Args:
            instanceId (str): scan instance ID

        Returns:
            dict: configuration data

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        qry = "SELECT component, opt, val FROM tbl_scan_config \
                WHERE scan_instance_id = ? ORDER BY component, opt"
        qvars = [instanceId]

        retval = dict()

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                for [component, opt, val] in self.dbh.fetchall():
                    if component == "GLOBAL":
                        retval[opt] = val
                    else:
                        retval[f"{component}:{opt}"] = val
                return retval
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching configuration") from e

    def scanEventStore(self, instanceId: str, sfEvent, truncateSize: int = 0) -> None:
        """Store an event in the database.

        Args:
            instanceId (str): scan instance ID
            sfEvent (SpiderFootEvent): event to be stored in the database
            truncateSize (int): truncate size for event data

        Raises:
            TypeError: arg type was invalid
            ValueError: arg value was invalid
            IOError: database I/O failed
        """
        from spiderfoot import SpiderFootEvent

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        if not instanceId:
            raise ValueError("instanceId is empty") from None

        if not isinstance(sfEvent, SpiderFootEvent):
            raise TypeError(f"sfEvent is {type(sfEvent)}; expected SpiderFootEvent()") from None

        if not isinstance(sfEvent.generated, float):
            raise TypeError(f"sfEvent.generated is {type(sfEvent.generated)}; expected float()") from None

        if not sfEvent.generated:
            raise ValueError("sfEvent.generated is empty") from None

        if not isinstance(sfEvent.eventType, str):
            raise TypeError(f"sfEvent.eventType is {type(sfEvent.eventType,)}; expected str()") from None

        if not sfEvent.eventType:
            raise ValueError("sfEvent.eventType is empty") from None

        if not isinstance(sfEvent.data, str):
            raise TypeError(f"sfEvent.data is {type(sfEvent.data)}; expected str()") from None

        if not sfEvent.data:
            raise ValueError("sfEvent.data is empty") from None

        if not isinstance(sfEvent.module, str):
            raise TypeError(f"sfEvent.module is {type(sfEvent.module)}; expected str()") from None

        if not sfEvent.module and sfEvent.eventType != "ROOT":
            raise ValueError("sfEvent.module is empty") from None

        if not isinstance(sfEvent.confidence, int):
            raise TypeError(f"sfEvent.confidence is {type(sfEvent.confidence)}; expected int()") from None

        if not 0 <= sfEvent.confidence <= 100:
            raise ValueError(f"sfEvent.confidence value is {type(sfEvent.confidence)}; expected 0 - 100") from None

        if not isinstance(sfEvent.visibility, int):
            raise TypeError(f"sfEvent.visibility is {type(sfEvent.visibility)}; expected int()") from None

        if not 0 <= sfEvent.visibility <= 100:
            raise ValueError(f"sfEvent.visibility value is {type(sfEvent.visibility)}; expected 0 - 100") from None

        if not isinstance(sfEvent.risk, int):
            raise TypeError(f"sfEvent.risk is {type(sfEvent.risk)}; expected int()") from None

        if not 0 <= sfEvent.risk <= 100:
            raise ValueError(f"sfEvent.risk value is {type(sfEvent.risk)}; expected 0 - 100") from None

        if not isinstance(sfEvent.sourceEvent, SpiderFootEvent) and sfEvent.eventType != "ROOT":
            raise TypeError(f"sfEvent.sourceEvent is {type(sfEvent.sourceEvent)}; expected str()") from None

        if not isinstance(sfEvent.sourceEventHash, str):
            raise TypeError(f"sfEvent.sourceEventHash is {type(sfEvent.sourceEventHash)}; expected str()") from None

        if not sfEvent.sourceEventHash:
            raise ValueError("sfEvent.sourceEventHash is empty") from None

        storeData = sfEvent.data

        # truncate if required
        if isinstance(truncateSize, int) and truncateSize > 0:
            storeData = storeData[0:truncateSize]

        # retrieve scan results
        qry = "INSERT INTO tbl_scan_results \
            (scan_instance_id, hash, type, generated, confidence, \
            visibility, risk, module, data, source_event_hash) \
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"

        qvals = [instanceId, sfEvent.hash, sfEvent.eventType, sfEvent.generated,
                 sfEvent.confidence, sfEvent.visibility, sfEvent.risk,
                 sfEvent.module, storeData, sfEvent.sourceEventHash]

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvals)
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError(f"SQL error encountered when storing event data ({self.dbh})") from e

    def scanInstanceList(self) -> list:
        """List all previously run scans.

        Returns:
            list: previously run scans

        Raises:
            IOError: database I/O failed
        """

        # SQLite doesn't support OUTER JOINs, so we need a work-around that
        # does a UNION of scans with results and scans without results to
        # get a complete listing.
        qry = "SELECT i.guid, i.name, i.seed_target, ROUND(i.created/1000), \
            ROUND(i.started)/1000 as started, ROUND(i.ended)/1000, i.status, COUNT(r.type) \
            FROM tbl_scan_instance i, tbl_scan_results r WHERE i.guid = r.scan_instance_id \
            AND r.type <> 'ROOT' GROUP BY i.guid \
            UNION ALL \
            SELECT i.guid, i.name, i.seed_target, ROUND(i.created/1000), \
            ROUND(i.started)/1000 as started, ROUND(i.ended)/1000, i.status, '0' \
            FROM tbl_scan_instance i  WHERE i.guid NOT IN ( \
            SELECT distinct scan_instance_id FROM tbl_scan_results WHERE type <> 'ROOT') \
            ORDER BY started DESC"

        with self.dbhLock:
            try:
                self.dbh.execute(qry)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching scan list") from e

    def scanResultHistory(self, instanceId: str) -> list:
        """History of data from the scan.

        Args:
            instanceId (str): scan instance ID

        Returns:
            list: scan data history

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        qry = "SELECT STRFTIME('%H:%M %w', generated, 'unixepoch') AS hourmin, \
                type, COUNT(*) FROM tbl_scan_results \
                WHERE scan_instance_id = ? GROUP BY hourmin, type"
        qvars = [instanceId]

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError(f"SQL error encountered when fetching history for scan {instanceId}") from e

    def scanElementSourcesDirect(self, instanceId: str, elementIdList: list) -> list:
        """Get the source IDs, types and data for a set of IDs.

        Args:
            instanceId (str): scan instance ID
            elementIdList (list): TBD

        Returns:
            list: TBD

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        if not isinstance(elementIdList, list):
            raise TypeError(f"elementIdList is {type(elementIdList)}; expected list()") from None

        hashIds = []
        for hashId in elementIdList:
            if not hashId:
                continue
            if not hashId.isalnum():
                continue
            hashIds.append(hashId)

        # the output of this needs to be aligned with scanResultEvent,
        # as other functions call both expecting the same output.
        qry = "SELECT ROUND(c.generated) AS generated, c.data, \
            s.data as 'source_data', \
            c.module, c.type, c.confidence, c.visibility, c.risk, c.hash, \
            c.source_event_hash, t.event_descr, t.event_type, s.scan_instance_id, \
            c.false_positive as 'fp', s.false_positive as 'parent_fp', \
            s.type, s.module, st.event_type as 'source_entity_type' \
            FROM tbl_scan_results c, tbl_scan_results s, tbl_event_types t, \
            tbl_event_types st \
            WHERE c.scan_instance_id = ? AND c.source_event_hash = s.hash AND \
            s.scan_instance_id = c.scan_instance_id AND st.event = s.type AND \
            t.event = c.type AND c.hash in ('%s')" % "','".join(hashIds)
        qvars = [instanceId]

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when getting source element IDs") from e

    def scanElementChildrenDirect(self, instanceId: str, elementIdList: list) -> list:
        """Get the child IDs, types and data for a set of IDs.

        Args:
            instanceId (str): scan instance ID
            elementIdList (list): TBD

        Returns:
            list: TBD

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()")

        if not isinstance(elementIdList, list):
            raise TypeError(f"elementIdList is {type(elementIdList)}; expected list()")

        hashIds = []
        for hashId in elementIdList:
            if not hashId:
                continue
            if not hashId.isalnum():
                continue
            hashIds.append(hashId)

        # the output of this needs to be aligned with scanResultEvent,
        # as other functions call both expecting the same output.
        qry = "SELECT ROUND(c.generated) AS generated, c.data, \
            s.data as 'source_data', \
            c.module, c.type, c.confidence, c.visibility, c.risk, c.hash, \
            c.source_event_hash, t.event_descr, t.event_type, s.scan_instance_id, \
            c.false_positive as 'fp', s.false_positive as 'parent_fp' \
            FROM tbl_scan_results c, tbl_scan_results s, tbl_event_types t \
            WHERE c.scan_instance_id = ? AND c.source_event_hash = s.hash AND \
            s.scan_instance_id = c.scan_instance_id AND \
            t.event = c.type AND s.hash in ('%s')" % "','".join(hashIds)
        qvars = [instanceId]

        with self.dbhLock:
            try:
                self.dbh.execute(qry, qvars)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when getting child element IDs") from e

    def scanElementSourcesAll(self, instanceId: str, childData: list) -> list:
        """Get the full set of upstream IDs which are parents to the supplied set of IDs.

        Args:
            instanceId (str): scan instance ID
            childData (list): TBD

        Returns:
            list: TBD

        Raises:
            TypeError: arg type was invalid
            ValueError: arg value was invalid
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()")

        if not isinstance(childData, list):
            raise TypeError(f"childData is {type(childData)}; expected list()")

        if not childData:
            raise ValueError("childData is empty")

        # Get the first round of source IDs for the leafs
        keepGoing = True
        nextIds = list()
        datamap = dict()
        pc = dict()

        for row in childData:
            # these must be unique values!
            parentId = row[9]
            childId = row[8]
            datamap[childId] = row

            if parentId in pc:
                if childId not in pc[parentId]:
                    pc[parentId].append(childId)
            else:
                pc[parentId] = [childId]

            # parents of the leaf set
            if parentId not in nextIds:
                nextIds.append(parentId)

        while keepGoing:
            parentSet = self.scanElementSourcesDirect(instanceId, nextIds)
            nextIds = list()
            keepGoing = False

            for row in parentSet:
                parentId = row[9]
                childId = row[8]
                datamap[childId] = row

                if parentId in pc:
                    if childId not in pc[parentId]:
                        pc[parentId].append(childId)
                else:
                    pc[parentId] = [childId]
                if parentId not in nextIds:
                    nextIds.append(parentId)

                # Prevent us from looping at root
                if parentId != "ROOT":
                    keepGoing = True

        datamap[parentId] = row
        return [datamap, pc]

    def scanElementChildrenAll(self, instanceId: str, parentIds: list) -> list:
        """Get the full set of downstream IDs which are children of the supplied set of IDs.

        Args:
            instanceId (str): scan instance ID
            parentIds (list): TBD

        Returns:
            list: TBD

        Raises:
            TypeError: arg type was invalid

        Note: This function is not the same as the scanElementParent* functions.
              This function returns only ids.
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()")

        if not isinstance(parentIds, list):
            raise TypeError(f"parentIds is {type(parentIds)}; expected list()")

        datamap = list()
        keepGoing = True
        nextIds = list()

        nextSet = self.scanElementChildrenDirect(instanceId, parentIds)
        for row in nextSet:
            datamap.append(row[8])

        for row in nextSet:
            if row[8] not in nextIds:
                nextIds.append(row[8])

        while keepGoing:
            nextSet = self.scanElementChildrenDirect(instanceId, nextIds)
            if nextSet is None or len(nextSet) == 0:
                keepGoing = False
                break

            for row in nextSet:
                datamap.append(row[8])
                nextIds = list()
                nextIds.append(row[8])

        return datamap

    def correlationResultCreate(
        self,
        instanceId: str,
        ruleId: str,
        ruleName: str,
        ruleDescr: str,
        ruleRisk: str,
        ruleYaml: str,
        correlationTitle: str,
        eventHashes: list
    ) -> str:
        """Create a correlation result in the database.

        Args:
            instanceId (str): scan instance ID
            ruleId(str): correlation rule ID
            ruleName(str): correlation rule name
            ruleDescr(str): correlation rule description
            ruleRisk(str): correlation rule risk level
            ruleYaml(str): correlation rule raw YAML
            correlationTitle(str): correlation title
            eventHashes(list): events mapped to the correlation result

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed

        Returns:
            str: Correlation ID created
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()")

        if not isinstance(ruleId, str):
            raise TypeError(f"ruleId is {type(ruleId)}; expected str()")

        if not isinstance(ruleName, str):
            raise TypeError(f"ruleName is {type(ruleName)}; expected str()")

        if not isinstance(ruleDescr, str):
            raise TypeError(f"ruleDescr is {type(ruleDescr)}; expected str()")

        if not isinstance(ruleRisk, str):
            raise TypeError(f"ruleRisk is {type(ruleRisk)}; expected str()")

        if not isinstance(ruleYaml, str):
            raise TypeError(f"ruleYaml is {type(ruleYaml)}; expected str()")

        if not isinstance(correlationTitle, str):
            raise TypeError(f"correlationTitle is {type(correlationTitle)}; expected str()")

        if not isinstance(eventHashes, list):
            raise TypeError(f"eventHashes is {type(eventHashes)}; expected list()")

        uniqueId = str(hashlib.md5(str(time.time() + random.SystemRandom().randint(0, 99999999)).encode('utf-8')).hexdigest())  # noqa: DUO130

        qry = "INSERT INTO tbl_scan_correlation_results \
            (id, scan_instance_id, title, rule_name, rule_descr, rule_risk, rule_id, rule_logic) \
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, (
                    uniqueId, instanceId, correlationTitle, ruleName, ruleDescr, ruleRisk, ruleId, ruleYaml
                ))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("Unable to create correlation result in database") from e

        # Map events to the correlation result
        qry = "INSERT INTO tbl_scan_correlation_results_events \
            (correlation_id, event_hash) \
            VALUES (?, ?)"

        with self.dbhLock:
            for eventHash in eventHashes:
                try:
                    self.dbh.execute(qry, (
                        uniqueId, eventHash
                    ))
                    self.conn.commit()
                except sqlite3.Error as e:
                    raise IOError("Unable to create correlation result in database") from e

        return uniqueId

    # ------------------------------------------------------------------
    # AI Analysis Methods
    # ------------------------------------------------------------------

    def aiAnalysisCreate(self, instanceId: str, provider: str, model: str, mode: str) -> str:
        """Create an AI analysis record.

        Args:
            instanceId (str): scan instance ID
            provider (str): AI provider ('openai' or 'anthropic')
            model (str): model name used
            mode (str): analysis mode ('quick' or 'deep')

        Returns:
            str: analysis ID

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        if not isinstance(provider, str):
            raise TypeError(f"provider is {type(provider)}; expected str()") from None

        uniqueId = str(hashlib.md5(
            str(time.time() + random.SystemRandom().randint(0, 99999999)).encode('utf-8')
        ).hexdigest())  # noqa: DUO130

        qry = "INSERT INTO tbl_scan_ai_analysis \
            (id, scan_instance_id, provider, model, mode, created, status) \
            VALUES (?, ?, ?, ?, ?, ?, ?)"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, (
                    uniqueId, instanceId, provider, model, mode,
                    int(time.time() * 1000), 'running'
                ))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("Unable to create AI analysis record in database") from e

        return uniqueId

    def aiAnalysisUpdate(self, analysisId: str, status: str,
                         resultJson: str = None, tokenUsage: int = None,
                         error: str = None) -> None:
        """Update an AI analysis record.

        Args:
            analysisId (str): analysis ID
            status (str): new status ('running', 'completed', 'failed')
            resultJson (str): JSON result string (optional)
            tokenUsage (int): tokens consumed (optional)
            error (str): error message (optional)

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(analysisId, str):
            raise TypeError(f"analysisId is {type(analysisId)}; expected str()") from None

        sets = ["status = ?"]
        vals = [status]

        if resultJson is not None:
            sets.append("result_json = ?")
            vals.append(resultJson)
        if tokenUsage is not None:
            sets.append("token_usage = ?")
            vals.append(tokenUsage)
        if error is not None:
            sets.append("error = ?")
            vals.append(error)

        vals.append(analysisId)
        qry = f"UPDATE tbl_scan_ai_analysis SET {', '.join(sets)} WHERE id = ?"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, vals)
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("Unable to update AI analysis record in database") from e

    def aiAnalysisGet(self, instanceId: str) -> list:
        """Get all AI analyses for a scan, ordered by most recent first.

        Args:
            instanceId (str): scan instance ID

        Returns:
            list: list of analysis rows

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        qry = "SELECT id, scan_instance_id, provider, model, mode, created, \
            status, result_json, token_usage, error \
            FROM tbl_scan_ai_analysis WHERE scan_instance_id = ? \
            ORDER BY created DESC"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, [instanceId])
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching AI analyses") from e

    def aiAnalysisGetById(self, analysisId: str) -> list:
        """Get a single AI analysis by ID.

        Args:
            analysisId (str): analysis ID

        Returns:
            list: analysis row or None

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(analysisId, str):
            raise TypeError(f"analysisId is {type(analysisId)}; expected str()") from None

        qry = "SELECT id, scan_instance_id, provider, model, mode, created, \
            status, result_json, token_usage, error \
            FROM tbl_scan_ai_analysis WHERE id = ?"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, [analysisId])
                return self.dbh.fetchone()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching AI analysis") from e

    def aiAnalysisDelete(self, analysisId: str) -> bool:
        """Delete an AI analysis record.

        Args:
            analysisId (str): analysis ID

        Returns:
            bool: success

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(analysisId, str):
            raise TypeError(f"analysisId is {type(analysisId)}; expected str()") from None

        qry = "DELETE FROM tbl_scan_ai_analysis WHERE id = ?"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, [analysisId])
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when deleting AI analysis") from e

        return True

    # ── AI Chat (Natural Language Query) ──────────────────────────────────

    def aiChatCreate(self, instanceId: str, role: str, content: str,
                     tokenUsage: int = 0) -> str:
        """Insert a chat message for a scan.

        Args:
            instanceId (str): scan instance ID
            role (str): 'user', 'assistant', 'tool_call', or 'tool_result'
            content (str): message text or JSON string
            tokenUsage (int): tokens consumed (assistant turns)

        Returns:
            str: message ID

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None
        if not isinstance(role, str):
            raise TypeError(f"role is {type(role)}; expected str()") from None
        if not isinstance(content, str):
            raise TypeError(f"content is {type(content)}; expected str()") from None

        uniqueId = hashlib.md5(
            str(time.time() + random.SystemRandom().randint(0, 99999999)).encode('utf-8')
        ).hexdigest()

        qry = "INSERT INTO tbl_scan_ai_chat \
            (id, scan_instance_id, role, content, token_usage, created) \
            VALUES (?, ?, ?, ?, ?, ?)"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, (
                    uniqueId, instanceId, role, content,
                    tokenUsage, int(time.time() * 1000)
                ))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when creating AI chat message") from e

        return uniqueId

    def aiChatGet(self, instanceId: str) -> list:
        """Get all chat messages for a scan, ordered chronologically.

        Args:
            instanceId (str): scan instance ID

        Returns:
            list: rows of [id, scan_instance_id, role, content, token_usage, created]

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        qry = "SELECT id, scan_instance_id, role, content, token_usage, created \
            FROM tbl_scan_ai_chat WHERE scan_instance_id = ? \
            ORDER BY created ASC"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, [instanceId])
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching AI chat messages") from e

    def aiChatDeleteAll(self, instanceId: str) -> bool:
        """Delete all chat messages for a scan.

        Args:
            instanceId (str): scan instance ID

        Returns:
            bool: success

        Raises:
            TypeError: arg type was invalid
            IOError: database I/O failed
        """

        if not isinstance(instanceId, str):
            raise TypeError(f"instanceId is {type(instanceId)}; expected str()") from None

        qry = "DELETE FROM tbl_scan_ai_chat WHERE scan_instance_id = ?"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, [instanceId])
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when deleting AI chat messages") from e

        return True

    # ── Correlation Rules CRUD ─────────────────────────────────────────────

    def correlationRuleCreate(self, ruleId: str, yamlContent: str) -> str:
        """Create a user-defined correlation rule.

        Args:
            ruleId (str): unique rule identifier (must match YAML id field)
            yamlContent (str): full YAML content of the rule

        Returns:
            str: primary key ID

        Raises:
            TypeError: argument type was invalid
            IOError: database I/O failed
        """
        if not isinstance(ruleId, str):
            raise TypeError(f"ruleId is {type(ruleId)}; expected str()") from None
        if not isinstance(yamlContent, str):
            raise TypeError(f"yamlContent is {type(yamlContent)}; expected str()") from None

        now = int(time.time() * 1000)
        id_str = hashlib.md5(f"{ruleId}{now}".encode('utf-8', errors='replace')).hexdigest()

        qry = "INSERT INTO tbl_correlation_rules \
            (id, rule_id, yaml_content, enabled, created, updated) \
            VALUES (?, ?, ?, 1, ?, ?)"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, (id_str, ruleId, yamlContent, now, now))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when creating correlation rule") from e

        return id_str

    def correlationRuleUpdate(self, ruleId: str, yamlContent: str) -> None:
        """Update a user-defined correlation rule.

        Args:
            ruleId (str): rule identifier
            yamlContent (str): updated YAML content

        Raises:
            TypeError: argument type was invalid
            IOError: database I/O failed
        """
        if not isinstance(ruleId, str):
            raise TypeError(f"ruleId is {type(ruleId)}; expected str()") from None
        if not isinstance(yamlContent, str):
            raise TypeError(f"yamlContent is {type(yamlContent)}; expected str()") from None

        now = int(time.time() * 1000)
        qry = "UPDATE tbl_correlation_rules SET yaml_content = ?, updated = ? WHERE rule_id = ?"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, (yamlContent, now, ruleId))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when updating correlation rule") from e

    def correlationRuleDelete(self, ruleId: str) -> None:
        """Delete a user-defined correlation rule.

        Args:
            ruleId (str): rule identifier

        Raises:
            TypeError: argument type was invalid
            IOError: database I/O failed
        """
        if not isinstance(ruleId, str):
            raise TypeError(f"ruleId is {type(ruleId)}; expected str()") from None

        qry = "DELETE FROM tbl_correlation_rules WHERE rule_id = ?"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, [ruleId])
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when deleting correlation rule") from e

    def correlationRuleGet(self, ruleId: str) -> list:
        """Get a user-defined correlation rule.

        Args:
            ruleId (str): rule identifier

        Returns:
            list: [id, rule_id, yaml_content, enabled, created, updated] or empty list

        Raises:
            TypeError: argument type was invalid
            IOError: database I/O failed
        """
        if not isinstance(ruleId, str):
            raise TypeError(f"ruleId is {type(ruleId)}; expected str()") from None

        qry = "SELECT id, rule_id, yaml_content, enabled, created, updated \
            FROM tbl_correlation_rules WHERE rule_id = ?"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, [ruleId])
                return self.dbh.fetchone() or []
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching correlation rule") from e

    def correlationRuleGetAll(self) -> list:
        """Get all user-defined correlation rules.

        Returns:
            list: list of [id, rule_id, yaml_content, enabled, created, updated]

        Raises:
            IOError: database I/O failed
        """

        qry = "SELECT id, rule_id, yaml_content, enabled, created, updated \
            FROM tbl_correlation_rules ORDER BY created DESC"

        with self.dbhLock:
            try:
                self.dbh.execute(qry)
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when fetching correlation rules") from e

    def correlationRuleToggle(self, ruleId: str, enabled: bool) -> None:
        """Enable or disable a user-defined correlation rule.

        Args:
            ruleId (str): rule identifier
            enabled (bool): whether the rule should be enabled

        Raises:
            TypeError: argument type was invalid
            IOError: database I/O failed
        """
        if not isinstance(ruleId, str):
            raise TypeError(f"ruleId is {type(ruleId)}; expected str()") from None

        now = int(time.time() * 1000)
        qry = "UPDATE tbl_correlation_rules SET enabled = ?, updated = ? WHERE rule_id = ?"

        with self.dbhLock:
            try:
                self.dbh.execute(qry, (1 if enabled else 0, now, ruleId))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError("SQL error encountered when toggling correlation rule") from e

    # ──────────────────────────────────────────────────────────────────────
    #  RBAC: seed data, users, roles, permissions, audit log
    # ──────────────────────────────────────────────────────────────────────

    # Role / permission definitions used for seeding
    _RBAC_ROLES = [
        ("administrator", "Administrator", "Full access to all features"),
        ("analyst", "Analyst", "Can run scans, view results, manage rules and AI features"),
        ("viewer", "Viewer", "Read-only access to scans and results"),
    ]

    _RBAC_PERMISSIONS = [
        ("scans", "read"),
        ("scans", "create"),
        ("scans", "update"),
        ("scans", "delete"),
        ("results", "read"),
        ("settings", "read"),
        ("settings", "update"),
        ("modules", "read"),
        ("correlation_rules", "read"),
        ("correlation_rules", "create"),
        ("correlation_rules", "update"),
        ("correlation_rules", "delete"),
        ("ai_features", "read"),
        ("ai_features", "create"),
        ("users", "read"),
        ("users", "create"),
        ("users", "update"),
        ("users", "delete"),
    ]

    _ROLE_PERMISSIONS = {
        "administrator": [
            "scans:read", "scans:create", "scans:update", "scans:delete",
            "results:read", "settings:read", "settings:update", "modules:read",
            "correlation_rules:read", "correlation_rules:create",
            "correlation_rules:update", "correlation_rules:delete",
            "ai_features:read", "ai_features:create",
            "users:read", "users:create", "users:update", "users:delete",
        ],
        "analyst": [
            "scans:read", "scans:create", "scans:update", "scans:delete",
            "results:read", "settings:read", "modules:read",
            "correlation_rules:read", "correlation_rules:create",
            "correlation_rules:update", "correlation_rules:delete",
            "ai_features:read", "ai_features:create",
        ],
        "viewer": [
            "scans:read", "results:read", "modules:read",
            "correlation_rules:read", "ai_features:read",
        ],
    }

    def _seed_rbac_data(self) -> None:
        """Seed roles, permissions, and role-permission mappings.

        Uses INSERT OR IGNORE so it's safe to call on every startup.
        """
        with self.dbhLock:
            try:
                # Seed roles
                for role_name, display, desc in self._RBAC_ROLES:
                    role_id = hashlib.md5(role_name.encode('utf-8', errors='replace')).hexdigest()
                    self.dbh.execute(
                        "INSERT OR IGNORE INTO tbl_roles (id, name, description) VALUES (?, ?, ?)",
                        (role_id, role_name, desc)
                    )

                # Seed permissions
                perm_id_map = {}
                for resource, action in self._RBAC_PERMISSIONS:
                    perm_key = f"{resource}:{action}"
                    perm_id = hashlib.md5(perm_key.encode('utf-8', errors='replace')).hexdigest()
                    perm_id_map[perm_key] = perm_id
                    self.dbh.execute(
                        "INSERT OR IGNORE INTO tbl_permissions (id, resource, action) VALUES (?, ?, ?)",
                        (perm_id, resource, action)
                    )

                # Seed role-permission mappings
                for role_name, perms in self._ROLE_PERMISSIONS.items():
                    role_id = hashlib.md5(role_name.encode('utf-8', errors='replace')).hexdigest()
                    for perm_key in perms:
                        perm_id = perm_id_map.get(perm_key)
                        if perm_id:
                            self.dbh.execute(
                                "INSERT OR IGNORE INTO tbl_role_permissions (role_id, permission_id) VALUES (?, ?)",
                                (role_id, perm_id)
                            )

                self.conn.commit()
            except sqlite3.Error as e:
                log.error(f"Failed to seed RBAC data: {e}")

    # ── User CRUD ────────────────────────────────────────────────────────

    def userCreate(self, username: str, password_hash: str,
                   display_name: str = "", email: str = "") -> str:
        """Create a new user.

        Args:
            username: unique username
            password_hash: bcrypt-hashed password
            display_name: optional display name
            email: optional email

        Returns:
            str: the new user ID

        Raises:
            IOError: database I/O failed
        """
        user_id = hashlib.md5(f"{username}{time.time()}{random.SystemRandom().randint(0, 99999999)}".encode(
            'utf-8', errors='replace')).hexdigest()
        now = int(time.time() * 1000)

        with self.dbhLock:
            try:
                self.dbh.execute(
                    "INSERT INTO tbl_users (id, username, password, display_name, email, is_active, created, updated) "
                    "VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
                    (user_id, username, password_hash, display_name, email, now, now)
                )
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError(f"SQL error creating user: {e}") from e
        return user_id

    def userGet(self, user_id: str):
        """Get a user by ID.

        Returns:
            tuple: (id, username, password, display_name, email, is_active, created, updated) or None
        """
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "SELECT id, username, password, display_name, email, is_active, created, updated "
                    "FROM tbl_users WHERE id = ?", [user_id])
                return self.dbh.fetchone()
            except sqlite3.Error as e:
                raise IOError(f"SQL error fetching user: {e}") from e

    def userGetByUsername(self, username: str):
        """Get a user by username.

        Returns:
            tuple: (id, username, password, display_name, email, is_active, created, updated) or None
        """
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "SELECT id, username, password, display_name, email, is_active, created, updated "
                    "FROM tbl_users WHERE username = ?", [username])
                return self.dbh.fetchone()
            except sqlite3.Error as e:
                raise IOError(f"SQL error fetching user by username: {e}") from e

    def userList(self) -> list:
        """Get all users.

        Returns:
            list: list of (id, username, password, display_name, email, is_active, created, updated)
        """
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "SELECT id, username, password, display_name, email, is_active, created, updated "
                    "FROM tbl_users ORDER BY created")
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError(f"SQL error listing users: {e}") from e

    def userUpdate(self, user_id: str, **fields) -> None:
        """Update user fields.

        Supported fields: display_name, email, is_active
        """
        allowed = {"display_name", "email", "is_active"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return

        updates["updated"] = int(time.time() * 1000)
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [user_id]

        with self.dbhLock:
            try:
                self.dbh.execute(f"UPDATE tbl_users SET {set_clause} WHERE id = ?", values)
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError(f"SQL error updating user: {e}") from e

    def userSetPassword(self, user_id: str, password_hash: str) -> None:
        """Update a user's password."""
        now = int(time.time() * 1000)
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "UPDATE tbl_users SET password = ?, updated = ? WHERE id = ?",
                    (password_hash, now, user_id))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError(f"SQL error updating password: {e}") from e

    def userSetActive(self, user_id: str, is_active: bool) -> None:
        """Enable or disable a user."""
        now = int(time.time() * 1000)
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "UPDATE tbl_users SET is_active = ?, updated = ? WHERE id = ?",
                    (1 if is_active else 0, now, user_id))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError(f"SQL error setting user active state: {e}") from e

    # ── Role methods ─────────────────────────────────────────────────────

    def userRolesGet(self, user_id: str) -> list:
        """Get role names for a user.

        Returns:
            list: role name strings, e.g. ['administrator']
        """
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "SELECT r.name FROM tbl_roles r "
                    "JOIN tbl_user_roles ur ON ur.role_id = r.id "
                    "WHERE ur.user_id = ?", [user_id])
                return [row[0] for row in self.dbh.fetchall()]
            except sqlite3.Error as e:
                raise IOError(f"SQL error fetching user roles: {e}") from e

    def userRolesSet(self, user_id: str, role_ids: list) -> None:
        """Replace all roles for a user.

        Args:
            user_id: user identifier
            role_ids: list of role IDs to assign
        """
        with self.dbhLock:
            try:
                self.dbh.execute("DELETE FROM tbl_user_roles WHERE user_id = ?", [user_id])
                for role_id in role_ids:
                    self.dbh.execute(
                        "INSERT INTO tbl_user_roles (user_id, role_id) VALUES (?, ?)",
                        (user_id, role_id))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError(f"SQL error setting user roles: {e}") from e

    def userPermissionsGet(self, user_id: str) -> list:
        """Get all permissions for a user (resolved through roles).

        Returns:
            list: list of (resource, action) tuples
        """
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "SELECT DISTINCT p.resource, p.action FROM tbl_permissions p "
                    "JOIN tbl_role_permissions rp ON rp.permission_id = p.id "
                    "JOIN tbl_user_roles ur ON ur.role_id = rp.role_id "
                    "WHERE ur.user_id = ?", [user_id])
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError(f"SQL error fetching user permissions: {e}") from e

    def roleGetByName(self, name: str):
        """Get a role ID by name.

        Returns:
            str: role ID, or None if not found
        """
        with self.dbhLock:
            try:
                self.dbh.execute("SELECT id FROM tbl_roles WHERE name = ?", [name])
                row = self.dbh.fetchone()
                return row[0] if row else None
            except sqlite3.Error as e:
                raise IOError(f"SQL error fetching role: {e}") from e

    def roleList(self) -> list:
        """Get all roles.

        Returns:
            list: list of (id, name, description)
        """
        with self.dbhLock:
            try:
                self.dbh.execute("SELECT id, name, description FROM tbl_roles ORDER BY name")
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError(f"SQL error listing roles: {e}") from e

    # ── Audit log ────────────────────────────────────────────────────────

    def auditLogCreate(self, user_id: str, username: str, action: str,
                       resource: str, resource_id: str = "",
                       details: str = "", ip_address: str = "") -> None:
        """Create an audit log entry."""
        log_id = hashlib.md5(f"{user_id}{action}{time.time()}{random.SystemRandom().randint(0, 99999999)}".encode(
            'utf-8', errors='replace')).hexdigest()
        now = int(time.time() * 1000)

        with self.dbhLock:
            try:
                self.dbh.execute(
                    "INSERT INTO tbl_audit_log (id, user_id, username, action, resource, resource_id, details, ip_address, created) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (log_id, user_id, username, action, resource, resource_id, details, ip_address, now))
                self.conn.commit()
            except sqlite3.Error as e:
                log.error(f"Failed to create audit log entry: {e}")

    def auditLogList(self, limit: int = 100, offset: int = 0) -> list:
        """Get audit log entries (newest first).

        Returns:
            list: list of (id, user_id, username, action, resource, resource_id, details, ip_address, created)
        """
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "SELECT id, user_id, username, action, resource, resource_id, details, ip_address, created "
                    "FROM tbl_audit_log ORDER BY created DESC LIMIT ? OFFSET ?",
                    (limit, offset))
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError(f"SQL error listing audit log: {e}") from e

    # ──────────────────────────────────────────────────────────────────────
    # Worker registry methods (Phase 11)
    # ──────────────────────────────────────────────────────────────────────

    def workerRegister(self, worker_id: str, name: str, host: str, queue_type: str = 'fast') -> None:
        """Register or update a distributed scan worker.

        Args:
            worker_id: Unique worker identifier (UUID)
            name: Human-readable worker name
            host: Hostname/IP of the worker
            queue_type: 'fast' or 'slow'
        """
        now = int(time.time())
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "INSERT INTO tbl_workers (id, name, host, queue_type, status, current_scan, last_seen, registered) "
                    "VALUES (?, ?, ?, ?, 'idle', '', ?, ?) "
                    "ON CONFLICT(id) DO UPDATE SET name=excluded.name, host=excluded.host, "
                    "queue_type=excluded.queue_type, status='idle', last_seen=excluded.last_seen",
                    (worker_id, name, host, queue_type, now, now))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError(f"SQL error registering worker: {e}") from e

    def workerHeartbeat(self, worker_id: str, status: str, current_scan: str = '') -> None:
        """Update worker heartbeat, status, and current scan.

        Args:
            worker_id: Unique worker identifier
            status: 'idle', 'busy', or 'offline'
            current_scan: scan_id currently being processed (empty if idle)
        """
        now = int(time.time())
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "UPDATE tbl_workers SET status=?, current_scan=?, last_seen=? WHERE id=?",
                    (status, current_scan, now, worker_id))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError(f"SQL error updating worker heartbeat: {e}") from e

    def workerList(self) -> list:
        """Return all registered workers.

        Returns:
            list: list of (id, name, host, queue_type, status, current_scan, last_seen, registered)
        """
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "SELECT id, name, host, queue_type, status, current_scan, last_seen, registered "
                    "FROM tbl_workers ORDER BY registered DESC")
                return self.dbh.fetchall()
            except sqlite3.Error as e:
                raise IOError(f"SQL error listing workers: {e}") from e

    def workerGet(self, worker_id: str):
        """Get a single worker by ID.

        Returns:
            tuple | None: (id, name, host, queue_type, status, current_scan, last_seen, registered) or None
        """
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "SELECT id, name, host, queue_type, status, current_scan, last_seen, registered "
                    "FROM tbl_workers WHERE id=?",
                    (worker_id,))
                return self.dbh.fetchone()
            except sqlite3.Error as e:
                raise IOError(f"SQL error getting worker: {e}") from e

    def workerOfflineStale(self, max_age_seconds: int = 60) -> None:
        """Mark workers as offline if they have not sent a heartbeat recently.

        Args:
            max_age_seconds: Workers with last_seen older than this are marked offline
        """
        cutoff = int(time.time()) - max_age_seconds
        with self.dbhLock:
            try:
                self.dbh.execute(
                    "UPDATE tbl_workers SET status='offline' "
                    "WHERE status != 'offline' AND last_seen < ?",
                    (cutoff,))
                self.conn.commit()
            except sqlite3.Error as e:
                raise IOError(f"SQL error marking stale workers offline: {e}") from e
