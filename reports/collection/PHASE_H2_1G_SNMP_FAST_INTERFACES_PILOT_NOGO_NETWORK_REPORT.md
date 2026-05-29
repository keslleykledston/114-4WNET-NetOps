# PHASE H2.1G — SNMP_FAST Interfaces Pilot NO-GO Network Report

**Date:** 2026-05-26  
**Pilot:** `device_id=1` — `4WNET-BVA-BRT-RX` @ `45.169.161.255`  
**Minimum OID:** `sysDescr.0` = `1.3.6.1.2.1.1.1.0`  
**Result:** runtime/preflight **GO**; pilot data **NO-GO**

---

## 1. Summary

H2.1G was executed after NOC reported an adjustment, but the minimum SNMP gate still failed:

| Check | Result |
|-------|--------|
| `sysDescr.0` from `netops-api` | **timeout** |
| UDP/161 reply | **none** |
| POST collect | **failed** in ~8s |
| `errorCode` | `SNMP_PREFLIGHT_TIMEOUT` |
| `ifMibSkipped` | `true` |
| IF-MIB walks | `0` |
| `operational_interfaces` device 1 | `0` rows |
| Rollback | `NETOPS_SNMP_REAL_ENABLED=false` OK |
| POST after rollback | `503 SNMP_FAST_DISABLED` |

Conclusion: application preflight works. Network/SNMP reachability remains blocked. Do not repeat `POST /collect` until `sysDescr.0` responds.

---

## 2. Source IP real via Docker NAT

Docker performs `MASQUERADE`.

| Layer | IP |
|-------|----|
| Container `netops-api` | `172.18.0.3` |
| Source seen by NE/path | **`10.11.12.254`** |
| Destination | `45.169.161.255:161/udp` |

SNMP ACL on the NE must allow **`10.11.12.254/32`**, not `172.18.0.3/32`.

---

## 3. tcpdump evidence

```text
10.11.12.254:xxxxx -> 45.169.161.255:161 GetRequest sysDescr.0
no reply
```

---

## 4. NOC checklist

1. Permit SNMP source `10.11.12.254/32` in NE SNMP ACL/view/profile.
2. Confirm SNMP destination `45.169.161.255` is the correct management IP.
3. Validate community/profile out-of-band; do not paste secret in ticket/log.
4. Validate return route to `10.11.12.254`.
5. Validate UDP/161 firewall both directions.
6. Validate SNMPv2c and `sysDescr.0` visibility in configured view.

---

## 5. Commands de re-teste

After NOC confirms source ACL/path fix:

```bash
docker cp tools/snmp-pilot-connectivity-diag.mjs netops-api:/tmp/
docker exec netops-api node /tmp/snmp-pilot-connectivity-diag.mjs
```

Gate before any collect:

```text
tests.sysDescr.status = "ok"
```

Only then run one collect window:

```bash
NETOPS_SNMP_REAL_ENABLED=true docker compose up -d --no-deps api

curl -sS -b cookies.txt -X POST http://127.0.0.1:8085/api/operational/interfaces/collect \
  -H 'Content-Type: application/json' \
  -d '{"device_id":1}' \
  --max-time 600

curl -sS -b cookies.txt 'http://127.0.0.1:8085/api/operational/interfaces?device_id=1'

NETOPS_SNMP_REAL_ENABLED=false docker compose up -d --no-deps api
```

---

## 6. Ticket NOC pronto

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

## 7. Scope

No SSH. No SNMP retest in this commit phase. No discovery. No device change. No flag enable. No rebuild. L2 WIP and BGP drilldown WIP excluded.
