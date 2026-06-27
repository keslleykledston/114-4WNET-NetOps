#!/usr/bin/env bash
# Launch Kanban Swarm for NetOps multi-agent investigation.
set -euo pipefail

REPO_ROOT="${NETOPS_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
HERMES_BIN="${HERMES_BIN:-$HOME/.hermes/hermes-agent/venv/bin/hermes}"
PROFILE="${NETOPS_HERMES_PROFILE:-netops}"
GOAL="${1:?usage: swarm-netops.sh \"<goal description>\"}"

if [[ ! -x "$HERMES_BIN" ]]; then
  echo "Hermes not found at $HERMES_BIN — set HERMES_BIN or install Hermes Agent" >&2
  exit 1
fi

exec "$HERMES_BIN" kanban swarm "$GOAL" \
  --worker "${PROFILE}:Diagnostics Operator:netops-diag" \
  --worker "${PROFILE}:SSH Operator:netops-ssh" \
  --worker "${PROFILE}:Query Analyst:netops-queries" \
  --worker "${PROFILE}:Test Runner:netops-tests" \
  --verifier "$PROFILE" \
  --synthesizer "$PROFILE" \
  --created-by "$PROFILE" \
  --json
