#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

COMPOSE_FILES="-f docker-compose.yml"
BUILD=false

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Start SpiderFoot via Docker Compose."
    echo ""
    echo "Options:"
    echo "  --full       Use the full image with all CLI tools (nmap, nuclei, etc.)"
    echo "  --dev        Use dev mode (mounts local code into the container)"
    echo "  --build      Force rebuild the Docker image before starting"
    echo "  --detach     Run in the background (detached mode)"
    echo "  -h, --help   Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                  Start SpiderFoot (standard image)"
    echo "  $0 --build          Rebuild and start"
    echo "  $0 --full --build   Rebuild the full image and start"
    echo "  $0 --detach         Start in the background"
}

DETACH=""

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
        --detach|-d)
            DETACH="-d"
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

BUILD_FLAG=""
if [ "$BUILD" = true ]; then
    BUILD_FLAG="--build"
fi

echo "Starting SpiderFoot..."
docker compose $COMPOSE_FILES up $BUILD_FLAG $DETACH

if [ -n "$DETACH" ]; then
    echo ""
    echo "SpiderFoot is running at http://127.0.0.1:5001"
    echo "Use ./stop.sh to stop it."
fi
