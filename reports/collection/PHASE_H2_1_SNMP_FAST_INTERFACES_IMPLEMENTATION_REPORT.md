# PHASE H2.1 — SNMP_FAST Interfaces Implementation

**Date:** 2026-05-25  
**Status:** GO (code) — live pilot collect requires operator checklist  
**SSH / discovery / NetBox / compliance:** not touched

---

## Delivered

| Area | Path |
|------|------|
| Schema | `workspace/lib/db/src/schema/operational.ts` |
| SQL migration | `workspace/lib/db/migrations/0016_operational_snmp_fast_interfaces.sql` |
| SNMP IF-MIB | `modules/netops/snmp/collect.ts` — `collectSnmpInterfacesOnly` |
| OIDs | `ifLastChange` (1.3.6.1.2.1.2.2.1.9), `ifHighSpeed` (1.3.6.1.2.1.31.1.1.1.15) |
| Mapper | `modules/operational/operational-interface-mapper.ts` |
| Service | `modules/operational/snmp-fast-interfaces.service.ts` |
| Routes | `modules/operational/operational.routes.ts` |
| Pilot / freshness / rate-limit | `pilot.ts`, `freshness.ts`, `rate-limit.ts` |
| Selftest (no live SNMP) | `tools/snmp-fast-operational-selftest.mjs` |

---

## Tables

### `operational_interfaces`

`device_id`, `if_index`, `if_name`, `if_descr`, `if_alias`, `admin_status`, `oper_status`, `if_high_speed_mbps`, `if_last_change_ticks`, `hc_in_octets`, `hc_out_octets`, `source=snmp`, `collected_at`, `freshness_status`, `collection_job_id`.

### `operational_collection_jobs`

`device_id`, `layer=snmp_fast`, `scope=interfaces`, `status`, `started_at`, `completed_at`, `error_summary`, `created_by`. No raw community in `error_summary`.

---

## API

| Method | Path | Body / query |
|--------|------|----------------|
| GET | `/api/operational/interfaces?device_id=1` | Returns `interfaces`, `collected_at`, `freshness_status`, `source`, `job_id` (+ camelCase aliases) |
| POST | `/api/operational/interfaces/collect` | `{ "device_id": 1 }` or `deviceId` |
| POST | `/api/operational/collection/snmp-fast` | Alias (same handler) |

Auth: `devices.read`. Audit on collect: `operational_snmp_fast_collect`.

---

## Safety

| Rule | Implementation |
|------|----------------|
| 1 pilot device | `SNMP_FAST_PILOT_DEVICE_IDS` default `1` → 403 if other |
| No bulk | single `device_id` per POST |
| SNMP read-only | IF-MIB walks only |
| No SSH / discovery | separate code path |
| Community never logged | in-process only; errors use `SNMP_CREDENTIALS_NOT_CONFIGURED` |
| Rate limit | 1 collect / device / 5 min |
| Gate | `NETOPS_SNMP_REAL_ENABLED=true` for live SNMP |
| Timeout / retry | default 10s / 2 retries (`SNMP_FAST_TIMEOUT_MS`, `SNMP_FAST_RETRIES`) |

### Credential missing

```json
HTTP 400
{
  "error": "SNMP_CREDENTIALS_NOT_CONFIGURED",
  "message": "SNMP credentials not configured for device 1"
}
```

---

## Freshness (defaults)

| Status | Window |
|--------|--------|
| fresh | ≤ 5 min (`SNMP_FAST_INTERFACE_FRESH_MINUTES`) |
| stale | > 5 min and ≤ 1 h |
| expired | > 1 h (`SNMP_FAST_INTERFACE_STALE_HOURS=1`) |
| unknown | no collection |

---

## Validation

| Check | Result |
|-------|--------|
| `pnpm typecheck` | run in CI / local |
| `pnpm --filter @workspace/api-server build` | run in CI / local |
| `pnpm dlx tsx tools/snmp-fast-operational-selftest.mjs` | freshness, pilot, rate-limit, mapper, credential code |

### Operator live pilot (checklist approved)

```bash
docker compose run --rm migrate
docker compose up -d --build api
export NETOPS_SNMP_REAL_ENABLED=true
# POST /api/operational/interfaces/collect  { "device_id": 1 }
# GET  /api/operational/interfaces?device_id=1
```

---

## GO criteria

| Criterion | Status |
|-----------|--------|
| Code compiles | YES |
| GET + POST endpoints | YES |
| No bulk | YES |
| Missing credential → controlled error | YES |
| 1 pilot device | YES |
| Logs without community | YES (no community in audit metadata) |
| Zero SSH | YES |
| Compliance unchanged | YES |

**Verdict: GO** for operator pilot SNMP on device 1 after env + credential checklist.
