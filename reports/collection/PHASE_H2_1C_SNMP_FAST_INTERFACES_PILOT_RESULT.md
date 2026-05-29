# PHASE H2.1C — SNMP_FAST Interfaces Pilot Result

**Date:** 2026-05-26  
**Pilot device:** `device_id=1` — `4WNET-BVA-BRT-RX` (`45.169.161.255`)  
**Commit:** `ae897b4`  
**Checklist:** `docs/collection/SAFE_COLLECTION_CHECKLIST.md` (assumed approved by NOC for this run)

---

## Executive summary

| Verdict | Result |
|---------|--------|
| **Operational path** | **PASS** — POST/GET, job persistence, freshness, no secrets in logs, no SSH |
| **Pilot data** | **NO-GO** — `interface_count=0`; all IF-MIB SNMP walks timed out from API container |

SNMP real was attempted on **one** device only. Failure mode is **network/SNMP reachability or ACL**, not API crash or credential leak.

---

## 1. Preconditions

| Check | Status |
|-------|--------|
| H2.1B GO | yes |
| Migration operational | yes (`operational_*` tables present) |
| API health | `GET /api/healthz` → 200 |
| SNMP credential (device 1) | **CONFIGURED** (length 9; value **not** logged) |
| `NETOPS_SNMP_REAL_ENABLED` | `true` on `netops-api` for this run |

---

## 2. Execution

### Health

```
GET http://127.0.0.1:8085/api/healthz → 200 {"status":"ok"}
```

### Collect (single device)

```
POST /api/operational/interfaces/collect
Content-Type: application/json
Cookie: <session>

{"device_id": 1}
```

| Observation | Detail |
|---------------|--------|
| HTTP client | **Timeout 120s** (no response body to client) |
| Server | Request continued; completed ~**6m 30s** after start |
| Log | `request aborted` at 120004 ms (client disconnect) |

### Job record (DB)

| Field | Value |
|-------|-------|
| `id` | 1 |
| `device_id` | 1 |
| `status` | **partial** |
| `started_at` | 2026-05-26 04:43:31 UTC |
| `completed_at` | 2026-05-26 04:50:01 UTC |
| `error_summary` | null |
| `operational_interfaces` rows | **0** |

### GET after collect

```
GET /api/operational/interfaces?device_id=1 → 200
```

```json
{
  "deviceId": 1,
  "collectionJobId": 1,
  "job_id": 1,
  "collectedAt": "2026-05-26T04:50:01.856Z",
  "collected_at": "2026-05-26T04:50:01.856Z",
  "freshness": "fresh",
  "freshness_status": "fresh",
  "source": null,
  "interfaceCount": 0,
  "interfaces": []
}
```

Freshness is derived from job `completed_at` (recent), not from interface rows.

---

## 3. SNMP / network evidence

From `netops-api` logs during collect (no community in messages):

- **13×** `[SNMP-WALK-ERROR] … Request timed out` on IF-MIB OIDs, including:
  - `1.3.6.1.2.1.2.2.1.2` (ifDescr)
  - `1.3.6.1.2.1.31.1.1.1.1` (ifName)
  - `1.3.6.1.2.1.31.1.1.1.6` / `.10` (HC octets)
  - admin/oper status OIDs
- Background poller (separate from H2.1 POST): `deviceId=1 … success=false interfaces=0`

**Interpretation:** API container likely cannot complete SNMP v2c walks to `45.169.161.255:161` (firewall, routing, SNMP ACL, or wrong community for path). Not a compliance or SSH issue.

**Config used:** `SNMP_FAST_TIMEOUT_MS` default **10000**, retries **2** (short timeout × many sequential walks ≈ long total runtime).

---

## 4. Field validation

| Field (spec) | API field | Present in response |
|--------------|-----------|---------------------|
| ifIndex | `ifIndex` | N/A (0 interfaces) |
| ifName | `ifName` | N/A |
| ifDescr | `ifDescr` | N/A |
| ifAlias | `ifAlias` | N/A |
| admin_status | `adminStatus` | N/A |
| oper_status | `operStatus` | N/A |
| high_speed | `ifHighSpeedMbps` | N/A |
| last_change | `ifLastChangeTicks` | N/A |
| hc_in/out | `hcInOctets` / `hcOutOctets` | N/A |
| source | `source` | null (no rows) |
| freshness | `freshness_status` | **yes** (`fresh`) |
| collected_at | `collected_at` | **yes** |

Schema and mapper are ready; pilot blocked on SNMP data plane.

---

## 5. Safety

| Rule | Result |
|------|--------|
| 1 device only | yes (`device_id=1`) |
| No bulk | yes |
| No SSH / discovery SSH | yes (no SSH in operational collect path) |
| No device config change | yes |
| No NetBox | yes |
| Community not in logs | **verified** (grep) |
| No password in logs | **verified** |
| Compliance unchanged | yes |
| API crash | no |

---

## 6. GO checklist (H2.1C)

| Criterion | Met |
|-----------|-----|
| Coleta em 1 device | **yes** (job completed `partial`) |
| `interface_count > 0` | **no** |
| Endpoint retorna dados | **yes** (empty list + job metadata) |
| Freshness calculado | **yes** |
| Logs sem segredo | **yes** |
| Zero SSH | **yes** |
| Compliance não alterado | **yes** |

**Overall H2.1C pilot data: NO-GO**  
**Overall H2.1C runtime/safety: GO**

---

## 7. Recommended next steps (H2.1C retry / H2.1D)

1. **Network:** From `netops-api` container, confirm UDP/161 to `45.169.161.255` (firewall, VPN, SNMP ACL on device).
2. **SNMP:** Validate community/profile with NOC (out of band; do not log value).
3. **Timeout:** After reachability OK, optional `SNMP_FAST_TIMEOUT_MS=15000` only if walks still flap (keep pilot single-device).
4. **HTTP:** Increase client/proxy timeout for POST (>7 min) or return `202` + `job_id` async (future).
5. **Re-run:** `POST /api/operational/interfaces/collect` once walks return rows; expect `status=succeeded`, `interfaceCount>0`, GET with populated `interfaces[]`.

---

## 8. Operator re-test command

```bash
# ensure flag on
NETOPS_SNMP_REAL_ENABLED=true docker compose up -d --no-deps api

# after network fix — session cookie from login
curl -sS -b cookies.txt -X POST http://127.0.0.1:8085/api/operational/interfaces/collect \
  -H 'Content-Type: application/json' \
  -d '{"device_id":1}' --max-time 600

curl -sS -b cookies.txt 'http://127.0.0.1:8085/api/operational/interfaces?device_id=1'
```
