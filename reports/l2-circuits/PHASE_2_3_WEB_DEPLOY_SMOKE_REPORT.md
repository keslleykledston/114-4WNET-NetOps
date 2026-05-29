# FASE 2.3 — Web Deploy + Smoke `/l2-circuits` — Report

**Date:** 2026-05-24  
**Status:** **GO**  
**Branch:** `feature/v0.3.4-operational-pilot-noc`  
**Route:** `/l2-circuits`

---

## Objetivo

Rebuild/deploy `netops-web` (FASE 2.2 bundle) + smoke visual/funcional read-only. Zero discovery, zero SSH, zero backend change.

---

## Deploy

| Item | Resultado |
|------|-----------|
| Comando | `L2_DISCOVER_SSH_ENABLED=false docker compose up -d --build web` |
| Serviço | `web` → container `netops-web` |
| Health | `healthy` |
| Porta | `http://127.0.0.1:3005` |
| Bundle | `assets/index-COOgT6vv.js` (FASE 2.2) |
| API flag | `L2_DISCOVER_SSH_ENABLED=false` |
| Stack | `netops-web` + `netops-api` + `netops-db` healthy |

---

## Smoke UI (Playwright headless)

Login admin → `/l2-circuits`.

| Check | GO |
|-------|-----|
| Sidebar "L2 Circuits" | ✅ |
| Cards resumo (`Total (filtrado)` = 261) | ✅ |
| Tabela 261 linhas | ✅ |
| **Atualizar lista** → só `GET /api/l2-circuits` | ✅ |
| Filtro device → `GET ...?device_id=` | ✅ |
| Filtro status DOWN → total 71 | ✅ |
| Filtro VLAN texto | ✅ |
| Limpar filtros | ✅ |
| Detail sheet abre | ✅ |
| Raw evidence só no detalhe | ✅ |
| Mobile 390px → cards, table escondida | ✅ |
| Zero `POST .../discover` | ✅ |
| Zero erro API crítico pós-login | ✅ |

### CSV export

| Check | GO |
|-------|-----|
| Botão Export CSV | ✅ |
| Sem coluna `raw_evidence` | ✅ |
| Full export = 261 rows | ✅ |
| Filtro DOWN → 71 rows, all status=DOWN | ✅ |

Headers: `device,type,status,vlan,vc_id,vsi_name,local_interface,peer_ip,findings_count,last_seen`

---

## Network session (smoke)

Somente GET L2:

```
GET /api/l2-circuits
GET /api/l2-circuits?device_id=36
GET /api/l2-circuits/30   (detail sheet)
```

**Nenhum** `POST /api/l2-circuits/discover`  
**Nenhum** `POST /api/devices/*/discover`  
**Nenhum** SSH

---

## Logs API (janela smoke)

- Só `GET /api/l2-circuits` e `GET /api/l2-circuits/:id`
- Sem linhas discover/ssh
- 401 isolado em probe curl sem cookie (esperado)

---

## Dados runtime

| Métrica | Valor |
|---------|-------|
| Circuitos API | 261 |
| Device 1 | 131 |
| Detail id=1 | rawEvidence presente no detalhe |

---

## Bundle sanity

Strings FASE 2.2 no JS deployado:

- `L2 Circuits`
- `Atualizar lista`
- `Export CSV`
- `docs/l2-circuits/RUNBOOK_L2_DISCOVERY.md`

Código L2 **não** referencia `l2-circuits/discover` (discovery fica no runbook / backend gate).

---

## Critérios GO

| Critério | Status |
|----------|--------|
| `/l2-circuits` acessível | ✅ |
| Dados aparecem | ✅ |
| Filtros / export / detail OK | ✅ |
| Zero discovery | ✅ |
| Zero SSH | ✅ |
| Build/deploy OK | ✅ |

---

## Veredito

**FASE 2.3 GO** — web deployado com UX 2.2; smoke read-only passou; pronto para NOC consulta.

---

## Próximo (fora escopo 2.3)

- FASE 2.x opcional: polish NOC, alertas, etc.
- Discovery L2: só via runbook + flag explícita (não nesta fase)
