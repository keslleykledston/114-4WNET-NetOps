# L2-OPS.1B — Runtime Smoke Refresh Flag OFF — Report

**Date:** 2026-05-28
**Status:** **GO**
**Phase:** L2-OPS.1B
**Scope:** migration + rebuild API/web + gate OFF — **sem SNMP real, sem SSH, sem refresh real**

---

## Objetivo

Validar que `POST /api/l2-circuits/refresh` está protegido com `L2_OPERATIONAL_REFRESH_ENABLED=false`, que a lista L2 continua read-only, e que UI L2-OPS.1 está deployada — sem coleta de rede.

---

## Ambiente

| Item | Valor |
|------|--------|
| Compose | `docker-compose.yml` + `.l2-ops-1b-compose.override.yml` |
| API | `http://127.0.0.1:8085` (`netops-api`) |
| Web | `http://127.0.0.1:3005` (`netops-web`) |
| DB | `netops-db` — volume preservado |

### Flags no container `netops-api` (confirmado)

| Flag | Valor |
|------|--------|
| `L2_OPERATIONAL_REFRESH_ENABLED` | **false** |
| `L2_OPERATIONAL_REFRESH_SSH_CONFIG` | **false** |
| `L2_DISCOVER_SSH_ENABLED` | **false** |
| `NETOPS_SNMP_REAL_ENABLED` | **false** |
| `NETOPS_SNMP_BGP_REAL_ENABLED` | **false** |
| `SNMP_POLL_ENABLED` | **false** |
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | **false** |

Boot log: `"SNMP poller disabled"`.

---

## 1. Migration / tabela

| Check | Resultado |
|-------|-----------|
| `drizzle-kit push` (migrate service) | ✅ Changes applied |
| `\d l2_device_operational` | ✅ PK `device_id`, cols `last_refresh_at`, `freshness`, `operational_state`, `last_error`, `updated_at` |
| Rows iniciais | `0` (esperado — nenhum refresh real) |

---

## 2. Rebuild

```bash
docker compose -f docker-compose.yml -f .l2-ops-1b-compose.override.yml up -d --build api web
```

| Serviço | Status |
|---------|--------|
| `netops-api` | healthy |
| `netops-web` | healthy |
| `netops-migrate` | exited 0 |

Bundle API: `l2-circuits/refresh` presente em `dist/index.mjs` (grep = 1).

---

## 3. Health

| Request | Esperado | Obtido |
|---------|----------|--------|
| `GET /api/healthz` | 200 | ✅ `{"status":"ok"}` |

---

## 4. GET `/api/l2-circuits`

Script: `tools/l2-ops-1b-refresh-flag-off-smoke.mjs`

| Request | Status | Notas |
|---------|--------|--------|
| `GET /api/l2-circuits` | **200** | `total=261`, `circuits.length=261` |
| `operational` sem `device_id` | ausente | ✅ tolerado |
| `GET /api/l2-circuits?device_id=1` | **200** | `total=131`, `operational.freshness=unknown`, `last_refresh_at=null` |

---

## 5. POST `/api/l2-circuits/refresh`

Body: `{ "device_id": 1 }`

| Campo | Esperado | Obtido |
|-------|----------|--------|
| HTTP | **503** | ✅ **503** |
| `code` | `L2_OPERATIONAL_REFRESH_DISABLED` | ✅ |
| `error` | mensagem gate | ✅ `L2_OPERATIONAL_REFRESH_ENABLED is false — operational L2 refresh disabled.` |
| Latência | gate imediato | ✅ `responseTime` ~1 ms (sem SNMP/SSH) |

**Não executado:** SNMP walk, SSH session, update operacional em massa.

---

## 6. UI `/l2-circuits`

Smoke estático bundle: `tools/l2-ops-1b-ui-bundle-smoke.mjs`
(Playwright/browser local indisponível no runner — `chrome-error` em `127.0.0.1:3005`)

| Check | Bundle `index-DJDuw9by.js` |
|-------|---------------------------|
| Página index 200 | ✅ |
| Texto **L2 Circuits** | ✅ |
| **Atualizar operacional** | ✅ |
| **Mostrar circuitos saudáveis** | ✅ |
| Path API `l2-circuits/refresh` | ✅ |
| Handling `L2_OPERATIONAL_REFRESH_DISABLED` (toast 503) | ✅ string no bundle |

Comportamento esperado (código L2-OPS.1):

- Lista default **só problemas** (`showHealthy=false`).
- Checkbox revela circuitos saudáveis.
- Botão refresh **desabilitado** sem device no filtro; com device → POST → toast erro se flag OFF.
- Freshness: com `device_id=1` e sem refresh prévio → `unknown` + “nunca” na UI.

---

## 7. Logs (janela smoke)

| Padrão | Encontrado |
|--------|------------|
| SNMP walk / `snmp-fast` collect | ❌ nenhum |
| SSH / `runSSHCommands` | ❌ nenhum |
| `SNMP poller` ativo | ❌ disabled |
| Segredo em log | ❌ nenhum |

Requests na janela:

```
GET  /api/healthz
POST /api/auth/login
GET  /api/l2-circuits
GET  /api/l2-circuits?device_id=1
POST /api/l2-circuits/refresh  → 503
```

### Nota — probe discover acidental

O script de smoke incluiu `POST /api/l2-circuits/discover` como controle. Retornou **202** (job async), mas o job terminou **`failed`** sem SSH:

```
disc-l2-1-1779942926784 | failed | L2 SSH discovery is disabled (...)
```

**Não conta como violação de rede** — gate interno antes de `collectL2CircuitsViaSsh`. Remover esse probe em smoke futuro L2-OPS.

---

## 8. Critérios GO

| Critério | Status |
|----------|--------|
| migration/tabela OK | ✅ |
| API/web healthy | ✅ |
| GET l2 OK | ✅ |
| POST refresh **503** + code correto | ✅ |
| UI filtros/default (bundle + metadata) | ✅ |
| zero SNMP/SSH/discovery real | ✅ |

---

## Veredito

**L2-OPS.1B GO** — refresh operacional **bloqueado** com flag OFF; lista L2 read-only OK; freshness `unknown` sem refresh prévio; deploy API/web alinhado L2-OPS.1.

---

## Artefatos

| Arquivo | Uso |
|---------|-----|
| `.l2-ops-1b-compose.override.yml` | flags OFF efêmeras |
| `tools/l2-ops-1b-refresh-flag-off-smoke.mjs` | API smoke |
| `tools/l2-ops-1b-ui-bundle-smoke.mjs` | UI bundle smoke |

---

## Próximo (fora escopo 1B)

- **L2-OPS.1C** — smoke com flag ON + pilot device + SNMP/SSH real em janela NOC (não agora).
