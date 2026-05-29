# PHASE H2.1F — SNMP Preflight Runtime Smoke

**Date:** 2026-05-26  
**Commit:** `abbd10b` — `fix(operational): add SNMP preflight before interface walks`  
**Pilot:** `device_id=1` — `4WNET-BVA-BRT-RX` @ `45.169.161.255`  
**Rules:** single device, SNMP real only for this test, no SSH, no discovery, no NetBox, no community in output/logs

---

## 1. Pre-check

| Check | Result |
|-------|--------|
| HEAD | `abbd10b` (H2.1E) |
| `GET /api/healthz` | **200** `{"status":"ok"}` |
| `NETOPS_SNMP_REAL_ENABLED` (container, before) | **false** |
| Device 1 exists | **yes** — `4WNET-BVA-BRT-RX`, `45.169.161.255`, huawei |
| SNMP credential | **CONFIGURED** (length **9**; value **not** printed) |

---

## 2. Execution (flag on)

```bash
NETOPS_SNMP_REAL_ENABLED=true docker compose up -d --build api
```

| Item | Value |
|------|-------|
| Container flag after restart | **true** |
| Health after rebuild | **200** ok |

### POST collect

```
POST /api/operational/interfaces/collect
{"device_id": 1}
```

| Metric | H2.1C (no preflight) | **H2.1F (preflight)** |
|--------|----------------------|------------------------|
| Client time | ~120s timeout / ~390s server | **~8.0s** (HTTP **202**) |
| IF-MIB walks in logs | **13×** `SNMP-WALK-ERROR` timeout | **0** |
| Job status | `partial` | **`failed`** |
| `interfaceCount` | 0 | **0** |

**Response (202):**

```json
{
  "deviceId": 1,
  "jobId": 2,
  "status": "failed",
  "executed": true,
  "interfaceCount": 0,
  "errorCode": "SNMP_PREFLIGHT_TIMEOUT",
  "errorSummary": "SNMP preflight timeout. Verifique UDP/161, ACL SNMP, community e source IP.",
  "ifMibSkipped": true,
  "errors": ["SNMP preflight timeout. Verifique UDP/161, ACL SNMP, community e source IP."],
  "warnings": [],
  "freshness": "fresh"
}
```

### Logs (collect window)

```
[snmp-fast] SNMP preflight failed deviceId=1 ip=45.169.161.255 code=SNMP_PREFLIGHT_TIMEOUT reason=timeout elapsedMs=8001
```

| Log check | Result |
|-----------|--------|
| Preflight line present | **yes** |
| `SNMP-WALK` / IF-MIB OIDs | **none** |
| `community` / `password` | **none** |

### DB job

| Field | Value |
|-------|-------|
| `id` | 2 |
| `status` | **failed** |
| `error_summary` | NOC-friendly timeout text (no secret) |
| `operational_interfaces` rows | **0** |

Compare job 1 (H2.1C): `partial`, ~6m30s, 13 walk timeouts.

---

## 3. GET after collect

```
GET /api/operational/interfaces?device_id=1 → 200
```

| Field | Value |
|-------|-------|
| `collectionJobId` | 2 |
| `interfaceCount` | **0** |
| `interfaces` | `[]` |
| `freshness` | **fresh** (job `completed_at` recent) |
| `source` | `null` (no interface rows) |

Expected while SNMP path still broken.

---

## 4. Rollback

```bash
NETOPS_SNMP_REAL_ENABLED=false docker compose up -d --build api
```

| Check | Result |
|-------|--------|
| Container flag | **false** |
| `GET /api/healthz` | **200** ok |
| `POST .../collect` | **503** `SNMP_FAST_DISABLED` |

**Note:** repo `.env` may still list `NETOPS_SNMP_REAL_ENABLED=true`; runtime container after rollback is **false** (compose env override used for smoke). Operator should align `.env` if needed.

---

## 5. GO criteria

| Criterion | Met |
|-----------|-----|
| Fast fail (~3–10s, not minutes) | **yes** (~8s) |
| No 13 IF-MIB walks | **yes** |
| Clear NOC error + `errorCode` | **yes** `SNMP_PREFLIGHT_TIMEOUT` |
| Logs without secret | **yes** |
| Zero SSH / discovery | **yes** |
| Rollback OK | **yes** |

**Overall H2.1F runtime smoke: GO**

**Pilot SNMP data path:** still **NO-GO** (same unreachable UDP/161 as H2.1D). Preflight correctly surfaces failure early.

---

## 6. Next step (ops)

1. Fix SNMP reachability from `netops-api` to `45.169.161.255:161` (ACL, firewall, community, source IP).
2. Re-run `tools/snmp-pilot-connectivity-diag.mjs` until `sysDescr.0` OK.
3. One `POST /collect` with flag on; expect preflight OK → IF-MIB walks → `interfaceCount > 0` when network fixed.
