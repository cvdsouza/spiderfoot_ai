#!/usr/bin/env bash
# worker/start.sh — Start SpiderFoot distributed scan workers
#
# Works in two modes, selected automatically:
#
#   LOCAL  — when run on the same machine as the API server (the parent
#             directory contains docker-compose.yml).  Workers share the
#             API server's Docker volumes; no .env configuration needed.
#
#   REMOTE — when this directory has been copied to a separate machine.
#             Fill in .env (copy from .env.example), then run this script.
#
# Usage:
#   ./start.sh [OPTIONS]
#
# Options:
#   --fast N     Start N fast-queue workers (default: 1)
#   --slow N     Start N slow-queue workers (default: 1)
#   --build      Force rebuild the Docker image before starting
#   --detach     Run workers in the background (detached mode)
#   --stop       Stop all running workers
#   --logs       Follow worker logs (workers must already be running)
#   -h, --help   Show this help message
#
# Examples:
#   ./start.sh                         1 fast + 1 slow worker (foreground)
#   ./start.sh --detach                Start workers in background
#   ./start.sh --fast 4 --slow 2       Start 4 fast + 2 slow workers
#   ./start.sh --build --detach        Rebuild image and start workers
#   ./start.sh --stop                  Stop all workers
#   ./start.sh --logs                  Follow worker logs

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Load .env if present ──────────────────────────────────────────────────────
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -o allexport
    # shellcheck disable=SC1091
    source "$SCRIPT_DIR/.env"
    set +o allexport
fi

# ── Detect local vs remote mode ───────────────────────────────────────────────
# Local:  parent directory has docker-compose.yml AND SPIDERFOOT_DATA_PATH is unset.
#         Workers merge with the parent Compose project to share named volumes.
# Remote: SPIDERFOOT_DATA_PATH is set (bind-mount to NFS) or no parent compose found.
ROOT_COMPOSE="$SCRIPT_DIR/../docker-compose.yml"

if [ -f "$ROOT_COMPOSE" ] && [ -z "${SPIDERFOOT_DATA_PATH:-}" ]; then
    MODE="local"
    # Use the parent directory as the Compose project root so workers join
    # the same project (and share the same named volumes) as the API server.
    COMPOSE=(docker compose
        --project-directory "$SCRIPT_DIR/.."
        -f "$ROOT_COMPOSE"
        -f "$SCRIPT_DIR/docker-compose.yml"
    )
else
    MODE="remote"
    COMPOSE=(docker compose -f "$SCRIPT_DIR/docker-compose.yml")
fi

# ── Parse arguments ───────────────────────────────────────────────────────────
FAST_COUNT=1
SLOW_COUNT=1
BUILD=false
DETACH=""
ACTION="up"

usage() {
    sed -n '2,30p' "$0" | sed 's/^# \?//'
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --fast)
            FAST_COUNT="${2:?--fast requires a number}"
            shift 2
            ;;
        --slow)
            SLOW_COUNT="${2:?--slow requires a number}"
            shift 2
            ;;
        --build)
            BUILD=true
            shift
            ;;
        --detach|-d)
            DETACH="-d"
            shift
            ;;
        --stop)
            ACTION="stop"
            shift
            ;;
        --logs)
            ACTION="logs"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# ── Actions: stop / logs ──────────────────────────────────────────────────────
if [ "$ACTION" = "stop" ]; then
    echo "Stopping SpiderFoot workers..."
    "${COMPOSE[@]}" stop sf-worker-fast sf-worker-slow
    "${COMPOSE[@]}" rm -f sf-worker-fast sf-worker-slow
    echo "Workers stopped."
    exit 0
fi

if [ "$ACTION" = "logs" ]; then
    "${COMPOSE[@]}" logs -f sf-worker-fast sf-worker-slow
    exit 0
fi

# ── Pre-flight checks ─────────────────────────────────────────────────────────
if [ "$MODE" = "local" ]; then
    # Generate TLS certificates (idempotent — skips if already present)
    if [ -f "$SCRIPT_DIR/../generate-certs.sh" ]; then
        bash "$SCRIPT_DIR/../generate-certs.sh"
    fi
else
    # Remote mode: validate required variables
    if [ -z "${RABBITMQ_URL:-}" ]; then
        echo ""
        echo "ERROR: RABBITMQ_URL is not set."
        echo "Copy .env.example to .env and fill in your settings:"
        echo "  cp .env.example .env"
        echo ""
        exit 1
    fi

    if [ -z "${SPIDERFOOT_DATA_PATH:-}" ]; then
        echo ""
        echo "ERROR: SPIDERFOOT_DATA_PATH is not set."
        echo "Set it to the NFS-mounted directory containing spiderfoot.db, e.g.:"
        echo "  SPIDERFOOT_DATA_PATH=/var/lib/spiderfoot"
        echo ""
        exit 1
    fi

    CA_HOST="${RABBITMQ_CA_CERT_HOST:-/etc/rabbitmq/certs/ca.crt}"
    if [ ! -f "$CA_HOST" ]; then
        echo ""
        echo "WARNING: CA certificate not found at '$CA_HOST'."
        echo "Workers will connect over TLS without verifying the broker certificate."
        echo "Copy certs/ca.crt from the API server to resolve this:"
        echo "  sudo mkdir -p \"$(dirname "$CA_HOST")\""
        echo "  scp user@api-server:spiderfoot_ai/certs/ca.crt \"$CA_HOST\""
        echo ""
    fi
fi

# ── Start workers ─────────────────────────────────────────────────────────────
BUILD_FLAG=""
if [ "$BUILD" = true ]; then
    BUILD_FLAG="--build"
fi

echo "Starting SpiderFoot workers (mode=$MODE, fast=$FAST_COUNT, slow=$SLOW_COUNT)..."

"${COMPOSE[@]}" up $BUILD_FLAG $DETACH \
    --scale sf-worker-fast="$FAST_COUNT" \
    --scale sf-worker-slow="$SLOW_COUNT" \
    sf-worker-fast sf-worker-slow

if [ -n "$DETACH" ]; then
    echo ""
    echo "Workers running in the background (mode: $MODE)."
    echo ""
    echo "  Fast workers : $FAST_COUNT  (queue: scans.fast)"
    echo "  Slow workers : $SLOW_COUNT  (queue: scans.slow)"
    echo ""
    echo "  Follow logs  : $0 --logs"
    echo "  Stop workers : $0 --stop"
    echo ""
    if [ "$MODE" = "local" ]; then
        echo "Worker status is visible in the SpiderFoot UI under Workers."
    else
        echo "Worker status is visible in the SpiderFoot UI on the API server."
    fi
fi
