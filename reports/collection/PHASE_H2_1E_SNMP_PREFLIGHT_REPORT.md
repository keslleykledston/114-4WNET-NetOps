# PHASE H2.1E — SNMP sysDescr Preflight (Fast Fail Before IF-MIB)

**Date:** 2026-05-26  
**Context:** H2.1C — 13 IF-MIB walks × ~10s timeout ≈ **6m30s** `partial`, 0 interfaces when SNMP dead  
**Goal:** GET `sysDescr.0` first; abort before IF-MIB if preflight fails  
**Rules:** no real SNMP during dev, no SSH, no device/NetBox changes, no community in logs

---

## 1. Implementation

| Item | Detail |
|------|--------|
| Preflight OID | `1.3.6.1.2.1.1.1.0` (`SNMP_OIDS.sysDescr`) |
| Timeout | **4s** default (`SNMP_FAST_PREFLIGHT_TIMEOUT_MS`, clamp **3–5s**) |
| Retries | **1** default (`SNMP_FAST_PREFLIGHT_RETRIES`, clamp **0–1**) |
| On fail | skip all IF-MIB walks; `interface_count=0`; job **`failed`** |
| `error_code` | `SNMP_PREFLIGHT_TIMEOUT` \| `SNMP_PREFLIGHT_AUTH` \| `SNMP_PREFLIGHT_ERROR` |
| NOC message (timeout) | `SNMP preflight timeout. Verifique UDP/161, ACL SNMP, community e source IP.` |
| Log line | `deviceId`, `ip`, `code`, `reason`, `elapsedMs` — **no community** |

### Files

| Path | Role |
|------|------|
| `workspace/artifacts/api-server/src/modules/netops/snmp/oids.ts` | `sysDescr` OID |
| `workspace/artifacts/api-server/src/modules/netops/snmp/snmp-session.ts` | `snmpGet` + session `get` |
| `workspace/artifacts/api-server/src/modules/netops/snmp/snmp-preflight.ts` | preflight options, classify, `runSnmpPreflight*` |
| `workspace/artifacts/api-server/src/modules/netops/snmp/collect.ts` | preflight gate + test hooks |
| `workspace/artifacts/api-server/src/modules/operational/snmp-fast-interfaces.service.ts` | `failed` job, `errorCode` in API |
| `tools/snmp-fast-preflight-selftest.mjs` | mock selftest A–D |

### Flow

```
POST collect → preflight session (short timeout) → GET sysDescr.0
  ├─ FAIL → failed job, 0 ifaces, no IF-MIB (~3–5s)
  └─ OK   → full session → 13 IF-MIB walks (unchanged)
```

---

## 2. Selftest (mock only)

Tool: `tools/snmp-fast-preflight-selftest.mjs`

| Case | Expect | Result |
|------|--------|--------|
| A | preflight timeout → IF-MIB **not** called | **PASS** |
| B | preflight auth → IF-MIB **not** called | **PASS** |
| C | preflight OK → IF-MIB called | **PASS** |
| D | logs contain **no** community string | **PASS** |

---

## 3. Validation commands

```bash
cd workspace && pnpm typecheck
cd workspace && pnpm --filter @workspace/api-server run build
cd .. && pnpm dlx tsx tools/snmp-fast-preflight-selftest.mjs
pnpm dlx tsx tools/snmp-fast-operational-selftest.mjs
```

| Step | Result |
|------|--------|
| `pnpm typecheck` | **PASS** |
| `pnpm --filter @workspace/api-server run build` | **PASS** |
| `snmp-fast-preflight-selftest.mjs` | **PASS** |
| `snmp-fast-operational-selftest.mjs` | **PASS** |

**Not run:** real SNMP POST, SSH, device changes.

---

## 4. API response (preflight fail)

`POST /api/operational/interfaces/collect` (202) adds:

- `errorCode`: e.g. `SNMP_PREFLIGHT_TIMEOUT`
- `errorSummary`: friendly NOC text
- `ifMibSkipped`: `true`
- `status`: `failed`
- `interfaceCount`: `0`

DB `operational_collection_jobs.error_summary`: `{errorCode}: {errorSummary}`

---

## 5. GO criteria

| Criterion | Status |
|-----------|--------|
| Dead SNMP does not burn ~6m on 13 walks | **GO** (design: fail in ~3–5s) |
| IF-MIB skipped when sysDescr fails | **GO** (selftest A/B) |
| Clear NOC error + code | **GO** |
| Logs without secret | **GO** (selftest D) |
| Zero SSH / no real SNMP in phase | **GO** |

**Overall H2.1E implementation:** **GO**

**Pilot data path:** still **NO-GO** until NOC fixes UDP/161 path (same as H2.1D). After fix: rerun `snmp-pilot-connectivity-diag.mjs` → one POST collect with long client timeout.

---

## 6. Env knobs (optional)

| Variable | Default | Notes |
|----------|---------|-------|
| `SNMP_FAST_PREFLIGHT_TIMEOUT_MS` | `4000` | clamped 3000–5000 |
| `SNMP_FAST_PREFLIGHT_RETRIES` | `1` | 0 or 1 only |
