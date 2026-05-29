# PHASE H3.2B — SNMP_FAST BGP Real Walk Result

**Date:** 2026-05-27
**Base:** `320555f` + live collector (H3.2B)
**Pilot:** `device_id=1` — `4WNET-BVA-BRT-RX` @ `45.169.161.255`
**Status:** **GO**

---

## 1) Pré-requisito H3.2A-retry

| Check | Resultado |
|-------|-----------|
| sysDescr.0 | OK (retry) |
| bgpVersion.0 | OK (retry) |
| credencial resolver | OK (`source=device`, length 9, sem `value` exposto) |

---

## 2) Implementação (código)

| Módulo | Função |
|--------|--------|
| `operational-bgp.preflight.ts` | `runBgpPreflightLive` — GET sysDescr + bgpVersion |
| `operational-bgp-rfc4273-snmp.ts` | walk RFC4273 `15.2.1` + fallback BGP4-MIB `15.3.1` |
| `operational-bgp.collector.ts` | walk real quando `NETOPS_SNMP_BGP_REAL_ENABLED=true` |
| `operational-bgp.service.ts` | preflight antes do job; persist peers |
| `operational-bgp.errors.ts` | `OperationalBgpPreflightError` (504/403/422) |

---

## 3) Flags (janela de teste)

| Flag | Valor |
|------|-------|
| `SNMP_POLL_ENABLED` | `false` |
| `NETOPS_SNMP_BGP_REAL_ENABLED` | `true` |
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | `false` |

Override: `.h3.2a-compose.override.yml` + `docker compose up -d --build api`.

---

## 4) Execução

```http
POST /api/operational/bgp/collect
{ "device_id": 1 }
→ 202
```

```json
{
  "deviceId": 1,
  "jobId": 1,
  "status": "succeeded",
  "peerCount": 45,
  "collectorUsed": "rfc4273",
  "collectedAt": "2026-05-27T07:19:32.710Z",
  "freshness": "fresh",
  "stub": false,
  "errorCode": null
}
```

Tempo HTTP ~0.65s. Log API (sem community):

```text
[operational-bgp] walk deviceId=1 ip=45.169.161.255 peerCount=45 elapsedMs=479
```

---

## 5) GET validação

### `GET /api/operational/bgp?device_id=1` → 200

- `peers.length` = **45**
- campos presentes: `peer_ip`, `peer_as`, `fsm_state`, `oper_status`, `uptime_seconds`, `collected_at`, `freshness` (lista)

Amostra:

| peer_ip | peer_as | fsm_state | oper_status | uptime_seconds |
|---------|---------|-----------|-------------|----------------|
| 10.20.0.18 | 268707 | established | up | 315709 |
| 10.20.0.26 | 268707 | established | up | 214846 |
| 10.20.1.1 | 270966 | established | up | 11631 |

`received_prefixes` / `accepted_prefixes` / `advertised_prefixes` = **null** (esperado H3 — sem inventar).

### `GET /api/operational/bgp/summary?device_id=1` → 200

```json
{
  "deviceId": 1,
  "total": 45,
  "freshness": "fresh",
  "collectedAt": "2026-05-27T07:19:32.710Z",
  "counts": { "up": 25, "down": 5, "idle": 7, "active": 8, "unknown": 0 }
}
```

---

## 6) DB

| Tabela | Resultado |
|--------|-----------|
| `operational_bgp_collection_jobs` | id=1, status=`succeeded`, peer_count=**45**, freshness=`fresh` |
| `operational_bgp_peers` | **45** rows para device_id=1 |

---

## 7) Rollback

1. `docker compose -f docker-compose.yml up -d api --force-recreate` (sem override).
2. `POST /api/operational/bgp/collect` → **503** `SNMP_FAST_BGP_DISABLED`.

---

## 8) Segurança

| Check | Resultado |
|-------|-----------|
| community em logs | **não** |
| SSH | **não** |
| discovery | **não** |
| alteração NE | **não** |
| bulk | **não** (1 device) |
| config/compliance | **não** |

---

## 9) GO / NO-GO

### GO

- [x] 1 device
- [x] coleta concluída (`succeeded`)
- [x] peer_count > 0 (**45**)
- [x] GET peers OK
- [x] summary OK
- [x] rollback OK
- [x] zero SSH
- [x] zero discovery

### Observações

- `collectorUsed=rfc4273` (walk `15.2.1`; fallback interno `15.3.1` se vazio).
- BGP4-V2 / Huawei MIB ainda **não** implementados (próximo se RFC4273 vazio em outros devices).
- Prefix counters permanecem null até OID inventory vendor.

---

## 10) Próximo

- Commit código H3.2B (separado deste relatório).
- Piloto ampliar só após NOC; manter rollback documentado por janela.
