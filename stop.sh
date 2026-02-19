#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILES="-f docker-compose.yml"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Stop SpiderFoot Docker Compose services."
    echo ""
    echo "Options:"
    echo "  --full       Stop the full image stack"
    echo "  --dev        Stop the dev mode stack"
    echo "  --remove     Remove containers and networks after stopping"
    echo "  -h, --help   Show this help message"
}

REMOVE=""

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
        --remove)
            REMOVE=true
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

if [ "$REMOVE" = true ]; then
    docker compose $COMPOSE_FILES down
else
    docker compose $COMPOSE_FILES stop
fi

echo "SpiderFoot stopped."
