# PHASE H2.1G — SNMP_FAST Interfaces Pilot (Post-NOC)

**Date:** 2026-05-26  
**Commit base:** `abbd10b` (H2.1E preflight)  
**Pilot:** `device_id=1` — `4WNET-BVA-BRT-RX` @ `45.169.161.255`  
**Minimum OID:** `sysDescr.0` = `1.3.6.1.2.1.1.1.0`  
**Assumption:** NOC reported UDP/161 / ACL / community adjusted  
**Rules:** single device, SNMP read-only during executed validation, no SSH, no discovery, no NetBox, no community in logs/reports

> Filename has inherited `SUCCESS` suffix. Actual H2.1G result is **runtime/preflight GO** and **pilot data NO-GO**.

---

## 1. Executive result

| Area | Result |
|------|--------|
| SNMP preflight behavior | **GO** — failed fast in ~8s |
| Full IF-MIB protection | **GO** — skipped after `sysDescr.0` timeout |
| Pilot data collection | **NO-GO** — no SNMP answer from NE |
| Interface persistence | **NO-GO** — `operational_interfaces` device 1 remains 0 rows |
| Rollback | **GO** — `NETOPS_SNMP_REAL_ENABLED=false`, POST returns 503 |
| Safety | **GO** — no SSH, no discovery, no secret printed |

**Conclusion:** app/runtime behavior is correct. Network/NOC path is still blocked. Do **not** repeat `POST /collect` until `sysDescr.0` answers from this poller path.

---

## 2. Observed validation

### Device

| Field | Value |
|-------|-------|
| Device | `4WNET-BVA-BRT-RX` |
| `device_id` | `1` |
| Destination | `45.169.161.255` |
| Minimum OID | `sysDescr.0` / `1.3.6.1.2.1.1.1.0` |

### Direct sysDescr test from `netops-api`

| Check | Result |
|-------|--------|
| `sysDescr.0` from container `netops-api` | **timeout** |
| UDP/161 reply | **none observed** |
| Secret/community in output | **none** |

### POST collect result

```
POST /api/operational/interfaces/collect
{"device_id": 1}
```

| Metric | Value |
|--------|-------|
| Wall time | **~8s** |
| Job status | **failed** |
| `errorCode` | **SNMP_PREFLIGHT_TIMEOUT** |
| `ifMibSkipped` | **true** |
| IF-MIB walks | **0** |
| `interfaceCount` | **0** |
| `operational_interfaces` rows for device 1 | **0** |

Preflight stopped the expensive IF-MIB walks as designed.

---

## 3. Source IP real via Docker NAT

Initial container IP is **not** the source seen by the NE.

| Layer | IP |
|-------|----|
| Container `netops-api` | `172.18.0.3` |
| Source seen on wire / by NE path | **`10.11.12.254`** |
| Destination | `45.169.161.255:161/udp` |

Docker performs `MASQUERADE`. Therefore SNMP ACL on the NE must allow **`10.11.12.254/32`**, not `172.18.0.3/32`.

---

## 4. tcpdump evidence

Wire capture during H2.1G showed outbound SNMP request and no reply:

```text
10.11.12.254:xxxxx -> 45.169.161.255:161 GetRequest sysDescr.0
no reply
```

Interpretation: request leaves host through NAT source `10.11.12.254`; NE or path does not return SNMP response.

---

## 5. Rollback proof

| Check | Result |
|-------|--------|
| Runtime flag after rollback | `NETOPS_SNMP_REAL_ENABLED=false` |
| POST after rollback | **503** `SNMP_FAST_DISABLED` |

Rollback OK. SNMP_FAST remained disabled after validation.

---

## 6. NOC checklist

NOC must validate from NE/path perspective:

1. Permit SNMP source **`10.11.12.254/32`** in NE SNMP ACL/view/profile.
2. Confirm destination management IP **`45.169.161.255`** is correct for SNMP.
3. Confirm SNMP community/profile out-of-band; do not paste community in tickets/logs.
4. Confirm return route from NE/VRF/firewall path to `10.11.12.254`.
5. Confirm UDP/161 firewall path both directions.
6. Confirm SNMPv2c enabled and `sysDescr.0` visible in configured view.

---

## 7. Commands de re-teste

Run only after NOC confirms ACL/source fix. Do not run full collect until `sysDescr.0` succeeds.

```bash
# 1) Copy safe diagnostic script into API container
docker cp tools/snmp-pilot-connectivity-diag.mjs netops-api:/tmp/

# 2) Minimum gate: sysDescr.0 must return ok
docker exec netops-api node /tmp/snmp-pilot-connectivity-diag.mjs

# Expected before POST collect:
# tests.sysDescr.status = "ok"
# conclusion = "GO" or at least sysDescr ok
```

Only after `sysDescr.0` answers:

```bash
# 3) Enable SNMP_FAST only for one retry window
NETOPS_SNMP_REAL_ENABLED=true docker compose up -d --no-deps api

# 4) Single collect
curl -sS -b cookies.txt -X POST http://127.0.0.1:8085/api/operational/interfaces/collect \
  -H 'Content-Type: application/json' \
  -d '{"device_id":1}' \
  --max-time 600

# 5) Read result
curl -sS -b cookies.txt 'http://127.0.0.1:8085/api/operational/interfaces?device_id=1'

# 6) Rollback
NETOPS_SNMP_REAL_ENABLED=false docker compose up -d --no-deps api
```

Success target: `status=succeeded` or controlled `partial` with `interfaceCount > 0`, GET populated, rows with `source=snmp`.

---

## 8. Ticket NOC pronto

```text
Assunto: SNMP NE8000 NO-GO - liberar source NAT real do poller

Device: 4WNET-BVA-BRT-RX
device_id: 1
Destino SNMP: 45.169.161.255 UDP/161
OID mínimo: sysDescr.0 (1.3.6.1.2.1.1.1.0)

Resultado H2.1G:
- sysDescr.0 a partir do container netops-api: timeout
- resposta UDP/161: nenhuma
- POST collect: failed em ~8s
- errorCode: SNMP_PREFLIGHT_TIMEOUT
- ifMibSkipped: true
- IF-MIB walks: 0
- operational_interfaces device 1: 0 rows
- rollback NETOPS_SNMP_REAL_ENABLED=false OK
- POST após rollback: 503 SNMP_FAST_DISABLED

Descoberta crítica:
Docker faz MASQUERADE. Container netops-api usa 172.18.0.3 internamente,
mas o NE/caminho vê a origem real como 10.11.12.254.

tcpdump:
10.11.12.254:xxxxx -> 45.169.161.255:161 GetRequest sysDescr.0
sem reply.

Ação solicitada:
Liberar SNMP ACL/view/profile para source 10.11.12.254/32.
Validar community out-of-band, rota de retorno e firewall UDP/161 bidirecional.

Regra de operação:
Não repetir POST collect até sysDescr.0 responder a partir do poller.
```

---

## 9. Boundary

This report excludes L2 WIP and BGP drilldown WIP. H2.1G did not require SSH, discovery, device change, or secret exposure in report.
