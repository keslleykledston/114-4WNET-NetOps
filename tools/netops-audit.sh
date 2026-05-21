#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== 114 frontend layout =="
printf '%s\n' \
  "workspace/artifacts/netops-manager/src/App.tsx" \
  "workspace/artifacts/netops-manager/src/components/layout.tsx" \
  "workspace/artifacts/netops-manager/src/components/theme-provider.tsx" \
  "workspace/artifacts/netops-manager/src/index.css"

echo
echo "== 114 routes =="
rg -n '<Route path=' "$ROOT/workspace/artifacts/netops-manager/src/App.tsx"

echo
echo "== 60 reference files =="
rg --files "$ROOT/../60-bgp_manager" \
  | rg 'DeviceTree|BGP|Interfaces|Filtros|Communities|snmp|huawei|bgp_peer|community' \
  | sort
