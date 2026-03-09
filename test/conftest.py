import os

import pytest
from testcontainers.postgres import PostgresContainer

from spiderfoot import SpiderFootHelpers


@pytest.fixture(scope="session")
def pg_container():
    """Spin up an ephemeral PostgreSQL 16 container for the test session."""
    with PostgresContainer("postgres:16-alpine") as pg:
        yield pg


@pytest.fixture(autouse=True)
def default_options(request, pg_container):
    db_url = pg_container.get_connection_url()
    # testcontainers returns 'postgresql+psycopg2://...'; strip the dialect suffix
    db_url = db_url.replace("postgresql+psycopg2://", "postgresql://")

    request.cls.default_options = {
        '_debug': False,
        '__logging': True,
        '__outputfilter': None,
        '_useragent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:62.0) Gecko/20100101 Firefox/62.0',
        '_dnsserver': '',
        '_fetchtimeout': 5,
        '_internettlds': 'https://publicsuffix.org/list/effective_tld_names.dat',
        '_internettlds_cache': 72,
        '_genericusers': ",".join(SpiderFootHelpers.usernamesFromWordlists(['generic-usernames'])),
        '__database_url': db_url,
        '__modules__': None,
        '__correlationrules__': None,
        '_socks1type': '',
        '_socks2addr': '',
        '_socks3port': '',
        '_socks4user': '',
        '_socks5pwd': '',
        '__logstdout': False,
    }

    request.cls.web_default_options = {
        'root': '/'
    }

    request.cls.cli_default_options = {
        "cli.debug": False,
        "cli.silent": False,
        "cli.color": True,
        "cli.output": "pretty",
        "cli.history": True,
        "cli.history_file": "",
        "cli.spool": False,
        "cli.spool_file": "",
        "cli.ssl_verify": True,
        "cli.username": "",
        "cli.password": "",
        "cli.server_baseurl": "http://127.0.0.1:5001"
    }


@pytest.fixture
def fastapi_test_config(pg_container):
    """Configuration for FastAPI test client."""
    db_url = pg_container.get_connection_url()
    db_url = db_url.replace("postgresql+psycopg2://", "postgresql://")
    return {
        '_debug': False,
        '__logging': False,
        '__outputfilter': None,
        '_useragent': 'SpiderFoot-Test/1.0',
        '_dnsserver': '',
        '_fetchtimeout': 5,
        '_internettlds': 'https://publicsuffix.org/list/effective_tld_names.dat',
        '_internettlds_cache': 72,
        '_genericusers': '',
        '__database_url': db_url,
        '__modules__': None,
        '__correlationrules__': None,
        '_socks1type': '',
        '_socks2addr': '',
        '_socks3port': '',
        '_socks4user': '',
        '_socks5pwd': '',
        '__logstdout': False,
    }


@pytest.fixture
def fastapi_client(fastapi_test_config, pg_container):
    """Create a FastAPI test client."""
    from fastapi.testclient import TestClient

    from api.app import create_app

    db_url = pg_container.get_connection_url()
    db_url = db_url.replace("postgresql+psycopg2://", "postgresql://")
    os.environ['DATABASE_URL'] = db_url

    app = create_app(config=fastapi_test_config)
    with TestClient(app) as client:
        yield client
