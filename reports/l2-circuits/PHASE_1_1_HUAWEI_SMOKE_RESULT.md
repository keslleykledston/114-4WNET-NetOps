# FASE 1.1 — Huawei Smoke Result

**Date:** 2026-05-23T20:03Z  
**Device:** `device_id=1` — `4WNET-BVA-BRT-RX` (`45.169.161.255`, huawei/vrp)  
**Plan:** `PHASE_1_1_HUAWEI_SMOKE_PLAN.md`  
**Rollback:** **executado** (`L2_DISCOVER_SSH_ENABLED=false` + rebuild api)

---

## Status final GO/NO-GO

| Dimensão | Decisão | Nota |
|----------|---------|------|
| **Operacional (API + SSH read-only + segurança)** | **GO** | Fluxo 202 → poll `completed`, sem segredo em log, rollback OK |
| **Dados (circuitos persistidos)** | **NO-GO** | `circuit_count=0`, nenhuma linha em `l2_circuits` |
| **FASE 1.2 parser gap** | **GO condicional** | Investigar saída CLI vs parser antes de expandir parsers |
| **Smoke geral** | **GO com ressalva** | Pipeline seguro; conteúdo L2 vazio no device ou parser/formato |

---

## Checklist GO (pré-execução)

| Item | OK |
|------|-----|
| `L2_DISCOVER_SSH_ENABLED=true` no `.env` | ✓ |
| `docker compose up -d --build api` | ✓ |
| Flag no container → `true` | ✓ |
| `GET /api/healthz` → 200 | ✓ |
| Tabelas `l2_circuits`, `l2_discovery_jobs` | ✓ |
| `GET /api/l2-circuits` + auth → 200 | ✓ |
| Device 1 `ip_address` + `password_encrypted` | ✓ |
| decrypt via `test-connection` | ✓ (`Connected successfully`) |
| Huawei VRP | ✓ |
| Allowlist 4 comandos + block `system-view` | ✓ |
| Escopo 1 device | ✓ |

---

## Comandos executados

```bash
# Enable + rebuild
# .env: L2_DISCOVER_SSH_ENABLED=true
cd /home/suporte/projects/114-4WNET_NetOps
docker compose up -d --build api

# Pré-checks
docker exec netops-api printenv L2_DISCOVER_SSH_ENABLED
curl -s http://127.0.0.1:8085/api/healthz
docker exec netops-db psql -U netops -d netops -c '\dt l2_*'
docker exec netops-db psql -U netops -d netops -c "SELECT id, hostname, ip_address, vendor, platform FROM devices WHERE id=1;"

# Allowlist (container)
# OK: display mpls l2vc verbose | vsi verbose | interface brief | description
# BLOCK: system-view

# Smoke automatizado (host → API_PORT=8085)
API_BASE=http://127.0.0.1:8085 SMOKE_DEVICE_ID=1 node tools/phase-1-1-smoke-run.mjs

# Rollback
# .env: L2_DISCOVER_SSH_ENABLED=false
docker compose up -d --build api
docker exec netops-api printenv L2_DISCOVER_SSH_ENABLED  # → false
```

**Base URL usada:** `http://127.0.0.1:8085` (`.env` `API_PORT=8085`)

---

## Execução — resultados

### Login / auth

| Step | Status |
|------|--------|
| `POST /api/auth/login` | 200, token + cookie |

### Test connection (decrypt)

| Campo | Valor |
|-------|--------|
| `POST /api/devices/1/test-connection` | 200 |
| `success` | `true` |
| `message` | `Connected successfully` |

### Discovery

| Campo | Valor |
|-------|--------|
| `POST /api/l2-circuits/discover` | **202** |
| **run_id** | `disc-l2-1-1779566591858` |
| Poll (1ª tentativa, +5s) | **200** |
| **job status** | `completed` |
| `started_at` | `2026-05-23T20:03:11.858Z` |
| `finished_at` | `2026-05-23T20:03:16.364Z` |
| `circuit_count` | **0** |
| `findings_count` | **0** |
| `error_message` | `null` |

### Circuitos

| Endpoint | Resultado |
|----------|-----------|
| `GET /api/l2-circuits?device_id=1` | `total: 0` |
| `GET /api/l2-circuits/:id` | **N/A** (sem circuitos) |
| `l2_circuits` rows device 1 | **0** |

### Findings

Nenhum finding (sem circuitos parseados).

---

## Evidência de segurança

| Check | Resultado |
|-------|-----------|
| Allowlist pré-SSH (4× `display`) | ✓ validado |
| `system-view` bloqueado | ✓ |
| Logs API sem password/token/community em claro | ✓ (`NO_SECRET_PATTERNS_IN_LOGS`) |
| `raw_evidence` redact | **N/A** (sem circuito salvo) |
| Alteração no equipamento | Nenhuma ação write planejada (somente `display`) |
| Rollback flag SSH | ✓ `L2_DISCOVER_SSH_ENABLED=false` |

**Comandos SSH enviados pelo collector (código):**

```text
display mpls l2vc verbose
display vsi verbose
display interface brief
display interface description
```

---

## Erros / anomalias

| Item | Severidade | Detalhe |
|------|------------|---------|
| Zero circuitos com job `completed` | **Alta (dados)** | SSH OK em `test-connection`; job terminou em ~5s com `circuit_count=0` |
| Sem `Failed to collect` nos logs | Info | Pode indicar saída vazia ou parser sem match, não falha explícita SSH |
| Parser interface brief/description | Esperado | Não gera circuitos nesta fase (FASE 1.2) |

**Hipóteses (não confirmadas neste run):**

1. Device sem MPLS L2VC/VSI ativo no momento do smoke.
2. Formato `display mpls l2vc verbose` / `display vsi verbose` diferente do fixture → parser retorna `[]`.
3. Saída SSH truncada/vazia por prompt/timing (improvável dado ~5s total).

---

## Rollback

| Step | Status |
|------|--------|
| `.env` → `L2_DISCOVER_SSH_ENABLED=false` | ✓ |
| `docker compose up -d --build api` | ✓ |
| Container flag | `false` |
| `GET /api/healthz` pós-rollback | 200 |

---

## Próximos passos

### Imediato (antes de novo smoke)

1. **CLI manual read-only** no `4WNET-BVA-BRT-RX` (operador humano):
   - `display mpls l2vc verbose`
   - `display vsi verbose`
   - Confirmar se existe L2VC/VSI.
2. Se CLI tiver dados → **FASE 1.2** + debug parser (capturar output sanitizado, ajustar `huawei-vrp-l2.ts`).
3. Se CLI vazio → smoke **GO dados** em outro device piloto (2 ou 3) ou aceitar zero como estado real.

### FASE 1.2 — Parser gap (quando autorizado)

- `display interface brief` → vlan / dot1q_subif
- `display interface description`
- `display mac-address vsi` / `vlan` (allowlist já existe)
- Fixtures com output real deste device (sem secrets)

### Não fazer ainda

- Bulk multi-device
- SNMP / NetBox write
- Habilitar SSH L2 permanente sem janela NOC

---

## Decisão objetiva

| Pergunta | Resposta |
|----------|----------|
| Pipeline L2 seguro em device real? | **Sim (GO)** |
| Pronto para produção com circuitos? | **Não (NO-GO dados)** |
| Entrar FASE 1.2? | **Sim**, após comparar CLI vs parser no device 1 |

---

## Artefatos

- Script: `tools/phase-1-1-smoke-run.mjs`
- Output JSON: execução local `/tmp/phase-1-1-smoke-output.json` (se preservado)
- Job DB: `l2_discovery_jobs.id=3`, `run_id=disc-l2-1-1779566591858`
