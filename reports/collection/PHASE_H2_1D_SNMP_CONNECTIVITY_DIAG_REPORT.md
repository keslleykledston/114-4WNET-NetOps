# PHASE H2.1D — SNMP Connectivity Diagnosis (Pilot Device 1)

**Date:** 2026-05-26  
**Context:** H2.1C — job `partial`, `interface_count=0`, 13 IF-MIB walk timeouts  
**Pilot:** `device_id=1` — `4WNET-BVA-BRT-RX` @ `45.169.161.255` (Huawei VRP)  
**Rules:** no SSH, no discovery, no POST collect retry, no secret in output/logs

---

## 1. Environment

| Item | Value |
|------|-------|
| `NETOPS_SNMP_REAL_ENABLED` | **false** (confirmed on `netops-api` before diag) |
| `GET /api/healthz` | **200** `{"status":"ok"}` |
| H2.1C job | id=1, status `partial`, 0 interfaces |

---

## 2. Device (no secret)

| Field | Value |
|-------|-------|
| device_id | 1 |
| hostname | 4WNET-BVA-BRT-RX |
| ipAddress | 45.169.161.255 |
| vendor / platform | huawei / vrp |
| SNMP credential configured | **yes** |
| community length | **9** (value **never** printed or logged) |

---

## 3. Tests executed (from `netops-api` container)

Tool: `tools/snmp-pilot-connectivity-diag.mjs` (copied to `/tmp/`, run with `DATABASE_URL` from container).

| Step | Test | Params | Result |
|------|------|--------|--------|
| 1 | UDP/TCP probe port 161 | 2s | **inconclusive** — `ECONNREFUSED` on TCP connect (expected for UDP; does not prove SNMP up/down) |
| 2 | SNMP GET **sysDescr.0** | `1.3.6.1.2.1.1.1.0`, timeout **3s**, retries **0** | **FAIL** — `Request timed out` (~3001 ms) |
| 3 | SNMP GET ifNumber.0 | — | **skipped** (sysDescr failed) |
| 4 | ifName mini-walk | — | **skipped** |
| 5 | POST `/operational/interfaces/collect` | — | **not run** (per H2.1D rules) |

**Not run:** full IF-MIB (13 walks) — would repeat H2.1C failure mode.

---

## 4. Conclusion

| Area | Verdict |
|------|---------|
| **SNMP data path** | **NO-GO** — cannot read `sysDescr.0` from container in 3s |
| **API / DB / safety** | **OK** — same as H2.1C (no crash, no secrets in logs) |
| **New POST collect** | **NO-GO** until sysDescr succeeds |

**Root cause (likely):** SNMP unreachable or denied from Docker host/network to `45.169.161.255:161` — ACL, wrong community, firewall, missing return route, or SNMP not listening on management IP seen by poller.

This matches H2.1C: all IF-MIB walks timed out (~10s each) → long run, zero rows.

---

## 5. NOC checklist (no secret sharing in tickets)

1. Confirm SNMP **source IP** allowed on NE8000 = egress IP of host running `netops-api` (Docker bridge/NAT IP; this run: container **`172.18.0.3`** — verify NAT to host if ACL is on public IP).
2. Confirm **UDP/161** open path: poller → `45.169.161.255`.
3. Confirm **SNMPv2c community** on device matches NetOps DB profile (validate out-of-band; do not paste in chat/logs).
4. Confirm SNMP **ACL / mib-view** allows at least `1.3.6.1.2.1.1.1.0` and IF-MIB branches.
5. Confirm **return route** from router to poller for UDP responses.
6. On host: firewall / `iptables` / Docker `FORWARD` for UDP 161 egress.

---

## 6. Logs / safety (post-diag)

| Check | Result |
|-------|--------|
| community in API logs | **not found** (grep) |
| password in API logs | **not found** |
| SSH / discovery | **not invoked** |
| POST collect loop | **not repeated** |

---

## 7. GO / NO-GO

| Decision | Status |
|----------|--------|
| **New POST collect (H2.1C retry)** | **NO-GO** until sysDescr.0 OK from container |
| **Implement SNMP preflight (H2.1E)** | **GO** — abort before 13 walks; `error_code=SNMP_PREFLIGHT_TIMEOUT`; job fail in &lt;10s |

### H2.1E preflight (recommended)

Before `collectSnmpInterfacesOnly`:

1. GET `sysDescr.0` — timeout 3s, retries 0–1.
2. On timeout → job `failed`, `error_summary` / `error_code=SNMP_PREFLIGHT_TIMEOUT`, **no** IF-MIB walks.
3. On success → proceed with existing IF-MIB pipeline (or optional second check `ifNumber.0`).

Saves ~6+ minutes and client timeouts when path is dead.

---

## 8. Retry procedure (after NOC fixes path)

```bash
# 1) Re-run diag (inside container)
docker cp tools/snmp-pilot-connectivity-diag.mjs netops-api:/tmp/
docker exec netops-api node /tmp/snmp-pilot-connectivity-diag.mjs
# expect conclusion: GO

# 2) Only then — enable flag and collect once
NETOPS_SNMP_REAL_ENABLED=true docker compose up -d --no-deps api
# login + POST with long timeout
curl ... --max-time 600 -d '{"device_id":1}'

# 3) Rollback flag when done
NETOPS_SNMP_REAL_ENABLED=false docker compose up -d --no-deps api
```

---

## 9. Artifacts

| File | Purpose |
|------|---------|
| `tools/snmp-pilot-connectivity-diag.mjs` | Repeatable minimal SNMP diag (container) |
| `reports/collection/PHASE_H2_1C_SNMP_FAST_INTERFACES_PILOT_RESULT.md` | Prior full collect attempt |
