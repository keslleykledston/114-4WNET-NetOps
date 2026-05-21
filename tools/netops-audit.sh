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

echo
echo "== FASE 5: collectNetopsReadOnly wiring =="
echo "Service imports SNMP adapter (not SSH):"
rg 'import.*snmpReadonlyAdapter' "$ROOT/workspace/artifacts/api-server/src/modules/netops/service.ts"

echo
echo "Endpoint called by POST /collect/read-only:"
rg -A3 'router.post.*collect/read-only' "$ROOT/workspace/artifacts/api-server/src/modules/netops/routes.ts"

echo
echo "DB schema has collector metadata:"
echo "  (run: docker exec netops-db psql -U netops -d netops -c '\\\\d snmp_snapshots' | grep collector)"

echo
echo "=== SSH adapter status ==="
echo "SSH adapter defined but NOT imported in routes or service:"
find "$ROOT/workspace/artifacts/api-server/src/modules/netops" -name "*ssh*adapter*" | wc -l
echo "references to sshReadonlyAdapter in routes/service:"
{ rg 'sshReadonlyAdapter' "$ROOT/workspace/artifacts/api-server/src/modules/netops" || echo "0 (correct)"; } | wc -l
