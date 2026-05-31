---
name: l2-circuits-ops
description: >-
  Operates on L2 Circuits module: Huawei VRP/S6730 parsers, operational refresh,
  VSI multipoint status, findings, and NOC UI. Use for L2 discovery, refresh,
  RN-141, VSI_DOWN, PW_PARTIAL_DOWN, stale inventory, or /l2-circuits page work.
---

# L2 Circuits Operations

**Route:** `.cursor/README.md` → agent `agents/l2-circuits.md` → workflow `workflows/l2-change.md`

## Scope

- Backend: `workspace/artifacts/api-server/src/modules/l2circuits/`
- Frontend: `workspace/artifacts/netops-manager/src/features/l2-circuits/`
- Docs: `docs/l2-circuits/`, `docs/ai/FLOWS.md` (§2–3)
- Agent: `.cursor/agents/l2-circuits.md` (bounded file list)

## Flags (must check before runtime)

| Flag | Effect |
|------|--------|
| `L2_DISCOVER_SSH_ENABLED` | Discovery inserts |
| `L2_OPERATIONAL_REFRESH_ENABLED` | POST /refresh |
| `L2_OPERATIONAL_REFRESH_SSH_CONFIG` | Include config on refresh |
| `NETOPS_SNMP_REAL_ENABLED` | SNMP leg on refresh |
| `SNMP_FAST_PILOT_DEVICE_IDS` | CSV allowlist |

## Key files

| File | Role |
|------|------|
| `parsers/huawei-vrp-l2.ts` | Parser entry |
| `parsers/s6730-l2.parser.ts` | S6730 L2VC/VSI |
| `parsers/vsi-multipoint.helpers.ts` | VSI PARTIAL logic |
| `normalizers/findings.resolver.ts` | Finding codes |
| `operational-refresh/l2-operational-refresh.service.ts` | Refresh pipeline |
| `l2-circuits.service.ts` | List/get, rehydrate |

## VSI multipoint rules

- Multiple peers per VSI block — do not overwrite with last peer
- `PARTIAL` when VSI up + mixed PW/session states
- Finding `PW_PARTIAL_DOWN` (warning), not `VSI_DOWN` for partial
- Persist peers in `evidenceFlags.vsiPeers`

## Operational refresh limits

- Updates existing rows only; marks `OPERATIONAL_STALE` when unseen
- Does not prune DB — discovery required for full inventory sync

## Validation

```bash
node tools/l2-circuit-huawei-vsi-selftest.mjs
node tools/l2-s6730-parser-selftest.mjs
node tools/l2-stale-fix-validate.mjs
cd workspace && pnpm run typecheck
```

## Safety

- No config write on devices
- No discovery/refresh with flags OFF unless testing 503 path
- Rebuild `api`/`web` containers after runtime changes
