#!/usr/bin/env bash
# Gera deploy/bastion/.env a partir do netops-cli em execução (runtime wireguard_provision.json).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
CLI_CONTAINER="${NETOPS_CLI_CONTAINER:-netops_cli_connector}"
ENV_FILE="$ROOT/.env"
EXAMPLE="$ROOT/.env.example"
URL_OVERRIDE="${NETOPS_SERVER_URL_OVERRIDE:-}"
TMP_JSON="$(mktemp)"

cleanup() { rm -f "$TMP_JSON"; }
trap cleanup EXIT

if ! docker inspect "$CLI_CONTAINER" >/dev/null 2>&1; then
  echo "Container $CLI_CONTAINER não encontrado. Ajuste NETOPS_CLI_CONTAINER ou suba o netops-cli." >&2
  exit 1
fi

if [[ ! -f "$EXAMPLE" ]]; then
  echo "Missing $EXAMPLE" >&2
  exit 1
fi

docker exec "$CLI_CONTAINER" cat /etc/netops-cli/runtime/wireguard_provision.json > "$TMP_JSON"

python3 - "$EXAMPLE" "$ENV_FILE" "$URL_OVERRIDE" "$TMP_JSON" <<'PY'
import json
import sys
from pathlib import Path

example_path, env_path, url_override, runtime_path = sys.argv[1:5]
runtime = json.loads(Path(runtime_path).read_text())
token = runtime.get("connector_token", "").strip()
name = runtime.get("connector_name", "").strip()
url = (url_override or runtime.get("netops_server_url", "")).strip().rstrip("/")
if not token or not name or not url:
    raise SystemExit("connector_name, netops_server_url ou connector_token vazio no runtime")

out = []
for line in Path(example_path).read_text().splitlines():
    if line.startswith("CONNECTOR_NAME="):
        out.append(f"CONNECTOR_NAME={name}")
    elif line.startswith("CONNECTOR_TOKEN="):
        out.append(f"CONNECTOR_TOKEN={token}")
    elif line.startswith("NETOPS_SERVER_URL="):
        out.append(f"NETOPS_SERVER_URL={url}")
    else:
        out.append(line)
Path(env_path).write_text("\n".join(out) + "\n")
Path(env_path).chmod(0o600)
print(f"Wrote {env_path} connector={name} url={url} token_chars={len(token)}")
PY

echo "Próximo: cd $ROOT && docker compose up -d --build"
