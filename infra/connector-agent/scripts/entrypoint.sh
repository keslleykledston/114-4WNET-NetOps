#!/bin/bash
set -euo pipefail

AGENT_HOME="/opt/netops-connector"
STATE_DIR="${STATE_DIR:-/var/run/netops-connector}"
LOG_DIR="${LOG_DIR:-/var/log/netops-connector}"
WG_ENABLED="${WG_ENABLED:-false}"
WG_CONFIG_PATH="${WG_CONFIG_PATH:-/etc/netops-connector/wireguard/netops.conf}"

mkdir -p "$LOG_DIR" "$STATE_DIR" "$(dirname "$WG_CONFIG_PATH")"

if [ "$WG_ENABLED" = "true" ] || [ "$WG_ENABLED" = "1" ]; then
  echo "[entrypoint] WireGuard enabled — bringing up tunnel"
  "$AGENT_HOME/scripts/wg-up.sh" || echo "[entrypoint] wg-up failed (continuing agent)"
else
  echo "[entrypoint] WireGuard disabled (WG_ENABLED=false)"
fi

trap '"$AGENT_HOME/scripts/wg-down.sh" || true' EXIT

exec "$@"
