#!/usr/bin/env bash
# NetOps test runner for Hermes agents.
set -euo pipefail

REPO_ROOT="${NETOPS_REPO_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
cd "$REPO_ROOT"

_cmd="${1:-help}"
shift || true

_run_selftest() {
  local script="$1"
  script="${script%.mjs}"
  local path="tools/${script}.mjs"
  if [[ ! -f "$path" ]]; then
    echo "Selftest not found: $path" >&2
    exit 1
  fi
  echo "==> node $path"
  node "$path"
}

_run_domain() {
  local domain="$1"
  case "$domain" in
    l2)
      for s in l2-s6730-parser-selftest l2-circuit-huawei-vsi-selftest l2-dot1q-parser-selftest \
               l2-classification-selftest l2-findings-interface-match-selftest l2-collector-selftest; do
        _run_selftest "$s"
      done
      ;;
    bgp)
      for s in snmp-fast-operational-selftest snmp-fast-bgp-selftest bgp-peer-parser-selftest \
               bgp-peer-drilldown-snapshot-selftest; do
        _run_selftest "$s"
      done
      ;;
    connectors)
      for s in connectors-selftest connectors-config-bundle-parse-selftest connectors-phase4-selftest; do
        _run_selftest "$s"
      done
      ;;
    compliance)
      for s in compliance-selftest compliance-runtime-smoke; do
        _run_selftest "$s" 2>/dev/null || _run_selftest "$s"
      done
      ;;
    rbac)
      for s in rbac-selftest user-management-selftest; do
        _run_selftest "$s"
      done
      ;;
    all-offline)
      _run_domain l2
      _run_domain bgp
      _run_domain connectors
      _run_domain compliance
      _run_domain rbac
      ;;
    *)
      echo "Unknown domain: $domain (l2|bgp|connectors|compliance|rbac|all-offline)" >&2
      exit 1
      ;;
  esac
}

case "$_cmd" in
  ci)
    echo "==> pnpm typecheck + build"
    (cd workspace && pnpm run typecheck && pnpm run build)
    echo "==> docker compose config"
    docker compose config >/dev/null
    echo "CI parity OK"
    ;;
  selftest)
    _run_selftest "${1:?script name required}"
    ;;
  domain)
    _run_domain "${1:?domain required}"
    ;;
  connector)
    echo "==> python3 tools/connector-agent-selftest.py"
    python3 tools/connector-agent-selftest.py
    ;;
  list)
    ls -1 tools/*-selftest.mjs tools/*smoke*.mjs 2>/dev/null | xargs -n1 basename | sort
    ;;
  help|*)
    cat <<'EOF'
Usage: netops-test.sh <command> [args]

Commands:
  ci                    Typecheck + build + docker compose config
  selftest <script>     Run tools/<script>.mjs
  domain <name>         Run domain selftests (l2|bgp|connectors|compliance|rbac|all-offline)
  connector             Python connector-agent selftest
  list                  List available selftest/smoke scripts
EOF
    ;;
esac
