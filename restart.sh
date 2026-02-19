#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILES="-f docker-compose.yml"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Restart SpiderFoot Docker Compose services."
    echo ""
    echo "Options:"
    echo "  --full       Use the full image with all CLI tools"
    echo "  --dev        Use dev mode (mounts local code)"
    echo "  --build      Force rebuild the Docker image before restarting"
    echo "  -h, --help   Show this help message"
}

BUILD=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --full)
            COMPOSE_FILES="-f docker-compose.yml -f docker-compose-full.yml"
            shift
            ;;
        --dev)
            COMPOSE_FILES="-f docker-compose.yml -f docker-compose-dev.yml"
            shift
            ;;
        --build)
            BUILD=true
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

echo "Stopping SpiderFoot..."
docker compose $COMPOSE_FILES stop

if [ "$BUILD" = true ]; then
    echo "Rebuilding SpiderFoot..."
    docker compose $COMPOSE_FILES build
fi

echo "Starting SpiderFoot..."
docker compose $COMPOSE_FILES up -d

echo ""
echo "SpiderFoot restarted at http://127.0.0.1:5001"
