# PHASE H3.1B — SNMP_FAST BGP Runtime Smoke (flag false)

**Date:** 2026-05-27  
**Base commit:** `156e807` — `feat(operational): add SNMP fast BGP peers skeleton`  
**Status:** **GO** — ready for H3.2 live pilot planning  
**Scope:** migration + API runtime; **no SNMP live**, **no SSH**, **no discovery**

---

## 1. Commit validado

```text
156e807 feat(operational): add SNMP fast BGP peers skeleton
37db208 docs(bgp): close peer drilldown phases D2 through D6B
```

HEAD = `156e807`.

---

## 2. Migration

```bash
docker compose run --rm --build migrate
```

Result: `drizzle-kit push` → **Changes applied**

**Tabelas criadas (Postgres):**

| Table | Status |
|-------|--------|
| `operational_bgp_collection_jobs` | **exists** |
| `operational_bgp_peers` | **exists** |

Row counts pós-smoke: **jobs=0**, **peers=0** (POST bloqueado antes de insert).

---

## 3. Runtime flags (override efêmero `.h3.1b-compose.override.yml`, não commitado)

```bash
docker compose -f docker-compose.yml -f .h3.1b-compose.override.yml up -d --build api
```

| Variable | Container value |
|----------|-----------------|
| `SNMP_POLL_ENABLED` | **false** |
| `NETOPS_SNMP_BGP_REAL_ENABLED` | **false** |
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | **false** |

API log boot: **`SNMP poller disabled`**

Note: `NETOPS_SNMP_REAL_ENABLED=true` permanece do `.env` (H2 interfaces) — **independente** do gate BGP (`NETOPS_SNMP_BGP_REAL_ENABLED`).

---

## 4. Health

```http
GET /api/healthz → 200 {"status":"ok"}
```

Container `netops-api`: **healthy**

---

## 5. GET peers (vazio)

```http
GET /api/operational/bgp?device_id=1
Authorization: Bearer <token>
→ 200
```

```json
{
  "deviceId": 1,
  "peers": [],
  "freshness": "unknown",
  "collectedAt": null,
  "jobId": null
}
```

---

## 6. GET summary (vazio)

```http
GET /api/operational/bgp/summary?device_id=1
→ 200
```

```json
{
  "deviceId": 1,
  "total": 0,
  "freshness": "unknown",
  "collectedAt": null,
  "counts": { "up": 0, "down": 0, "idle": 0, "active": 0, "unknown": 0 }
}
```

---

## 7. POST collect (gate false)

```http
POST /api/operational/bgp/collect
Content-Type: application/json

{ "device_id": 1 }
→ 503
```

```json
{
  "error": "SNMP_FAST_BGP_DISABLED",
  "message": "NETOPS_SNMP_BGP_REAL_ENABLED is false — SNMP_FAST BGP collection disabled."
}
```

`responseTime` ~3 ms — **zero SNMP** session opened.

---

## 8. Logs / safety

Boot + smoke window:

| Check | Result |
|-------|--------|
| SNMP poller disabled | **PASS** |
| SNMP BGP walk | **none** |
| SSH | **none** |
| Discovery | **none** |
| community/password/token in logs | **none** |

Request lines observed:

```text
GET /api/healthz → 200
GET /api/operational/bgp → 200
GET /api/operational/bgp/summary → 200
POST /api/operational/bgp/collect → 503
```

---

## 9. Selftests (host)

```bash
pnpm dlx tsx tools/snmp-fast-bgp-selftest.mjs          # PASS
pnpm dlx tsx tools/snmp-fast-bgp-preflight-selftest.mjs  # PASS
```

---

## 10. Checklist GO

| # | Critério | Result |
|---|----------|--------|
| 1 | Migration 0018 aplicada | **PASS** |
| 2 | API healthy | **PASS** |
| 3 | GET peers vazio OK | **PASS** |
| 4 | GET summary vazio OK | **PASS** |
| 5 | POST → 503 | **PASS** |
| 6 | Zero SNMP live | **PASS** |
| 7 | Zero SSH | **PASS** |
| 8 | Zero discovery | **PASS** |
| 9 | Logs sem segredo | **PASS** |

---

## 11. Veredito

**H3.1B = GO**

**H3.2 piloto real:** pode prosseguir com janela NOC — `NETOPS_SNMP_BGP_REAL_ENABLED=true` efêmero, walk RFC4273, device 1, rede SNMP OK (lição H2.1G).

---

## 12. Próximo

H3.2 — janela NOC, `NETOPS_SNMP_BGP_REAL_ENABLED=true` efêmero, walk RFC4273 live, device 1.
