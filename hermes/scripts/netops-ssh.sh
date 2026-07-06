#!/usr/bin/env bash
# NetOps SSH via connector — wrapper read-only para Hermes agent.
set -euo pipefail

REPO_ROOT="${NETOPS_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$REPO_ROOT"

DEVICE_INPUT="${1:?usage: netops-ssh.sh <device_id|hostname> \"<command>\"}"
CMD="${2:?usage: netops-ssh.sh <device_id|hostname> \"<command>\"}"

# Bloqueio básico client-side (espelha política do connector)
BLOCKED_RE='(^|[[:space:];|&])(configure|commit|system-view|undo|delete|reload|reset)([[:space:]]|$)'
if echo "$CMD" | grep -qiE "$BLOCKED_RE"; then
  echo "BLOCKED: comando não permitido pela política read-only NetOps" >&2
  exit 2
fi
if echo "$CMD" | grep -qE '[|;&$`<>]'; then
  echo "BLOCKED: metacaracteres de shell não permitidos" >&2
  exit 2
fi

DEVICE="$DEVICE_INPUT"
if ! [[ "$DEVICE" =~ ^[0-9]+$ ]]; then
  DEVICE=$(docker exec netops-db psql -U netops -d netops -t -A -c \
    "SELECT id FROM devices WHERE hostname = '${DEVICE_INPUT//\'/\'\'}' LIMIT 1" 2>/dev/null | tr -d '[:space:]' || true)
  if ! [[ "$DEVICE" =~ ^[0-9]+$ ]]; then
    echo "Device not found: $DEVICE_INPUT" >&2
    exit 1
  fi
fi

exec "$REPO_ROOT/tools/device-ssh-via-connector.sh" "$DEVICE" "$CMD"
