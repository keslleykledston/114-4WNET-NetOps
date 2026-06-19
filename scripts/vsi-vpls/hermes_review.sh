#!/usr/bin/env bash
set -euo pipefail

PROMPT="${1:-}"
if [[ -z "${PROMPT}" ]]; then
  echo "usage: $0 \"short prompt\"" >&2
  exit 1
fi

payload=$(python3 - "${PROMPT}" <<'PY'
import json
import sys

prompt = sys.argv[1]
body = {
    "model": "Hermes-3-Llama-3.1-8B-Q6_K.gguf",
    "messages": [
        {"role": "system", "content": "Você é um revisor técnico local. Responda curto, com foco em evidências e testes."},
        {"role": "user", "content": prompt},
    ],
    "temperature": 0.2,
}
print(json.dumps(body, ensure_ascii=False))
PY
)

curl -s http://127.0.0.1:18088/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d "${payload}"
