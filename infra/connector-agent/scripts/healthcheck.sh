#!/bin/bash
set -euo pipefail

STATE_DIR="${STATE_DIR:-/var/run/netops-connector}"
HEARTBEAT_MAX_AGE="${HEARTBEAT_MAX_AGE:-180}"
NETOPS_SERVER_URL="${NETOPS_SERVER_URL:-}"

fail() {
  echo "healthcheck: FAIL — $1"
  exit 1
}

if ! pgrep -f "agent.main" >/dev/null 2>&1; then
  fail "agent process not running"
fi

if [ -n "$NETOPS_SERVER_URL" ]; then
  base="${NETOPS_SERVER_URL%/api}"
  base="${base%/}"
  if ! curl -sf --max-time 5 "${base}/api/healthz" >/dev/null; then
    fail "cannot reach NetOps server healthz"
  fi
fi

hb_file="$STATE_DIR/last_heartbeat"
if [ ! -f "$hb_file" ]; then
  fail "no heartbeat recorded yet"
fi

now=$(date +%s)
last=$(cat "$hb_file" 2>/dev/null || echo 0)
age=$((now - ${last%.*}))

if [ "$age" -gt "$HEARTBEAT_MAX_AGE" ]; then
  fail "last heartbeat too old (${age}s)"
fi

echo "healthcheck: OK (heartbeat ${age}s ago)"
exit 0
