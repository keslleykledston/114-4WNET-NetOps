# FASE 5 — SNMP read-only collection report

## Delivered

- Real SNMP GET/WALK behind `NETOPS_SNMP_REAL_ENABLED` (default `false`).
- `POST /api/netops/devices/:id/collect/read-only` uses SNMP adapter only (no SSH).
- Persistence to `snmp_snapshots` on executed collect; prior rows kept on failure.
- `snapshot-adapter` maps persisted JSON with `source: snmp` for GET interfaces / bgp-peers.
- Frontend button **Coletar via SNMP** with query invalidation (summary, interfaces, bgp-peers, logs).
- Docs: `docs/netops/SNMP_READONLY_COLLECTION.md`, updates to `FUTURE_PHASE_TODOS.md` and `BGP_OPERATIONAL_ABSTRACTIONS.md`.

## Files touched

| Area | Path |
|------|------|
| SNMP module | `workspace/artifacts/api-server/src/modules/netops/snmp/oids.ts` |
| | `workspace/artifacts/api-server/src/modules/netops/snmp/snmp-session.ts` |
| | `workspace/artifacts/api-server/src/modules/netops/snmp/collect.ts` |
| | `workspace/artifacts/api-server/src/modules/netops/snmp/types.ts` |
| Adapter | `workspace/artifacts/api-server/src/modules/netops/adapters/snmp-readonly-adapter.ts` |
| Service | `workspace/artifacts/api-server/src/modules/netops/service.ts` |
| Snapshot | `workspace/artifacts/api-server/src/modules/netops/adapters/snapshot-adapter.ts` |
| UI | `workspace/artifacts/netops-manager/src/features/device-inventory/collect-snmp-button.tsx` |
| | `operational-summary.tsx`, `interfaces-panel.tsx`, `bgp-panel.tsx` |
| Ops | `docker-compose.yml` (`NETOPS_SNMP_REAL_ENABLED`) |

## Smoke (flag false)

- `POST collect/read-only` → `executed: false`, clear PT message about flag.
- `GET interfaces`, `GET bgp-peers` → still serve last snapshot (unchanged data).
- Role override `PUT` → unchanged precedence after collect stub.

## IPv6

No BGP4-MIB IPv6 walk in reference `60-bgp_manager`; not implemented here. Documented in `SNMP_READONLY_COLLECTION.md`.

## Validation commands

```bash
cd workspace && pnpm run typecheck
BASE_PATH=/ PORT=5000 pnpm run build
bash tools/netops-audit.sh
bash tools/apply-containers.sh api web
```
