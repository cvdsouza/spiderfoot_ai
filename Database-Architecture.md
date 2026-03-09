# SpiderFoot AI — Database Architecture

## Overview

SpiderFoot AI uses **PostgreSQL 16** as its primary database. The database stores all scan data, OSINT results, correlation findings, AI analysis, user accounts, and distributed worker state. PostgreSQL replaced an earlier SQLite implementation to support higher write concurrency, multiple simultaneous workers, and the planned monitoring feature (continuous per-target writes).

---

## Technology Stack

| Component | Technology | Purpose |
|---|---|---|
| Database engine | PostgreSQL 16 (Alpine) | Primary persistent store |
| Python driver | psycopg2-binary ≥ 2.9 | Synchronous connection driver |
| Connection pool | `psycopg2.pool.ThreadedConnectionPool` | Per-request connection from shared pool (min 5, max 20) |
| Schema management | Inline `create()` in `SpiderFootDb` | Schema created on first start; Alembic planned for future versioning |

---

## Schema

### 19 Tables

#### Scan Data

| Table | Purpose | Key Columns |
|---|---|---|
| `tbl_scan_instance` | Scan metadata | `guid` (PK), `name`, `seed_target`, `created`, `started`, `ended`, `status` |
| `tbl_scan_results` | OSINT event results | `scan_instance_id` (FK), `hash`, `type` (FK), `module`, `data`, `false_positive`, `source_event_hash` |
| `tbl_scan_log` | Per-scan log messages | `scan_instance_id` (FK), `generated`, `component`, `type`, `message` |
| `tbl_scan_config` | Per-scan module configuration | `scan_instance_id` (FK), `component`, `opt`, `val`; UNIQUE(scan_instance_id, component, opt) |
| `tbl_event_types` | 174 event type definitions | `event` (PK), `event_descr`, `event_raw`, `event_type` |

#### Correlation & AI

| Table | Purpose |
|---|---|
| `tbl_scan_correlation_results` | Correlation rule matches per scan |
| `tbl_scan_correlation_results_events` | M:N link between correlations and events |
| `tbl_scan_ai_analysis` | AI analysis results (OpenAI/Anthropic) |
| `tbl_scan_ai_chat` | Per-scan AI conversation history |
| `tbl_correlation_rules` | User-defined YAML correlation rules |

#### Platform Config

| Table | Purpose |
|---|---|
| `tbl_config` | Global platform configuration; UNIQUE(scope, opt) |

#### RBAC

| Table | Purpose |
|---|---|
| `tbl_users` | User accounts; UNIQUE(username) |
| `tbl_roles` | Role definitions (administrator, analyst, viewer) |
| `tbl_permissions` | Resource/action permission definitions |
| `tbl_user_roles` | User ↔ role assignments |
| `tbl_role_permissions` | Role ↔ permission assignments |
| `tbl_audit_log` | User action audit trail |

#### Worker Registry

| Table | Purpose |
|---|---|
| `tbl_workers` | Distributed worker registration and heartbeat state |

---

## Indices

```sql
-- Hot-path indices on scan results (most queried table)
idx_scan_results_id       ON tbl_scan_results (scan_instance_id)
idx_scan_results_type     ON tbl_scan_results (scan_instance_id, type)
idx_scan_results_hash     ON tbl_scan_results (scan_instance_id, hash)
idx_scan_results_module   ON tbl_scan_results (scan_instance_id, module)
idx_scan_results_srchash  ON tbl_scan_results (scan_instance_id, source_event_hash)

-- Scan logs
idx_scan_logs             ON tbl_scan_log (scan_instance_id)

-- Correlation
idx_scan_correlation      ON tbl_scan_correlation_results (scan_instance_id, id)
idx_scan_correlation_events ON tbl_scan_correlation_results_events (correlation_id)

-- AI
idx_scan_ai_analysis      ON tbl_scan_ai_analysis (scan_instance_id)
idx_scan_ai_chat          ON tbl_scan_ai_chat (scan_instance_id, created)

-- Audit & workers
idx_audit_log_user        ON tbl_audit_log (user_id)
idx_audit_log_created     ON tbl_audit_log (created)
idx_workers_status        ON tbl_workers (status)
```

---

## Connection Model

### API Server

```
HTTP Request
    │
    ▼
FastAPI dependency: get_db(request)
    │
    ▼
ThreadedConnectionPool.getconn()    ← draws one connection from pool
    │
    ▼
SpiderFootDb(conn=conn)             ← wraps the live psycopg2 connection
    │
    ▼
[handler executes queries]
    │
    ▼
conn.commit() / conn.rollback()
    │
    ▼
ThreadedConnectionPool.putconn()    ← returns connection to pool
```

Pool configuration:
- `minconn = 5` — connections held open at startup
- `maxconn = 20` — hard limit; requests block if pool is exhausted
- Pool lives on `app.state.db_pool`; created during FastAPI lifespan startup, closed on shutdown

### Distributed Workers

Workers connect directly to PostgreSQL using the `DATABASE_URL` environment variable. Each worker holds a single long-lived connection for the duration of its scan, writing results via `SpiderFootDb.scanEventStore()` scoped to `scan_instance_id`. No per-scan intermediate database files are created.

```
Worker process
    │
    ├─ psycopg2.connect(DATABASE_URL)
    ├─ SpiderFootDb(conn=conn)
    ├─ [runs SpiderFootScanner]
    ├─ scanEventStore(scan_id, event)  ← writes directly to PostgreSQL
    └─ RabbitMQ: publish completion signal
```

---

## Data Flow: Scan Execution

```
POST /api/v1/scans
    │
    ▼
scan_runner.py
    ├─ RabbitMQ available?
    │   ├─ YES → publish task to sf.fast / sf.slow queue
    │   └─ NO  → spawn local subprocess
    │
    ▼ (RabbitMQ path)
worker.py consumes task
    │
    ├─ Connect to PostgreSQL directly
    ├─ SpiderFootScanner runs modules
    ├─ Results → SpiderFootDb.scanEventStore() → PostgreSQL
    └─ Publish completion to RabbitMQ
    │
    ▼
result_consumer.py receives completion signal
    │
    └─ Updates scan status in tbl_scan_instance
    └─ Triggers correlation rules (subprocess)
```

---

## Key SQL Patterns

### Upserts (config tables)

PostgreSQL `INSERT ... ON CONFLICT` replaces SQLite's `REPLACE INTO`:

```sql
INSERT INTO tbl_config (scope, opt, val)
VALUES (%s, %s, %s)
ON CONFLICT (scope, opt) DO UPDATE SET val = EXCLUDED.val
```

### Regex search

PostgreSQL's native `~*` (case-insensitive regex) replaces SQLite's custom `REGEXP` function:

```sql
AND (c.data ~* %s OR s.data ~* %s)
```

### Time-series history

PostgreSQL `to_char(to_timestamp(...))` replaces SQLite's `STRFTIME`:

```sql
SELECT to_char(to_timestamp(generated), 'HH24:MI D') AS hourmin,
       type, COUNT(*)
FROM tbl_scan_results
WHERE scan_instance_id = %s
GROUP BY hourmin, type
```

### Worker upsert

```sql
INSERT INTO tbl_workers (id, name, host, queue_type, status, current_scan, last_seen, registered)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  host = EXCLUDED.host,
  status = EXCLUDED.status,
  last_seen = EXCLUDED.last_seen
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://spiderfoot:spiderfoot@postgres:5432/spiderfoot` | Full PostgreSQL connection string |
| `POSTGRES_USER` | `spiderfoot` | PostgreSQL superuser (docker-compose only) |
| `POSTGRES_PASSWORD` | `spiderfoot` | PostgreSQL password (docker-compose only) |
| `POSTGRES_DB` | `spiderfoot` | PostgreSQL database name (docker-compose only) |

Workers and the API server both use `DATABASE_URL` exclusively.

---

## Docker Compose Services

```
┌─────────────────────────────────────────────────────────┐
│ docker-compose.yml                                       │
│                                                         │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────┐ │
│  │  spiderfoot  │    │  rabbitmq    │    │ postgres  │ │
│  │  :5001       │◄──►│  :5671 TLS   │    │  :5432    │ │
│  │              │    │              │    │           │ │
│  └──────┬───────┘    └──────────────┘    └─────┬─────┘ │
│         │                                       │       │
│         └───────────────────────────────────────┘       │
│                   DATABASE_URL                          │
│                                                         │
│  Volumes: spiderfoot-data, rabbitmq-data, postgres-data │
└─────────────────────────────────────────────────────────┘
```

---

## Migration from SQLite

The migration from SQLite to PostgreSQL involved the following systematic changes in `spiderfoot/db.py`:

| SQLite Pattern | PostgreSQL Replacement |
|---|---|
| `import sqlite3` | `import psycopg2` |
| `sqlite3.connect(path)` | `psycopg2.connect(DATABASE_URL)` |
| `?` parameter placeholders | `%s` parameter placeholders |
| `REPLACE INTO` | `INSERT ... ON CONFLICT DO UPDATE` |
| Custom `REGEXP` function | Native `~*` operator |
| `STRFTIME('%H:%M %w', ...)` | `to_char(to_timestamp(...), 'HH24:MI D')` |
| `PRAGMA journal_mode=WAL` | Removed (PostgreSQL handles WAL natively) |
| `threading.RLock()` | Removed (per-request connections from pool) |
| `sqlite3.Error` | `psycopg2.Error` |
| String-interpolated `IN` clauses | Parameterized `%s` arrays |
| Per-scan SQLite temp files | Removed (workers write directly to PostgreSQL) |

---

## Future Improvements

| Item | Description | Priority |
|---|---|---|
| Alembic | Add versioned schema migrations for zero-downtime deploys | High |
| `WITH RECURSIVE` graph traversal | Server-side graph depth limiting for large scan graphs | High |
| Remove `threading.RLock()` | Already removed from per-request model; verify worker path | Medium |
| `asyncpg` | Full async DB layer (larger refactor, unblocks async endpoints) | Low |
| pgbouncer | Connection pooler sidecar for >100 concurrent users | Low |
| Read replicas | Separate read traffic (graph queries, exports) from writes | Low |
