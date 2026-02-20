# SpiderFoot Architecture

## Table of Contents

1. [Overview](#overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Repository Layout](#repository-layout)
4. [API Server](#api-server)
5. [Authentication & RBAC](#authentication--rbac)
6. [Database Layer](#database-layer)
7. [Scan Engine](#scan-engine)
8. [Distributed Worker System](#distributed-worker-system)
9. [AI Features](#ai-features)
10. [Correlation Rules](#correlation-rules)
11. [Frontend (React SPA)](#frontend-react-spa)
12. [Docker & Deployment](#docker--deployment)
13. [Configuration Reference](#configuration-reference)

---

## Overview

SpiderFoot is an open-source OSINT (Open Source Intelligence) automation platform. It orchestrates hundreds of passive reconnaissance modules to collect and correlate intelligence about a target (domain, IP, email, person, etc.).

This repository is a fork of the original SpiderFoot project enhanced with:

- A **FastAPI REST API** replacing the legacy CherryPy web UI
- A **React TypeScript SPA** as the new frontend
- **Role-Based Access Control (RBAC)** with JWT authentication
- **AI-powered analysis** and correlation rule generation (OpenAI / Anthropic)
- **Distributed scan execution** via RabbitMQ workers

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Browser                                                             │
│  React SPA (Vite / TypeScript)                                       │
│  ─ Scans  ─ Results  ─ Rules  ─ Settings  ─ Users  ─ Workers        │
└──────────────────────┬───────────────────────────────────────────────┘
                       │  HTTPS / REST  (port 5001)
┌──────────────────────▼───────────────────────────────────────────────┐
│  API Server  (FastAPI + Uvicorn)                                     │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │  Scans   │  │  Auth /  │  │ Correlation│  │  AI Analysis     │  │
│  │  Results │  │  Users   │  │  Rules     │  │  (OpenAI /       │  │
│  │  Exports │  │  RBAC    │  │            │  │   Anthropic)     │  │
│  └──────────┘  └──────────┘  └────────────┘  └──────────────────┘  │
│                                                                      │
│  Scan Manager ──────► RabbitMQ ──────────────► Workers              │
│       │          (if available)                    │                │
│       │ (fallback)                                 │                │
│       ▼                                            ▼                │
│  Local subprocess                           SpiderFootScanner       │
└───────────────────────────────┬──────────────────────────────────────┘
                                │  SQLite (WAL mode)
┌───────────────────────────────▼──────────────────────────────────────┐
│  spiderfoot.db                                                       │
│  ─ Scan instances & results     ─ Correlation results               │
│  ─ Users, roles, permissions    ─ AI analysis results               │
│  ─ Audit log                    ─ Worker registry                   │
└──────────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

| Principle | How it is applied |
|-----------|-------------------|
| **Graceful degradation** | Workers, RabbitMQ, and AI features are all optional; the system falls back to local execution if any are unavailable |
| **Unmodified scan engine** | Modules and `SpiderFootScanner` are unchanged; distribution is purely at the process boundary |
| **Single database** | All components share one SQLite file via a Docker volume; no separate data stores to synchronise |
| **JWT + RBAC** | Every API endpoint is protected; role checks are enforced in FastAPI dependencies |

---

## Repository Layout

```
spiderfoot_ai/
│
├── sf.py                     # Entry point — initialises DB, loads modules, starts Uvicorn
├── sflib.py                  # SpiderFoot core library (module loading, event types, target handling)
├── sfscan.py                 # SpiderFootScanner — scan orchestrator (unchanged from upstream)
├── sfcli.py                  # Command-line interface (non-server usage)
├── worker.py                 # Standalone distributed worker agent
│
├── api/                      # FastAPI application
│   ├── app.py                # Application factory, lifespan, router registration
│   ├── dependencies.py       # Shared FastAPI dependencies (get_db, etc.)
│   ├── middleware/
│   │   ├── auth.py           # JWT creation, verification, require_permission()
│   │   └── security_headers.py
│   ├── models/               # Pydantic request/response models
│   ├── routers/              # One file per resource group
│   │   ├── auth.py           # /auth/login, /auth/logout, /auth/me, /auth/change-password
│   │   ├── scans.py          # /scans  (CRUD + stop/rerun)
│   │   ├── results.py        # /scans/{id}/results
│   │   ├── exports.py        # /scans/{id}/export (CSV, JSON, GEXF, …)
│   │   ├── settings.py       # /settings  (global config, API keys)
│   │   ├── modules.py        # /modules   (metadata)
│   │   ├── system.py         # /system    (health, version)
│   │   ├── users.py          # /users     (CRUD, role assignment, password reset)
│   │   ├── workers.py        # /workers   (registry, heartbeat)
│   │   ├── ai_analysis.py    # /ai/analyze/{scan_id}
│   │   ├── correlation_rules.py  # /correlation-rules  (CRUD + AI generate)
│   │   └── legacy.py         # Backwards-compatible shims
│   ├── services/
│   │   ├── ai_analysis.py    # OpenAI / Anthropic LLM integration
│   │   ├── ai_rules.py       # AI-assisted rule generation
│   │   ├── ai_query.py       # Chat interface (scan-scoped Q&A)
│   │   ├── encryption.py     # Fernet encryption for stored API keys
│   │   ├── module_categories.py  # fast/slow module classification
│   │   ├── task_publisher.py     # RabbitMQ publisher
│   │   └── scan_runner.py        # In-process scan executor (used by workers)
│   └── utils/
│       └── scan_manager.py   # launch_scan() — publish-or-fork decision
│
├── spiderfoot/               # Core library package
│   ├── db.py                 # SpiderFootDb — all SQLite access
│   ├── plugin.py             # SpiderFootPlugin base class for modules
│   ├── threadpool.py         # SpiderFootThreadPool
│   └── …
│
├── modules/                  # 200+ OSINT modules (sfp_*.py)
├── correlations/             # 41 built-in YAML correlation rules
│
├── frontend/                 # React TypeScript SPA
│   ├── src/
│   │   ├── api/              # Typed API client functions (one file per router)
│   │   ├── components/       # Feature-organised React components
│   │   ├── hooks/            # Custom hooks (usePermission, etc.)
│   │   ├── stores/           # Zustand state (authStore, themeStore)
│   │   └── types/            # Shared TypeScript interfaces
│   └── …
│
├── docker-compose.yml        # Core services: spiderfoot + rabbitmq
├── Dockerfile                # Multi-stage build (Node → Python venv → Alpine)
├── start.sh                  # Convenience wrapper for docker compose up
├── start-worker.sh           # Thin shim → worker/start.sh (backward compat)
├── stop.sh                   # docker compose down
├── .env.example              # All configurable variables with defaults
│
└── worker/                   # Self-contained worker deployment package
    ├── docker-compose.yml    # Worker services (local overlay or remote standalone)
    ├── start.sh              # Worker launcher (auto-detects local vs remote mode)
    └── .env.example          # Remote-worker env template
```

---

## API Server

`api/app.py` creates the FastAPI application using a lifespan context manager that:

1. Opens the database and runs schema migrations
2. Loads all module metadata from `modules/sfp_*.py`
3. Loads built-in correlation rules from `correlations/*.yaml`, merges user rules from the DB
4. Bootstraps the admin user from environment variables (`SPIDERFOOT_ADMIN_USER` / `SPIDERFOOT_ADMIN_PASSWORD`) if no user exists
5. Registers all routers under `/api/v1`
6. Mounts the compiled React SPA at `/` with an `index.html` fallback for client-side routing

**Router summary:**

| Prefix | Router | Purpose |
|--------|--------|---------|
| `/api/v1/auth` | `auth.py` | Login, logout, current user, change password |
| `/api/v1/scans` | `scans.py` | Scan lifecycle management |
| `/api/v1/scans/{id}/results` | `results.py` | Result retrieval and filtering |
| `/api/v1/scans/{id}/export` | `exports.py` | Download results as CSV / JSON / GEXF |
| `/api/v1/settings` | `settings.py` | Read/write global config and module options |
| `/api/v1/modules` | `modules.py` | List modules and their metadata |
| `/api/v1/system` | `system.py` | Version, health, stats |
| `/api/v1/users` | `users.py` | User CRUD, role management, password reset |
| `/api/v1/workers` | `workers.py` | Worker registry and heartbeat endpoint |
| `/api/v1/ai` | `ai_analysis.py` | AI-powered scan analysis and Q&A |
| `/api/v1/correlation-rules` | `correlation_rules.py` | Rule CRUD, enable/disable, AI generation |

---

## Authentication & RBAC

### Authentication

Authentication uses **JWT (HS256)** with a **persistent signing key**.

- On first start, a 256-bit random key is generated and written to `{dataPath}/jwt.key` (chmod 600)
- Subsequent starts load the same key, so tokens survive server restarts
- Token TTL is 24 hours
- Passwords are hashed with bcrypt via passlib (bcrypt pinned to `<4` for passlib compatibility)

**Flow:**

```
POST /api/v1/auth/login  { username, password }
  → bcrypt verify
  → create_access_token(user_id, username)
  → return { access_token, token_type, user: UserInfo }

All subsequent requests:
  Authorization: Bearer <token>
  → get_current_user() validates JWT, loads user+roles+permissions from DB
  → require_permission("resource", "action") checks against user's permission set
```

### Roles and Permissions

Three built-in roles are seeded on first start:

| Role | Description |
|------|-------------|
| `administrator` | Full access; bypasses all permission checks |
| `analyst` | Can run scans, view results, use AI features; cannot manage users or change settings |
| `viewer` | Read-only access to scans and results |

Permissions follow the format `{resource}:{action}`:

| Resource | Actions |
|----------|---------|
| `scans` | `read`, `create`, `update`, `delete` |
| `results` | `read` |
| `settings` | `read`, `update` |
| `modules` | `read` |
| `system` | `read` |
| `users` | `read`, `create`, `update`, `delete` |
| `correlation_rules` | `read`, `create`, `update`, `delete` |
| `ai` | `read`, `create` |

**Permission enforcement** is implemented as a FastAPI dependency factory:

```python
# In any route:
user = Depends(require_permission("scans", "create"))

# In auth.py:
def require_permission(resource: str, action: str):
    def _check(user = Depends(get_current_user)):
        if "administrator" in user["roles"]:
            return user          # admin bypass
        if f"{resource}:{action}" not in user["permissions"]:
            raise HTTPException(403)
        return user
    return _check
```

Every action that modifies state is written to `tbl_audit_log` with the user, IP, timestamp, and affected resource.

---

## Database Layer

**Technology:** SQLite 3 with WAL (Write-Ahead Logging) for concurrent readers.

All access goes through `SpiderFootDb` (`spiderfoot/db.py`), which wraps every query in a `threading.RLock` to prevent concurrent write conflicts from multiple threads within the same process.

### Schema

```
Core scan tables
────────────────────────────────────────────────────────
tbl_event_types         Event type catalogue (180+ types)
tbl_config              Global configuration key-value store
tbl_scan_instance       One row per scan (guid, name, target, status, timestamps)
tbl_scan_log            Per-scan execution log messages
tbl_scan_config         Module configuration captured at scan start
tbl_scan_results        OSINT findings (hash-keyed, linked to source event)

Correlation & AI tables
────────────────────────────────────────────────────────
tbl_scan_correlation_results        Matched correlation rules per scan
tbl_scan_correlation_results_events Event hashes that triggered each correlation
tbl_correlation_rules               User-defined YAML rules (built-ins loaded from disk)
tbl_scan_ai_analysis                AI analysis jobs (status + result JSON)
tbl_scan_ai_chat                    AI Q&A chat history per scan

RBAC tables (Phase 10)
────────────────────────────────────────────────────────
tbl_users               Accounts (username, bcrypt hash, is_active, display_name, email)
tbl_roles               Role definitions (administrator, analyst, viewer)
tbl_permissions         Permission catalogue (resource × action pairs)
tbl_user_roles          Many-to-many: user ↔ role
tbl_role_permissions    Many-to-many: role ↔ permission
tbl_audit_log           Immutable audit trail (user, action, resource, IP, timestamp)

Worker registry (Phase 11)
────────────────────────────────────────────────────────
tbl_workers             Registered worker processes (id, name, host, queue_type,
                        status, current_scan, last_seen, registered)
```

### Migrations

Schema changes are applied automatically on startup using a probe-and-create pattern:

```python
# Example migration block in SpiderFootDb.__init__
try:
    self.dbh.execute("SELECT COUNT(*) FROM tbl_workers")
except sqlite3.Error:
    # Table doesn't exist → create it
    for query in self.createSchemaQueries:
        if "tbl_workers" in query or "idx_workers" in query:
            self.dbh.execute(query)
    self.conn.commit()
```

This approach is idempotent: re-running migrations against an up-to-date database is a no-op.

---

## Scan Engine

### Architecture (Single Machine)

The scan engine is unchanged from upstream SpiderFoot:

```
API Server process
  └── scan_manager.launch_scan()
        └── mp.Process(target=startSpiderFootScanner, ctx="spawn")
              └── SpiderFootScanner (sfscan.py)
                    ├── SpiderFootTarget (target definition)
                    ├── SpiderFootDb (SQLite writes via sfp__stor_db)
                    ├── queue.Queue (in-process inter-module event bus)
                    ├── SpiderFootThreadPool (default: 3 threads)
                    └── Module threads (one threading.Thread per module)
```

Key points:

- **One subprocess per scan** — the API server remains responsive while scans run
- **`spawn` context** — avoids forking SQLite connections and Queues from the parent process
- **In-memory event queue** — modules emit `SpiderFootEvent` objects into a shared `queue.Queue`; the scanner dispatches them to interested modules
- **Thread pool** — `_maxthreads` (default 3) controls how many `handleEvent()` calls run in parallel inside a scan; increase in Settings for more intra-scan parallelism
- **Results persistence** — `sfp__stor_db` (always included in every scan) writes every event to SQLite

### Scan Lifecycle

```
INITIALIZING  →  RUNNING  →  FINISHING  →  FINISHED
                    │                         ↑
                    └──── ERROR-FAILED ───────┘
                    └──── ABORT-REQUESTED ───►  ABORTED
```

After `RUNNING`, the scanner executes all enabled correlation rules against the collected events before transitioning to `FINISHED`.

### Intra-Scan Parallelism vs Inter-Scan Parallelism

| Dimension | Mechanism | Default | How to scale |
|-----------|-----------|---------|--------------|
| **Intra-scan** (modules within one scan) | `SpiderFootThreadPool` | 3 threads | Increase `_maxthreads` in Settings |
| **Inter-scan** (multiple scans in parallel) | Distributed workers (Phase 11) | 1 worker | Add more worker containers |

---

## Distributed Worker System

### Motivation

In the default (single-machine) configuration, every scan runs as a subprocess of the API server on the same host. This creates three bottlenecks:

1. **Throughput** — scans queue up sequentially; the server can only run as many concurrent scans as it has CPU/memory for
2. **Isolation** — slow modules (port scanning, web crawling, rate-limited APIs) compete for the same thread pool as fast reconnaissance modules, so a single slow scan can degrade the responsiveness of all others
3. **Scalability** — adding more hardware requires redeployment; there is no way to burst capacity horizontally

The distributed worker system solves all three:

- **Speed** — multiple worker processes can each run a complete scan simultaneously; adding workers directly increases throughput
- **Isolation** — modules are classified as `fast` or `slow`; separate worker pools ensure slow modules never starve fast ones
- **Scalability** — workers are stateless consumers; you can scale to any number of workers with a single `docker compose --scale` command, including across multiple physical machines

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| **RabbitMQ (not Redis)** | Purpose-built message broker; durable queues survive restarts; built-in management UI |
| **Scan-level distribution** | Each worker runs a *complete* scan (all modules); no changes to the module API or intra-scan event flow |
| **Two queues** | `scans.fast` and `scans.slow`; prevents slow scans from monopolising fast workers |
| **Shared SQLite volume** | Workers on the same host write results directly to the database; no API callback overhead |
| **Graceful fallback** | If `RABBITMQ_URL` is unset or the broker is unreachable, scans fall back transparently to the existing local subprocess |
| **`pika` library** | Pure-Python AMQP client; no native extensions required; ships inside the existing Docker image |

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  API Server                                                  │
│                                                              │
│  launch_scan()                                               │
│    │                                                         │
│    ├─► rabbitmq_available()?  YES                            │
│    │       │                                                 │
│    │       ├─► classify_modules()  →  "fast" or "slow"       │
│    │       └─► publish_scan_task() →  RabbitMQ               │
│    │                                                         │
│    └─► NO (or publish failed)                                │
│            └─► mp.Process(startSpiderFootScanner) [fallback] │
└──────────────────────────────────────────────────────────────┘
                            │
                ┌───────────▼───────────┐
                │       RabbitMQ        │
                │                       │
                │  ┌─────────────────┐  │
                │  │  scans.fast     │  │
                │  │  (durable)      │  │
                │  └────────┬────────┘  │
                │           │           │
                │  ┌─────────────────┐  │
                │  │  scans.slow     │  │
                │  │  (durable)      │  │
                │  └────────┬────────┘  │
                └───────────┼───────────┘
                            │
          ┌─────────────────┴──────────────────┐
          ▼                                    ▼
  ┌────────────────┐                  ┌────────────────┐
  │  Fast Worker   │                  │  Slow Worker   │
  │  (N instances) │                  │  (M instances) │
  │                │                  │                │
  │  worker.py     │                  │  worker.py     │
  │  --queue fast  │                  │  --queue slow  │
  │  --concurrency │                  │  --concurrency │
  │                │                  │                │
  │  scan_runner   │                  │  scan_runner   │
  │  .run_scan_    │                  │  .run_scan_    │
  │  task()        │                  │  task()        │
  │       │        │                  │       │        │
  │       ▼        │                  │       ▼        │
  │  SpiderFoot    │                  │  SpiderFoot    │
  │  Scanner       │                  │  Scanner       │
  └───────┬────────┘                  └───────┬────────┘
          │                                   │
          └─────────────┬─────────────────────┘
                        │  (shared Docker volume)
                        ▼
                  spiderfoot.db
```

### Component Reference

#### `api/services/module_categories.py`

Classifies a comma-separated list of module names as `fast` or `slow`.

```python
classify_modules("sfp_dns,sfp_shodan,sfp_whois")  # → "slow" (shodan is slow)
classify_modules("sfp_dns,sfp_whois")              # → "fast"
```

Slow modules include: `sfp_portscan_tcp`, `sfp_spider`, `sfp_shodan`, `sfp_virustotal`, `sfp_censys`, `sfp_bruteforce`, `sfp_crawler`, and others. A scan is routed to the slow queue if it contains *any* slow module.

#### `api/services/task_publisher.py`

Publishes a JSON task message to the appropriate queue. Messages are marked persistent (`delivery_mode=2`) so they survive a broker restart.

Task message schema:

```json
{
  "scan_id":     "abc123",
  "scan_name":   "My scan",
  "scan_target": "example.com",
  "target_type": "INTERNET_NAME",
  "module_list": "sfp_dns,sfp_shodan,sfp__stor_db",
  "queue_type":  "slow",
  "api_url":     "http://spiderfoot:5001",
  "result_mode": "direct"
}
```

`rabbitmq_available()` does a quick connect-and-close to test broker reachability before each dispatch attempt (timeout: 3 s).

#### `api/services/scan_runner.py`

Executed by the worker process. Loads the SpiderFoot configuration from the shared database, then calls `startSpiderFootScanner()` directly (no subprocess fork — the worker process *is* already a subprocess).

#### `worker.py`

Standalone Python script that can run as a Docker service or a plain process.

```
python worker.py [--queue fast|slow] [--concurrency N]
```

Lifecycle:

1. Connect to RabbitMQ (retries up to 10 times with 5 s backoff)
2. Declare both queues as durable
3. Set `prefetch_count = concurrency` (controls parallel message consumption)
4. Start a background heartbeat thread (every 15 s → `POST /api/v1/workers/heartbeat`)
5. Consume messages; for each message:
   - Call `run_scan_task(task)` — blocks until the scan completes
   - `basic_ack` on success
   - `basic_nack(requeue=False)` on exception (message goes to dead-letter exchange if configured)
6. On SIGTERM / SIGINT: stop consuming, send a final `status=offline` heartbeat, close connection

#### `api/routers/workers.py`

Three endpoints:

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/workers` | `settings:read` | List registered workers; marks stale workers offline |
| `GET` | `/api/v1/workers/{id}` | `settings:read` | Get a single worker |
| `POST` | `/api/v1/workers/heartbeat` | None | Worker self-registration and status update |

The heartbeat endpoint requires no authentication — workers are internal infrastructure and do not have user credentials. In production, restrict this endpoint at the network level (firewall / Docker network isolation).

### Queue Routing Logic

```
Scan requested
      │
      ▼
classify_modules(module_list)
      │
      ├── contains sfp_portscan_tcp, sfp_shodan, sfp_virustotal, sfp_spider,
      │   sfp_censys, sfp_passivetotal, sfp_bruteforce, sfp_crawler, …?
      │         │
      │         YES → scans.slow
      │         NO  → scans.fast
      │
      ▼
publish to queue (durable, persistent delivery)
```

### Worker Heartbeat & Status

Workers report their status every 15 seconds. The API server marks any worker whose `last_seen` is older than 60 seconds as `offline` when the worker list is fetched.

| Status | Meaning |
|--------|---------|
| `idle` | Connected, waiting for tasks |
| `busy` | Currently executing a scan |
| `offline` | No heartbeat in >60 s (worker has stopped or crashed) |

### Scaling

```bash
# Start 4 fast workers + 2 slow workers, detached (local — same machine as API server)
./start-worker.sh --fast 4 --slow 2 --detach
# Equivalent: worker/start.sh --fast 4 --slow 2 --detach

# Remote worker node (after copying worker/ and filling in worker/.env):
cd /opt/sf-worker && ./start.sh --fast 2 --slow 1 --detach
```

`worker/start.sh` auto-detects the deployment mode:
- **Local**: parent directory has `docker-compose.yml` and `SPIDERFOOT_DATA_PATH` is unset → merges with root compose, workers share the same named Docker volume as the API server
- **Remote**: `SPIDERFOOT_DATA_PATH` is set → standalone compose, uses bind-mount to NFS path

Workers on separate machines need:
- Access to the same RabbitMQ broker (via `RABBITMQ_URL`)
- Access to the shared `spiderfoot-data` volume (NFS bind-mount via `SPIDERFOOT_DATA_PATH`) for direct SQLite writes
- CA certificate (`certs/ca.crt` from API server) for broker TLS verification

---

## AI Features

### Scan Analysis

`api/services/ai_analysis.py` sends scan results to an LLM and returns a structured analysis report.

**Supported providers:** OpenAI (`gpt-4o`), Anthropic (`claude-sonnet-4-5`)

**Modes:**

| Mode | Description |
|------|-------------|
| `quick` | High-level executive summary and risk assessment |
| `deep` | Per-category analysis across six domains: Infrastructure, Email Security, Web Presence, Threats, Identity, Data Exposure |

The response is a structured JSON object containing an executive summary, risk level (`HIGH`/`MEDIUM`/`LOW`), findings per category, and a target profile.

**Prompt injection mitigation:** Scan data (which may contain attacker-controlled strings) is sanitised with regex and marked explicitly as data in the system prompt before being sent to the LLM.

### AI-Assisted Rule Generation

`api/services/ai_rules.py` accepts a natural language description and generates a valid SpiderFoot correlation rule in YAML format. The system prompt includes the full rule schema and 20+ example rules.

### AI Chat / Q&A

`api/services/ai_query.py` provides a conversational interface scoped to a specific scan. Users can ask free-form questions about the scan results ("What domains were found?", "Is there any evidence of credential exposure?").

---

## Correlation Rules

Built-in rules live in `correlations/*.yaml` (41 rules). User-defined rules are stored in `tbl_correlation_rules`.

Rules run automatically at the end of every scan. If both a built-in and a user rule share the same `rule_id`, the user rule takes precedence.

**Rule YAML structure:**

```yaml
id: unique_rule_identifier
version: 1
meta:
  name: Human-readable name
  description: What this rule detects
  risk: HIGH | MEDIUM | LOW | INFO

collections:
  - collect:
      - method: exact | regex
        field: type | module | data | source.type | source.data
        value: MALICIOUS_IPADDR   # or list of values

aggregation:            # optional — group matched events by a field
  field: data

analysis:               # optional — apply additional logic
  - method: threshold
    minimum: 3          # must match at least 3 events

headline: "Found {count} malicious IPs: {data}"
```

---

## Frontend (React SPA)

### Technology Stack

| Layer | Library |
|-------|---------|
| Framework | React 18 + TypeScript |
| Routing | React Router DOM v6 |
| Server state | TanStack React Query |
| Client state | Zustand |
| Build | Vite |
| Styling | Tailwind CSS utility classes via CSS variables |

### Pages & Routes

| Route | Component | Access |
|-------|-----------|--------|
| `/login` | `LoginPage` | Public |
| `/` | `Welcome` | All authenticated |
| `/scans` | `ScanList` | `scans:read` |
| `/newscan` | `NewScan` | `scans:create` |
| `/scaninfo/:id` | `ScanInfo` | `scans:read` |
| `/correlation-rules` | `CorrelationRulesPage` | All authenticated |
| `/settings` | `SettingsPage` | `settings:read` |
| `/users` | `UserManagementPage` | Administrator only |
| `/workers` | `WorkersStatus` | Administrator only |

### Authentication Flow

```
1. User submits login form
2. POST /api/v1/auth/login → { access_token, user }
3. authStore.login(token, user) → writes to localStorage
4. All API calls include Authorization: Bearer <token> via axios interceptor
5. 401 response → clear store → redirect to /login
6. ProtectedRoute checks authStore.isAuthenticated on every render
```

### Workers Status Page

`/workers` (admin-only) displays all registered workers in a table with:
- Name and host
- Queue type badge (`fast` in blue, `slow` in orange)
- Status badge (`idle` in green, `busy` in yellow, `offline` in red)
- Current scan ID (if busy)
- Last heartbeat (relative time, e.g. "12s ago")

The page auto-refreshes every 15 seconds to match the worker heartbeat cadence.

---

## Docker & Deployment

### Image Build (Dockerfile)

The Dockerfile uses three build stages:

```
Stage 1: node:20-alpine
  └── npm ci && npm run build
        └── frontend/dist/  ──────────────────────────────┐
                                                          │
Stage 2: python:3.12-alpine                               │
  └── pip install -r requirements.txt                     │
        └── /opt/venv/  ──────────────────────────────────┤
                                                          │
Stage 3: python:3.12-alpine (final)                       │
  ├── Copy /opt/venv/  ◄────────────────────────────────── ┘
  ├── Copy frontend/dist/ into spiderfoot/static/
  ├── Non-root user: spiderfoot
  ├── Volume: /var/lib/spiderfoot
  └── CMD: python sf.py -l 0.0.0.0:5001
```

### Compose Files

| File | Services | Purpose |
|------|----------|---------|
| `docker-compose.yml` | `rabbitmq`, `spiderfoot` | Core deployment |
| `worker/docker-compose.yml` | `sf-worker-fast`, `sf-worker-slow` | Worker services (local or remote) |

### Startup Scripts

```bash
# Start core services (API server + RabbitMQ)
./start.sh [--build] [--detach] [--full] [--dev]

# Start workers — local (same machine as API server)
./start-worker.sh [--fast N] [--slow N] [--build] [--detach]
./start-worker.sh --logs   # Follow logs
./start-worker.sh --stop   # Stop workers

# Start workers — remote (copy worker/ to remote machine, fill in worker/.env)
# cd /opt/sf-worker && ./start.sh [--fast N] [--slow N] [--build] [--detach]

# Stop everything
./stop.sh
```

### Environment Variables

Copy `.env.example` to `.env` and edit before first run:

| Variable | Default | Description |
|----------|---------|-------------|
| `SPIDERFOOT_ADMIN_USER` | `admin` | Username for the bootstrap admin account |
| `SPIDERFOOT_ADMIN_PASSWORD` | `changeme` | Password for the bootstrap admin account |
| `RABBITMQ_URL` | `amqp://spiderfoot:spiderfoot@rabbitmq:5672/` | Full AMQP URL for the broker |
| `RABBITMQ_USER` | `spiderfoot` | RabbitMQ container username |
| `RABBITMQ_PASS` | `spiderfoot` | RabbitMQ container password |
| `SPIDERFOOT_DATA` | `/var/lib/spiderfoot` | Data directory (DB, cache, logs) |
| `SPIDERFOOT_API_URL` | `http://spiderfoot:5001` | API base URL (used by workers for heartbeats) |
| `SPIDERFOOT_WORKER_NAME` | hostname | Display name shown in the Workers UI |

---

## Configuration Reference

### Runtime Configuration

Most SpiderFoot settings are stored in `tbl_config` and editable via Settings in the UI or `PUT /api/v1/settings`. Key settings:

| Key | Default | Description |
|-----|---------|-------------|
| `_maxthreads` | `3` | Module threads per scan (intra-scan parallelism) |
| `_fetchtimeout` | `5` | HTTP request timeout in seconds |
| `_dnsserver` | (system) | Custom DNS resolver |
| `_useragent` | Firefox UA | User-agent string for HTTP requests |
| `_ai_provider` | `openai` | AI provider (`openai` or `anthropic`) |
| `_ai_openai_key` | — | OpenAI API key (stored encrypted) |
| `_ai_anthropic_key` | — | Anthropic API key (stored encrypted) |

### Module-Level Configuration

Each of the 200+ modules exposes its own configuration options (API keys, thresholds, toggles) via the Settings → Modules page. Module configs are stored in `tbl_config` under the module name as the scope.

---

*Last updated: Phase 11 (Distributed Scan Execution)*
