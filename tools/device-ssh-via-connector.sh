#!/usr/bin/env bash
# Run read-only Huawei display command on NetOps device via connector jobs API.
set -euo pipefail
DEVICE_ID="${1:?device id}"
CMD="${2:?command}"
API="${NETOPS_API_URL:-http://127.0.0.1:8080}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123456}"

TOKEN=$(curl -sf -X POST "$API/api/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

read -r IP PORT USER ENC < <(docker exec netops-db psql -U netops -d netops -t -A -F' ' -c \
  "SELECT ip_address, ssh_port, username, password_encrypted FROM devices WHERE id=$DEVICE_ID")

SESSION_SECRET=$(grep '^SESSION_SECRET=' .env | cut -d= -f2)
docker cp tools/_decrypt_pw.mjs netops-api:/tmp/decrypt_pw.mjs >/dev/null
docker exec -e ENC="$ENC" -e SESSION_SECRET="$SESSION_SECRET" netops-api node --experimental-strip-types /tmp/decrypt_pw.mjs >/dev/null
PW=$(docker exec netops-api cat /tmp/netops_pw)
docker exec netops-api rm -f /tmp/netops_pw

PAYLOAD=$(python3 - <<PY
import json
print(json.dumps({
  "job_type": "SSH_COMMAND",
  "target_ip": "$IP",
  "target_port": int("$PORT"),
  "payload_json": {
    "command": """$CMD""",
    "username": """$USER""",
    "password": """$PW""",
    "port": int("$PORT"),
    "vendor": "huawei"
  },
  "timeout_seconds": 120
}))
PY
)

JOB=$(curl -sf -X POST "$API/api/connectors/1/jobs" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "$PAYLOAD")
JOB_ID=$(echo "$JOB" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

for i in $(seq 1 60); do
  DETAIL=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/api/connectors/1/jobs/$JOB_ID")
  STATUS=$(echo "$DETAIL" | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d.get("status","PENDING"))')
  if [[ "$STATUS" == "SUCCESS" || "$STATUS" == "FAILED" || "$STATUS" == "TIMEOUT" ]]; then
    echo "$DETAIL" | python3 - <<'PY'
import sys, json
d = json.load(sys.stdin)
r = d.get("result") or {}
print(r.get("stdout") or "")
err = r.get("stderr") or ""
if err.strip():
  import sys as s
  print(err, file=s.stderr)
PY
    exit 0
  fi
  sleep 2
done
echo "Job timeout waiting result" >&2
exit 1
