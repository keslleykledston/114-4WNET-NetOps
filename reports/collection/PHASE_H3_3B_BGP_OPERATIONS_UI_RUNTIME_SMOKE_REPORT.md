# PHASE H3.3B — BGP Operations UI Runtime Smoke

**Date:** 2026-05-27
**Base UI:** `01f36c1` (`feat(operational): add BGP operations read-only UI`)
**Data source:** H3.2B persistido (`operational_bgp_peers`, job id=1)
**Status:** **GO**

---

## 1) Objetivo

Validar runtime da UI BGP Operations usando **dados já no DB**. Sem nova coleta SNMP.

---

## 2) Stack / flags

Rebuild:

```bash
docker compose up -d --build api web
docker compose -f docker-compose.yml -f .h3.1b-compose.override.yml up -d api --force-recreate
```

Flags efetivas (API, janela de smoke):

| Flag | Valor |
|------|-------|
| `SNMP_POLL_ENABLED` | `false` |
| `NETOPS_SNMP_BGP_REAL_ENABLED` | `false` |
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | `false` |

Boot log API: `SNMP poller disabled`

**Nota:** primeira subida usou `.env` com `NETOPS_SNMP_REAL_ENABLED=true` (poller legado H2). API recriada com override H3.1B antes de fechar smoke.

---

## 3) Health

```http
GET /api/healthz → 200 {"status":"ok"}
```

Containers: `netops-api`, `netops-web`, `netops-db` healthy.

---

## 4) DB (sem nova coleta)

| Tabela | Resultado |
|--------|-----------|
| `operational_bgp_peers` (device_id=1) | **45** rows |
| `operational_bgp_collection_jobs` | id=1, status=`succeeded`, peer_count=**45**, freshness=`fresh` |

`collected_at` H3.2B: `2026-05-27T07:19:32.710Z` (inalterado neste smoke).

---

## 5) API (autenticado)

### GET peers

```http
GET /api/operational/bgp?device_id=1 → 200
```

- `peers.length` = **45**
- `freshness` = `fresh`
- campos presentes: `peerIp`, `peerAs`, `fsmState`, `operStatus`, `uptimeSeconds`, `collectedAt`

### GET summary

```http
GET /api/operational/bgp/summary?device_id=1 → 200
```

```json
{
  "total": 45,
  "freshness": "fresh",
  "counts": { "up": 25, "down": 5, "idle": 7, "active": 8, "unknown": 0 }
}
```

### POST collect (gate only — não é coleta do smoke)

```http
POST /api/operational/bgp/collect { "device_id": 1 } → 503 SNMP_FAST_BGP_DISABLED
```

Confirma gate off. **Nenhuma coleta nova executada** (peer count DB inalterado).

---

## 6) UI

### Rotas SPA

| Rota | HTTP |
|------|------|
| `/operational/bgp` | 200 |
| `/bgp/operations` | 200 (mesma page) |

### Bundle scan (`index-DttA-Tmq.js`)

- contém: `BGP Operations`, `operational/bgp`, empty-state text
- **não** contém: `operational/bgp/collect`

### Código (H3.3)

- somente GET peers + summary
- zero import SSH / discovery / compliance
- zero botão collect (apenas **Atualizar** = refetch GET)

### Browser interativo

IDE browser não alcançou `http://127.0.0.1:3005` (chrome-error). UI validada por **contrato API + bundle + source** (mesmos dados que a tela consome).

Cards esperados (de summary API):

| Card | Valor |
|------|-------|
| total peers | 45 |
| established (up) | 25 |
| idle | 7 |
| active/connect | 8 (+ connect na tabela se houver) |
| down/unknown | 5 + 0 |
| freshness | fresh |

Aviso na page: estado operacional SNMP, não valida config/policies.

---

## 7) Logs / segurança

Janela pós-override H3.1B:

| Check | Resultado |
|-------|-----------|
| SNMP poller | **disabled** |
| SNMP operational BGP collect | **não** |
| SSH | **não** |
| discovery | **não** |
| community/password em logs | **não** |

---

## 8) GO / NO-GO

### GO

- [x] API health OK
- [x] GET peers OK (45)
- [x] GET summary OK (total=45)
- [x] UI data path OK (API + bundle + routes)
- [x] zero POST collect na UI
- [x] zero SNMP/SSH/discovery nesta fase
- [x] dados H3.2B ainda no DB

### Fora do escopo (OK)

- nova coleta SNMP
- drilldown SSH
- compliance

---

## 9) Próximo

- H3.4 (opcional): botão collect na UI atrás de gate + confirmação NOC
- deploy web em ambiente acessível ao browser NOC para smoke visual manual
