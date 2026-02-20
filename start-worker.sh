#!/usr/bin/env bash
# Convenience wrapper — delegates to worker/start.sh
# See worker/start.sh --help for all options and documentation.
exec "$(dirname "$0")/worker/start.sh" "$@"
