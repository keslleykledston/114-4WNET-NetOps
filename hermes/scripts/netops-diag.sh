#!/usr/bin/env bash
# NetOps network diagnostics — ping, traceroute, tcp (connector, device SSH, or local).
set -euo pipefail

REPO_ROOT="${NETOPS_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
API="${NETOPS_API_URL:-http://127.0.0.1:8080}"
EMAIL="${ADMIN_EMAIL:-admin@example.com}"
PASS="${ADMIN_PASSWORD:-admin123456}"
CONNECTOR_ID="${NETOPS_CONNECTOR_ID:-1}"
PARSE_PY="$REPO_ROOT/hermes/scripts/_parse_ping.py"
CURL="curl --max-time 15 -sf"

_get_token() {
  $CURL -X POST "$API/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])'
}

_poll_job() {
  local token="$1" cid="$2" jid="$3"
  for _ in $(seq 1 60); do
    local detail status
    detail=$($CURL -H "Authorization: Bearer $token" "$API/api/connectors/$cid/jobs/$jid")
    status=$(echo "$detail" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("status","PENDING"))')
    if [[ "$status" == "SUCCESS" || "$status" == "FAILED" || "$status" == "TIMEOUT" ]]; then
      echo "$detail"
      return 0
    fi
    sleep 2
  done
  echo '{"status":"TIMEOUT","error":"poll timeout"}' >&2
  return 1
}

_connector_ping() {
  local target="$1" count="${2:-4}" cid="${3:-$CONNECTOR_ID}"
  local token payload job_id detail stdout
  token=$(_get_token)
  payload=$(python3 -c "import json; print(json.dumps({'target_ip':'$target','count':$count}))")
  job_id=$($CURL -X POST "$API/api/connectors/$cid/diagnostics/ping" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d "$payload" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
  detail=$(_poll_job "$token" "$cid" "$job_id")
  stdout=$(echo "$detail" | python3 -c '
import sys, json
d = json.load(sys.stdin)
r = d.get("result") or {}
print(r.get("stdout") or r.get("message") or json.dumps(d))
')
  echo "$stdout"
}

_local_ping() {
  local target="$1" count="${2:-4}"
  ping -c "$count" -W 3 "$target" 2>&1 || true
}

_device_ping() {
  local device="$1" target="$2" count="${3:-4}"
  "$REPO_ROOT/hermes/scripts/netops-ssh.sh" "$device" "ping -c $count $target"
}

_format_ping() {
  local target="$1"
  python3 "$PARSE_PY" - "$target"
}

cmd_ping() {
  local target="" count=4 source="connector" device=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --count|-c) count="$2"; shift 2 ;;
      --connector) CONNECTOR_ID="$2"; shift 2 ;;
      --device|-d) source="device"; device="$2"; shift 2 ;;
      --local|-l) source="local"; shift ;;
      --connector-only) source="connector"; shift ;;
      -*) echo "Opção desconhecida: $1" >&2; exit 2 ;;
      *) target="$1"; shift ;;
    esac
  done
  [[ -n "$target" ]] || { echo "usage: netops-diag.sh ping <host> [--device ID] [--local] [--count N]" >&2; exit 1; }

  local raw
  case "$source" in
    device)
      [[ -n "$device" ]] || { echo "--device obrigatório para ping a partir de equipamento" >&2; exit 1; }
      raw=$(_device_ping "$device" "$target" "$count")
      ;;
    local)
      raw=$(_local_ping "$target" "$count")
      ;;
    connector)
      if [[ "${NETOPS_DIAG_PREFER:-}" == "local" ]]; then
        raw=$(_local_ping "$target" "$count")
      elif raw=$(_connector_ping "$target" "$count" 2>/dev/null) && [[ -n "$raw" ]]; then
        :
      else
        echo "⚠️ connector indisponível — fallback ping local" >&2
        raw=$(_local_ping "$target" "$count")
      fi
      ;;
  esac
  echo "$raw" | _format_ping "$target"
}

cmd_traceroute() {
  local target="${1:?host required}" cid="${2:-$CONNECTOR_ID}"
  local token payload job_id detail
  token=$(_get_token)
  payload=$(python3 -c "import json; print(json.dumps({'target_ip':'$target'}))")
  job_id=$($CURL -X POST "$API/api/connectors/$cid/diagnostics/traceroute" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d "$payload" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
  detail=$(_poll_job "$token" "$cid" "$job_id")
  echo "$detail" | python3 -c '
import sys, json
d = json.load(sys.stdin)
r = d.get("result") or {}
print(r.get("stdout") or r.get("stderr") or json.dumps(d, indent=2))
'
}

cmd_tcp() {
  local target="${1:?host required}" port="${2:-443}" cid="${3:-$CONNECTOR_ID}"
  local token payload job_id detail
  token=$(_get_token)
  payload=$(python3 -c "import json; print(json.dumps({'target_ip':'$target','port':$port}))")
  job_id=$($CURL -X POST "$API/api/connectors/$cid/diagnostics/tcp-check" \
    -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d "$payload" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
  detail=$(_poll_job "$token" "$cid" "$job_id")
  echo "$detail" | python3 -c '
import sys, json
d = json.load(sys.stdin)
r = d.get("result") or {}
print(r.get("stdout") or json.dumps(d, indent=2))
'
}

# Roteamento por intenção (português/inglês) — usado pelo orquestrador/Telegram
cmd_intent() {
  local text="${*:-""}"
  text=$(echo "$text" | tr '[:upper:]' '[:lower:]')

  local target=""
  target=$(echo "$text" | grep -oE '[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.(com|com\.br|net|org|io|local)(\.[a-z]{2})?' | head -1 || true)
  if [[ -z "$target" ]]; then
    target=$(echo "$text" | grep -oE '([0-9]{1,3}\.){3}[0-9]{1,3}' | head -1 || true)
  fi
  if [[ -z "$target" ]]; then
    target=$(echo "$text" | grep -oE '\b[a-z0-9][a-z0-9.-]+\.[a-z]{2,}\b' | head -1 || true)
  fi

  local device=""
  device=$(echo "$text" | grep -oE 'device[s]?\s+([0-9]+|[a-z0-9_-]+)' | awk '{print $2}' || true)

  if echo "$text" | grep -qE 'ping|latencia|latência|jitter'; then
    [[ -n "$target" ]] || { echo "Não identifiquei o destino do ping na frase." >&2; exit 1; }
    if [[ -n "$device" ]]; then
      cmd_ping --device "$device" "$target"
    else
      cmd_ping "$target"
    fi
    return
  fi

  if echo "$text" | grep -qE 'traceroute|tracer|tracert|rota'; then
    [[ -n "$target" ]] || { echo "Não identifiquei o destino do traceroute." >&2; exit 1; }
    cmd_traceroute "$target"
    return
  fi

  if echo "$text" | grep -qE 'tcp|porta|port '; then
    [[ -n "$target" ]] || { echo "Não identifiquei o host do tcp-check." >&2; exit 1; }
    local port=443
    port=$(echo "$text" | grep -oE 'porta\s+[0-9]+|port\s+[0-9]+' | awk '{print $2}' | head -1 || echo 443)
    cmd_tcp "$target" "$port"
    return
  fi

  echo "Intenção não reconhecida. Use ping/traceroute/tcp ou frase como: 'teste o ping pra www.google.com.br'" >&2
  exit 1
}

_cmd="${1:-help}"
shift || true

case "$_cmd" in
  ping) cmd_ping "$@" ;;
  traceroute|tracert) cmd_traceroute "$@" ;;
  tcp) cmd_tcp "$@" ;;
  intent|ask) cmd_intent "$@" ;;
  help|*)
    cat <<'EOF'
Usage: netops-diag.sh <command> [args]

Commands:
  ping <host> [--count N] [--device ID] [--local]
  traceroute <host> [connector_id]
  tcp <host> [port] [connector_id]
  intent "<frase em português>"   — extrai ação e executa

Examples:
  netops-diag.sh ping www.google.com.br
  netops-diag.sh ping 8.8.8.8 --count 10
  netops-diag.sh ping www.google.com.br --device 3
  netops-diag.sh intent "teste o ping pra www.google.com.br"
  netops-diag.sh intent "ping do device 1 para 8.8.8.8"
EOF
    ;;
esac
