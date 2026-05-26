# PHASE H2.1G — SNMP_FAST Interfaces Pilot (Post-NOC)

**Date:** 2026-05-26  
**Commit:** `abbd10b` (H2.1E preflight)  
**Pilot:** `device_id=1` — `4WNET-BVA-BRT-RX` @ `45.169.161.255`  
**Assumption:** NOC reported UDP/161 / ACL / community fixed  
**Rules:** single device, SNMP read-only, no SSH, no discovery, no NetBox, no community in logs

---

## 1. Pre-check

| Check | Result |
|-------|--------|
| H2.1E/H2.1F | **GO** (prior runs) |
| `NETOPS_SNMP_REAL_ENABLED` (before) | **false** |
| `GET /api/healthz` | **200** ok |
| Device 1 SNMP cred | **CONFIGURED** (length **9**, value not logged) |
| **sysDescr.0 diag** (container, 3s, retry 0) | **FAIL** — `Request timed out` (~3003 ms) |

**Poller source IP (container):** `172.18.0.3` — NOC must allow this in SNMP ACL if poller is Docker.

Diag conclusion before collect: **NO_GO** for live IF-MIB (same as H2.1D). Collect run anyway per H2.1G protocol.

---

## 2. Execution (flag on)

```bash
NETOPS_SNMP_REAL_ENABLED=true docker compose up -d --build api
```

| Item | Value |
|------|-------|
| Container flag | **true** |

### POST collect

```
POST /api/operational/interfaces/collect
{"device_id": 1}
```

| Metric | Value |
|--------|-------|
| HTTP | **202** |
| Wall time | **~8.0s** |
| Job `id` | **3** |
| Job `status` | **failed** |
| `interfaceCount` | **0** |
| `errorCode` | **SNMP_PREFLIGHT_TIMEOUT** |
| `ifMibSkipped` | **true** |

**Response summary:** preflight `sysDescr.0` timed out; IF-MIB walks **not** executed (H2.1E behavior).

### Persistence

| Table | Rows (device 1) |
|-------|-----------------|
| `operational_interfaces` | **0** |
| `operational_collection_jobs` (latest) | job 3 **failed**, NOC-friendly `error_summary` |

### GET

```
GET /api/operational/interfaces?device_id=1 → 200
```

| Field | Value |
|-------|-------|
| `interfaceCount` | **0** |
| `interfaces` | `[]` |
| `freshness` / `freshness_status` | **fresh** (recent job `completed_at`) |
| `source` | `null` (no interface rows) |

**Interface fields** (`ifIndex`, `ifName`, `ifDescr`, `ifAlias`, `admin_status`, `oper_status`, `high_speed`, `last_change`, `hc_in_octets`, `hc_out_octets`, `source=snmp`): **not exercised** — no rows returned.

---

## 3. Logs

```
[snmp-fast] SNMP preflight failed deviceId=1 ip=45.169.161.255 code=SNMP_PREFLIGHT_TIMEOUT reason=timeout elapsedMs=8002
```

| Check | Result |
|-------|--------|
| Community / password in logs | **none** |
| SSH / discovery | **none** |
| IF-MIB `SNMP-WALK` lines | **none** (preflight abort) |

---

## 4. Rollback

```bash
NETOPS_SNMP_REAL_ENABLED=false docker compose up -d --build api
```

| Check | Result |
|-------|--------|
| Container flag | **false** |
| Health | **200** ok |
| POST collect | **503** `SNMP_FAST_DISABLED` |

---

## 5. GO criteria (H2.1G pilot **data** success)

| Criterion | Met |
|-----------|-----|
| `interface_count > 0` | **no** |
| Data persisted | **no** (0 interface rows) |
| GET returns interfaces | **no** (empty list) |
| `freshness_status=fresh` | **yes** (job metadata only) |
| Rollback OK | **yes** |
| Logs without secret | **yes** |
| Zero SSH | **yes** |

**Overall H2.1G pilot data: NO-GO**  
**Overall H2.1G runtime/safety/preflight: GO** (fast fail, no 13 walks, rollback OK)

---

## 6. Gap vs NOC claim

From this lab host (`netops-api` @ `172.18.0.3`), **SNMP to `45.169.161.255:161` still does not answer** `sysDescr.0` within 3–8s.

Possible causes (NOC re-check):

1. ACL allows wrong source (host IP vs Docker bridge `172.18.0.3`).
2. Fix applied on different path/firewall zone than API container egress.
3. Community mismatch (do not log; verify out-of-band).
4. SNMP bound to other management IP than `45.169.161.255`.

---

## 7. Re-test when NOC confirms from **this** poller

```bash
# 1) diag must pass
docker cp tools/snmp-pilot-connectivity-diag.mjs netops-api:/tmp/
docker exec netops-api node /tmp/snmp-pilot-connectivity-diag.mjs
# expect tests.sysDescr.status = ok

# 2) single collect
NETOPS_SNMP_REAL_ENABLED=true docker compose up -d --no-deps api
curl -sS -b cookies.txt -X POST http://127.0.0.1:8085/api/operational/interfaces/collect \
  -H 'Content-Type: application/json' -d '{"device_id":1}' --max-time 600

curl -sS -b cookies.txt 'http://127.0.0.1:8085/api/operational/interfaces?device_id=1'

# 3) rollback
NETOPS_SNMP_REAL_ENABLED=false docker compose up -d --no-deps api
```

**Success target:** `status=succeeded` or `partial` with `interfaceCount>0`, GET populated, `source=snmp` on rows, fields listed in H2.1G checklist.
