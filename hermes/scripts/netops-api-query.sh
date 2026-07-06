#!/usr/bin/env bash
# NetOps API query helper for Hermes agents.
set -euo pipefail

REPO_ROOT="${NETOPS_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
API="${NETOPS_API_URL:-http://127.0.0.1:8080}"
EMAIL="${ADMIN_EMAIL:-admin@example.com}"
PASS="${ADMIN_PASSWORD:-admin123456}"

_get_token() {
  curl -sf -X POST "$API/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])'
}

_api_get() {
  local path="$1"
  local token
  token=$(_get_token)
  curl -sf -H "Authorization: Bearer $token" "$API$path" | python3 -m json.tool
}

_cmd="${1:-help}"
shift || true

case "$_cmd" in
  health)
    curl -sf "$API/api/health" | python3 -m json.tool
    ;;
  devices)
    _api_get "/api/devices"
    ;;
  device)
    id="${1:?device id required}"
    _api_get "/api/devices/$id"
    ;;
  devices-stats)
    _api_get "/api/devices/stats"
    ;;
  connectors)
    _api_get "/api/connectors"
    ;;
  connector-jobs)
    cid="${1:?connector id required}"
    _api_get "/api/connectors/$cid/jobs"
    ;;
  job)
    cid="${1:?connector id required}"
    jid="${2:?job id required}"
    _api_get "/api/connectors/$cid/jobs/$jid"
    ;;
  flags)
    envfile="$REPO_ROOT/.env"
    if [[ ! -f "$envfile" ]]; then
      echo ".env not found at $envfile" >&2
      exit 1
    fi
    grep -E '^(CONFIG_APPLY_ENABLED|NETOPS_SNMP_REAL_ENABLED|L2_DISCOVER_SSH_ENABLED|L2_OPERATIONAL_REFRESH_ENABLED|NETOPS_SNMP_BGP_REAL_ENABLED|BGP_DRILLDOWN_SSH_DETAIL_ENABLED|NETBOX_ENABLED)=' "$envfile" || true
    ;;
  docker-status)
    docker compose -f "$REPO_ROOT/docker-compose.yml" ps
    ;;
  help|*)
    cat <<'EOF'
Usage: netops-api-query.sh <command> [args]

Commands:
  health                          API health check
  devices                         List devices
  device <id>                     Device detail
  devices-stats                   Inventory statistics
  connectors                      List connectors
  connector-jobs <connector_id>   Recent connector jobs
  job <connector_id> <job_id>     Job detail
  flags                           Relevant feature flags from .env
  docker-status                   Docker compose service status

Environment:
  NETOPS_API_URL  (default: http://127.0.0.1:8080)
  ADMIN_EMAIL     ADMIN_PASSWORD
EOF
    ;;
esac
