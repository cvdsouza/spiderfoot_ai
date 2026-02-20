# SpiderFoot Deployment Guide

This guide covers three deployment topologies, from the simplest single-server setup to a horizontally-scaled multi-server configuration.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup (all topologies)](#initial-setup-all-topologies)
3. [Topology 1 — Single Server, No Workers](#topology-1--single-server-no-workers)
4. [Topology 2 — Single Server with Local Workers](#topology-2--single-server-with-local-workers)
5. [Topology 3 — Multiple Servers with Remote Workers](#topology-3--multiple-servers-with-remote-workers)
6. [Upgrading](#upgrading)
7. [Maintenance](#maintenance)
8. [Troubleshooting](#troubleshooting)
9. [Security Hardening](#security-hardening)

---

## Prerequisites

### Software (all servers)

| Requirement | Minimum version | Check |
|-------------|----------------|-------|
| Docker Engine | 24+ | `docker --version` |
| Docker Compose plugin | 2.20+ | `docker compose version` |
| Git | any | `git --version` |

Install Docker Engine on Ubuntu/Debian:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in after this
```

### Hardware

| Topology | CPU | RAM | Disk |
|----------|-----|-----|------|
| Single server (no workers) | 2 cores | 2 GB | 20 GB |
| Single server + workers | 4 cores | 4 GB | 40 GB |
| API server (multi-server) | 2 cores | 2 GB | 20 GB |
| Each worker node (stateless) | 2 cores | 2 GB | 10 GB |

### Ports

| Port | Service | Required on |
|------|---------|-------------|
| 5001 | SpiderFoot UI / API | API server (open to users) |
| 5671 | RabbitMQ AMQPS (TLS) | API server (open to worker nodes only) |
| 15672 | RabbitMQ Management UI | API server (optional, restrict to admin) |

---

## Initial Setup (all topologies)

These steps are the same regardless of which topology you choose.

### 1. Clone the repository

```bash
git clone https://github.com/your-org/spiderfoot_ai.git
cd spiderfoot_ai
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```bash
# ── Admin account ──────────────────────────────────────────────────────────────
# Created automatically on first startup. Cannot be changed via .env after that.
SPIDERFOOT_ADMIN_USER=admin
SPIDERFOOT_ADMIN_PASSWORD=your-strong-password-here

# ── RabbitMQ credentials ───────────────────────────────────────────────────────
# Must be consistent across .env and RABBITMQ_URL below.
RABBITMQ_USER=spiderfoot
RABBITMQ_PASS=your-rabbitmq-password-here

# ── RabbitMQ connection URL ────────────────────────────────────────────────────
# Uses AMQPS (TLS) by default on port 5671. Certificates are generated
# automatically by start.sh — no manual steps required.
RABBITMQ_URL=amqps://spiderfoot:your-rabbitmq-password-here@rabbitmq:5671/
```

> **Important:** Set credentials before the first `docker compose up`. The admin account is only created once — changing these values after first run has no effect. Use the UI (Settings → Users) to change credentials afterwards.

### 3. Make scripts executable

```bash
chmod +x start.sh stop.sh start-worker.sh
```

### 4. TLS certificates (automatic)

RabbitMQ is configured to accept **TLS-only connections** (port 5671) by default. Self-signed certificates are generated automatically the first time you run `./start.sh` or `./start-worker.sh` via a helper script (`generate-certs.sh`).

The generated files are stored in `certs/` (excluded from git):

| File | Purpose |
|------|---------|
| `certs/ca.key` | CA private key (keep secret) |
| `certs/ca.crt` | CA certificate (shared with workers) |
| `certs/server.key` | RabbitMQ server private key |
| `certs/server.crt` | RabbitMQ server certificate |

Certificate generation is **idempotent** — it runs on every `./start.sh` call but skips immediately if the files already exist. The certificates are valid for 10 years and cover the `rabbitmq`, `sf-rabbitmq`, and `localhost` hostnames plus `127.0.0.1`.

> **Multi-server setup:** Copy `certs/ca.crt` from the API server to each worker node (see [Topology 3](#topology-3--multiple-servers-with-remote-workers)).

---

## Topology 1 — Single Server, No Workers

**Best for:** Development, evaluation, low scan volume, or when you don't need parallel scan execution.

In this mode, every scan runs as a local subprocess on the API server. RabbitMQ is still started (it's part of the base compose file) but no workers are consuming from it — scans execute locally via fallback.

```
┌───────────────────────────────────┐
│  Single Server                    │
│                                   │
│  ┌─────────────┐  ┌───────────┐  │
│  │  SpiderFoot │  │ RabbitMQ  │  │
│  │  API + UI   │  │ (standby) │  │
│  └─────────────┘  └───────────┘  │
│                                   │
│  Volume: spiderfoot-data          │
└───────────────────────────────────┘
```

### Start

```bash
./start.sh --build --detach
```

### Access

- SpiderFoot UI: `http://<server-ip>:5001`
- Login with the credentials you set in `.env`

### Stop

```bash
./stop.sh
```

### Verify

```bash
docker compose ps          # all containers should be "running"
docker compose logs -f     # watch startup logs
```

---

## Topology 2 — Single Server with Local Workers

**Best for:** Single server with enough CPU/RAM to run multiple scans simultaneously. Adds horizontal parallelism without requiring additional machines.

Workers run as additional Docker containers on the same host. All worker files live in `worker/` — `start-worker.sh` at the project root is a convenience wrapper that calls `worker/start.sh`.

**Note:** Workers are stateless and publish results to RabbitMQ (same as Topology 3). The shared Docker volume shown in the diagram is only used by the API server for the database — workers don't require direct database access.

```
┌────────────────────────────────────────────────────────────────┐
│  Single Server                                                 │
│                                                                │
│  ┌─────────────┐  ┌──────────────────────────────────────┐    │
│  │  SpiderFoot │  │  RabbitMQ                            │    │
│  │  API + UI   │  │  ┌──────────────┐ ┌───────────────┐ │    │
│  │  :5001      │  │  │ scans.fast   │ │ scans.slow    │ │    │
│  └─────────────┘  │  └──────┬───────┘ └──────┬────────┘ │    │
│                   └─────────┼─────────────────┼──────────┘    │
│                             │                 │               │
│                   ┌─────────▼──────┐ ┌────────▼────────┐     │
│                   │ sf-worker-fast │ │ sf-worker-slow  │     │
│                   │ (N instances)  │ │ (M instances)   │     │
│                   └───────┬────────┘ └────────┬─────────┘     │
│                           └────────┬───────────┘               │
│                     Shared Volume: spiderfoot-data             │
└────────────────────────────────────────────────────────────────┘
```

### Step 1 — Start the API server

```bash
./start.sh --build --detach
```

Wait until the API server is healthy:

```bash
docker compose ps          # spiderfoot should show "running"
curl http://localhost:5001/api/v1/ping   # should return {"status":"ok"}
```

### Step 2 — Start workers

```bash
# Default: 1 fast worker + 1 slow worker
./start-worker.sh --detach

# For higher throughput, scale up:
./start-worker.sh --fast 4 --slow 2 --detach
```

### Step 3 — Verify workers are connected

Open the SpiderFoot UI and navigate to **Workers** (admin menu). You should see your workers listed with status `idle`.

Alternatively, check logs:

```bash
./start-worker.sh --logs
```

### Choosing worker counts

| Workload | Recommended configuration |
|----------|--------------------------|
| Light (1-2 concurrent scans) | `--fast 1 --slow 1` |
| Medium (3-5 concurrent scans) | `--fast 3 --slow 2` |
| Heavy (5+ concurrent scans) | `--fast 6 --slow 3` |

As a rule of thumb: keep total worker concurrency below `(CPU cores / 2)` to avoid thrashing.

### Stop workers

```bash
./start-worker.sh --stop
```

### Stop everything

```bash
./stop.sh
```

---

## Topology 3 — Multiple Servers with Remote Workers (Stateless)

**Best for:** High scan volumes, production deployments, or when you want to offload scan execution from the API server entirely.

In this topology, the API server and RabbitMQ run on one machine, and additional worker nodes run on separate machines. **Workers are stateless** — they execute scans and publish results to RabbitMQ. The API server consumes results from RabbitMQ and writes them to the database. Workers require only RabbitMQ access (no shared filesystem/NFS needed).

**Stateless worker benefits:**
- ✅ Deploy anywhere: different clouds, regions, on-premises + cloud hybrid
- ✅ No NFS complexity: no mount points, file locking issues, or network filesystem overhead
- ✅ Easy horizontal scaling: spin up 100 workers when needed, shut down when idle
- ✅ Cloud-native ready: works seamlessly with ECS, Cloud Run, Kubernetes, or any container platform
- ✅ Database flexibility: swap SQLite for PostgreSQL without changing workers

```
┌─────────────────────────────────────────┐
│  API Server  (machine-1)                │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │  SpiderFoot │  │    RabbitMQ      │  │
│  │  API + UI   │  │  :5671 (AMQPS)   │  │
│  │  :5001      │  │  :15672 (UI)     │  │
│  └──────┬──────┘  └──────────────────┘  │
│         │                                │
│  Volume: spiderfoot-data                 │
└─────────┼────────────────────────────────┘
          │  RabbitMQ (AMQPS, TLS)
          │  Workers publish results here
       ┌──┴────────────┬─────────────┐
       │               │             │
┌──────▼────────────┐  ┌─────────▼────────┐
│  Worker Node 1    │  │  Worker Node 2   │
│  (machine-2)      │  │  (machine-3)     │
│                   │  │                  │
│  sf-worker-fast   │  │  sf-worker-fast  │
│  sf-worker-slow   │  │  sf-worker-slow  │
│                   │  │                  │
│  STATELESS        │  │  STATELESS       │
│  (no DB access)   │  │  (no DB access)  │
└───────────────────┘  └──────────────────┘
```

### Step 1 — Start the API server (machine-1)

```bash
./start.sh --build --detach
```

Wait until the API server is healthy:

```bash
docker compose ps          # spiderfoot should show "running"
curl http://localhost:5001/api/v1/ping   # should return {"status":"ok"}
```

### Step 2 — Copy worker files to each worker node

All worker-related files live in the `worker/` subdirectory. Copy it to each remote machine — that's all you need:

```bash
# On machine-1 — copy the worker directory to each worker node
scp -r worker/ user@192.168.1.11:/opt/sf-worker
scp -r worker/ user@192.168.1.12:/opt/sf-worker
```

Alternatively, clone the full repo and just use the `worker/` subdirectory.

### Step 3 — Copy the CA certificate to worker nodes

```bash
# On each worker node:
ssh user@192.168.1.11 "sudo mkdir -p /etc/rabbitmq/certs"
ssh user@192.168.1.12 "sudo mkdir -p /etc/rabbitmq/certs"

# Copy CA cert from machine-1 to each worker
scp certs/ca.crt user@192.168.1.11:/tmp/ca.crt
scp certs/ca.crt user@192.168.1.12:/tmp/ca.crt

# Move to the correct location with sudo
ssh user@192.168.1.11 "sudo mv /tmp/ca.crt /etc/rabbitmq/certs/ca.crt"
ssh user@192.168.1.12 "sudo mv /tmp/ca.crt /etc/rabbitmq/certs/ca.crt"
```

### Step 4 — Configure each worker node

On **each worker node**, edit the `.env` file:

```bash
cd /opt/sf-worker
cp .env.example .env
```

Fill in the values specific to this deployment:

```bash
# RabbitMQ on machine-1 (use your actual credentials)
RABBITMQ_URL=amqps://spiderfoot:your-rabbitmq-password-here@192.168.1.10:5671/

# Path where the CA cert was copied in Step 3
RABBITMQ_CA_CERT_HOST=/etc/rabbitmq/certs/ca.crt

# Heartbeat target — the API server
SPIDERFOOT_API_URL=http://192.168.1.10:5001

# Unique name per node (use different names on each worker node)
SPIDERFOOT_WORKER_NAME=worker-node-2
```

`worker/.env.example` documents all available variables with explanations.

### Step 5 — Start workers on each worker node

```bash
# On machine-2 (and machine-3, etc.)
cd /opt/sf-worker
chmod +x start.sh
./start.sh --fast 2 --slow 1 --build --detach
```

`worker/start.sh` detects it is running in remote mode (because the parent directory does not contain `docker-compose.yml`) and uses standalone Compose — no need to merge with the API server's compose file.

### Step 6 — Verify all workers appear in the UI

On machine-1, open the SpiderFoot UI → **Workers**. You should see workers from all nodes listed.

### Firewall rules (machine-1)

Allow the following inbound connections **from worker nodes only**:

```bash
# RabbitMQ AMQPS (TLS) — workers connect here
ufw allow from 192.168.1.0/24 to any port 5671

# API heartbeat endpoint
ufw allow from 192.168.1.0/24 to any port 5001

# Block RabbitMQ management UI from public internet
ufw deny 15672

# Block plain AMQP port (disabled by default in rabbitmq.conf, but deny at firewall too)
ufw deny 5672
```

### Network summary

| Connection | From | To | Port | Encrypted |
|------------|------|----|------|-----------|
| RabbitMQ AMQPS | worker nodes | machine-1 | 5671 | Yes (TLS, automatic) |
| Heartbeat / API | worker nodes | machine-1 | 5001 | No (use private network) |
| UI / REST API | users | machine-1 | 5001 | Via nginx (see TLS section) |

---

## Upgrading

### Pull and rebuild

```bash
git pull

# Stop everything
./stop.sh
./start-worker.sh --stop   # if workers are running

# Rebuild and restart
./start.sh --build --detach
./start-worker.sh --fast 2 --slow 1 --build --detach   # if using workers
```

Database schema migrations run automatically on startup — no manual SQL needed.

### Rolling upgrade of workers (zero-downtime)

Because workers are stateless consumers, you can upgrade them one at a time:

```bash
# On each worker node, one at a time (local or remote):
./start-worker.sh --stop        # or: cd /opt/sf-worker && ./start.sh --stop
git pull                        # (if using full repo) or re-copy worker/ directory
./start-worker.sh --fast 2 --slow 1 --build --detach
```

Any in-flight scans on a stopped worker are **nacked** (not acknowledged) and returned to the RabbitMQ queue. The next available worker picks them up automatically.

---

## Maintenance

### View logs

```bash
# API server logs
docker compose logs -f spiderfoot

# Worker logs
./start-worker.sh --logs

# RabbitMQ logs
docker compose logs -f rabbitmq
```

### Database backup

The database is a single SQLite file. Back it up while SpiderFoot is running (WAL mode makes this safe):

```bash
# On the host, copy the volume data
docker run --rm \
  -v spiderfoot_spiderfoot-data:/data \
  -v $(pwd)/backups:/backup \
  alpine \
  cp /data/spiderfoot.db /backup/spiderfoot-$(date +%Y%m%d-%H%M%S).db
```

Or if using a bind mount:

```bash
cp /var/lib/spiderfoot/spiderfoot.db \
   /path/to/backups/spiderfoot-$(date +%Y%m%d-%H%M%S).db
```

### RabbitMQ management UI

The RabbitMQ management dashboard is available at `http://<server>:15672`. Log in with the `RABBITMQ_USER` / `RABBITMQ_PASS` credentials from your `.env` file.

Use it to:
- Monitor queue depth (`scans.fast`, `scans.slow`)
- Monitor per-scan result queues (`scan.results.{scan_id}`) — created dynamically during scans
- See which workers are connected (Connections tab)
- Inspect or purge stuck messages

> **Production note:** Restrict port 15672 to your admin network only.
>
> **Note:** Result queues (`scan.results.*`) are created automatically for each scan and auto-delete when the scan completes. This is normal behavior for the stateless worker architecture.

### Check worker health

```bash
# Via the API
curl -H "Authorization: Bearer <token>" \
     http://localhost:5001/api/v1/workers | python3 -m json.tool

# Via the UI
# Navigate to Workers in the admin menu
```

---

## Troubleshooting

### Container won't start

```bash
docker compose logs spiderfoot    # check for Python errors
docker compose logs rabbitmq      # check for broker errors
```

Common causes:
- **Port 5001 already in use** — change the host port in `docker-compose.yml` (`"5002:5001"`)
- **Database permissions** — the container runs as the `spiderfoot` user; ensure the volume directory is writable
- **RabbitMQ health check fails** — wait 30 s and try again; the broker takes a few seconds to start

### Workers show as offline immediately

1. Check `RABBITMQ_URL` in `.env` — it must use `amqps://` and port `5671`
2. Verify TLS connectivity from the worker: `docker exec sf-worker-fast openssl s_client -connect rabbitmq:5671 2>&1 | head -5`
3. Check that port 5671 is open on the API server from the worker node
4. If using remote workers, verify `certs/ca.crt` was copied to the worker node and mounted correctly (see [Topology 3, Step 4a](#step-4a--copy-the-ca-certificate-to-worker-nodes))

### Scans are queued but not executing

1. Check that workers are running: `docker compose ps`
2. Check the queue in RabbitMQ management UI — are messages accumulating in `scans.fast` or `scans.slow`?
3. Look at worker logs: `./start-worker.sh --logs`
4. If `RABBITMQ_URL` is unset, the API server falls back to local subprocess — verify the env var is set correctly

### Scans run locally instead of via workers

The API server falls back to a local subprocess when:
- `RABBITMQ_URL` is empty or unset
- RabbitMQ is unreachable at dispatch time (3 s timeout)
- The publish call fails

Check:
```bash
docker compose exec spiderfoot env | grep RABBITMQ_URL
```

If empty, verify your `.env` file is in the project root and contains `RABBITMQ_URL=...`.

### Worker connectivity issues (multi-server)

Workers are stateless and only require RabbitMQ connectivity. If workers fail to connect:

- Verify `RABBITMQ_URL` uses `amqps://` and port `5671`
- Check that the CA certificate (`certs/ca.crt`) was copied to worker nodes correctly
- Verify firewall allows port 5671 from worker subnet
- Test connectivity: `telnet 192.168.1.10 5671` from worker node

---

## Security Hardening

### Change default credentials

Immediately after first startup, change the admin password via the UI (Settings → Change Password) or set strong values in `.env` before first run.

Never use the default credentials (`admin` / `changeme`) in production.

### TLS / HTTPS

SpiderFoot does not terminate TLS itself. Place it behind a reverse proxy:

**nginx example** (`/etc/nginx/sites-available/spiderfoot`):

```nginx
server {
    listen 443 ssl;
    server_name spiderfoot.example.com;

    ssl_certificate     /etc/letsencrypt/live/spiderfoot.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/spiderfoot.example.com/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:5001;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
        proxy_send_timeout 300;
    }
}

server {
    listen 80;
    server_name spiderfoot.example.com;
    return 301 https://$host$request_uri;
}
```

### RabbitMQ credentials

Change the default credentials in `.env` before first run:

```bash
RABBITMQ_USER=mybrokeruser
RABBITMQ_PASS=a-very-long-random-password
RABBITMQ_URL=amqps://mybrokeruser:a-very-long-random-password@rabbitmq:5671/
```

The credentials must match between `RABBITMQ_USER`/`RABBITMQ_PASS` (used by the broker container) and the `RABBITMQ_URL` (used by the API server and workers).

### Restrict exposed ports

In production, only port 5001 (or your nginx 443) should be publicly accessible:

```bash
# Only expose SpiderFoot to a reverse proxy (bind to loopback)
# In docker-compose.yml, change:
#   ports:
#     - "127.0.0.1:5001:5001"   ← bind to loopback only
```

Close port 15672 (RabbitMQ UI) and 5671 (AMQPS) from the public internet — workers should only reach the broker via a private network.

### RabbitMQ TLS certificate management

RabbitMQ TLS is **enabled by default** and configured automatically. The plain-TCP port (5672) is disabled in `rabbitmq/rabbitmq.conf`. No manual TLS configuration is required.

**Rotating certificates** (e.g., after a key compromise):

```bash
# Remove the existing certs — they will be regenerated on next start
rm -rf certs/

# Restart to regenerate
./stop.sh
./start.sh --detach

# For multi-server: copy the new ca.crt to all worker nodes
scp certs/ca.crt user@192.168.1.11:/etc/rabbitmq/certs/ca.crt
# Then restart workers on each node
./start-worker.sh --stop
./start-worker.sh --fast 2 --slow 1 --detach
```

**Using your own CA / production certificates** — replace the auto-generated files in `certs/` before starting:

```
certs/ca.crt      ← your CA certificate (PEM format)
certs/server.crt  ← RabbitMQ server certificate (PEM, signed by your CA)
certs/server.key  ← RabbitMQ server private key (PEM)
```

`generate-certs.sh` will skip generation if all three files already exist.

### Rotate the JWT signing key

The JWT signing key is stored at `{dataPath}/jwt.key`. Rotating it invalidates all active sessions:

```bash
docker compose stop spiderfoot
docker run --rm -v spiderfoot_spiderfoot-data:/data alpine rm /data/jwt.key
docker compose start spiderfoot   # a new key is generated on startup
```
