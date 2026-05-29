# L2 Circuit Discovery — Runtime Hotfix Report

**Date:** 2026-05-23  
**Branch:** `feature/v0.3.4-operational-pilot-noc`  
**Base commit:** `b9f0c6b` + validation `897408c`  
**Scope:** Docker runtime hotfix — no real device SSH (flag off)

---

## Resumo executivo

Hotfix aplicado. MVP L2 **testável em Docker** para banco + API + auth. **SSH para device real** continua **OFF** (`L2_DISCOVER_SSH_ENABLED=false` default).

| Critério GO device real | Status |
|-------------------------|--------|
| Migration L2 aplicada | **YES** (`tools/l2-schema-apply.sql`) |
| Docker rebuild API | **YES** |
| API health | **YES** |
| Endpoints com auth | **YES** |
| `run_id` consistente | **YES** |
| Erro device inválido | **YES** 404 |
| Erro sem credencial | **YES** 422 `DEVICE_CREDENTIALS_NOT_CONFIGURED` |
| Credenciais padrão projeto | **YES** `ipAddress` + `decrypt(passwordEncrypted)` |
| Redact raw output | **YES** `redactL2Output()` |
| Comandos destrutivos | **YES** (allowlist inalterada) |
| SSH device real | **NO-GO** até `L2_DISCOVER_SSH_ENABLED=true` |

---

## Correções no código

### 1. `run_id` único

- `createL2DiscoveryRunId()` gera ID uma vez.
- `startL2DiscoveryJob(deviceId, runId)` grava job com esse ID.
- HTTP 202 retorna o **mesmo** `run_id`.
- `runL2DiscoveryJob(deviceId, runId, sshConfig)` usa o ID recebido.
- Poll `GET /discovery-jobs/:runId` → **RUN_ID_MATCH true** (testado).

### 2. Credenciais device

- Novo `device-ssh-config.ts`: `resolveDeviceSshConfig(device)`.
- Padrão igual `devices.ts` test-connection: `ipAddress`, `sshPort`, `username`, `decrypt(passwordEncrypted)`.
- Erro `422` + `error: DEVICE_CREDENTIALS_NOT_CONFIGURED` (sem log de senha).

### 3. Rotas Express (bug crítico)

- Removido prefixo duplicado `/api` em `l2circuits.routes.ts`.
- App monta em `/api` → rotas corretas: `/api/l2-circuits`, etc.

### 4. Redact L2

- `redact-l2-output.ts`: `redactL2Output()`, `truncateL2Evidence()`.
- Parser usa `truncateL2Evidence()` antes de persistir `rawEvidence`.

### 5. SSH guard (sem device real no hotfix)

- `L2_DISCOVER_SSH_ENABLED` default `false` em `docker-compose.yml` + `.env.example`.
- Job com credencial válida → `202` + job `failed` com mensagem clara (sem TCP SSH).

### 6. Migration não interativa

- `tools/l2-schema-apply.sql` — `CREATE TABLE IF NOT EXISTS` + índices.
- `drizzle-kit push` no migrate container **ainda falha** (prompt `compliance_policy_profiles`) — L2 aplicado via SQL idempotente.

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `l2circuits.controller.ts` | run_id, credenciais, erros controlados |
| `l2circuits.service.ts` | start/run job, SSH flag |
| `l2circuits.routes.ts` | fix path `/l2-circuits/*` |
| `device-ssh-config.ts` | novo |
| `redact-l2-output.ts` | novo |
| `parsers/huawei-vrp-l2.ts` | redact + truncate |
| `docker-compose.yml` | `L2_DISCOVER_SSH_ENABLED` |
| `.env.example` | flag documentada |
| `tools/l2-schema-apply.sql` | novo |
| `tools/l2-api-smoke.mjs` | smoke helper |
| `lib/db/package.json` | script `push-l2` (opcional) |

---

## Comandos executados

```bash
# Schema L2 (non-interactive)
docker exec -i netops-db psql -U netops -d netops < tools/l2-schema-apply.sql
docker exec netops-db psql -U netops -d netops -c '\dt l2_*'

# Rebuild API
docker compose up -d --build api

# Typecheck
cd workspace && pnpm --filter @workspace/api-server run typecheck

# Bundle check
docker exec netops-api grep -c 'l2-circuits' /app/workspace/artifacts/api-server/dist/index.mjs
# → 4

# Health
docker exec netops-api node -e "fetch('http://127.0.0.1:8080/api/healthz').then(r=>r.json()).then(console.log)"
# → {"status":"ok"}

# API smoke (inside container)
docker cp tools/l2-api-smoke.mjs netops-api:/tmp/
docker exec netops-api node /tmp/l2-api-smoke.mjs
docker exec -e L2_TEST_DEVICE_ID=36 netops-api node /tmp/l2-api-smoke.mjs
```

---

## Resultado dos testes

| Teste | Esperado | Resultado |
|-------|----------|-----------|
| `pnpm typecheck` api-server | PASS | **PASS** |
| Tabelas `l2_circuits`, `l2_discovery_jobs` | existem | **PASS** |
| Bundle contém `l2-circuits` | >0 | **PASS** (4) |
| `GET /api/healthz` | 200 | **PASS** |
| Login + `GET /api/l2-circuits` | 200 | **PASS** `{"circuits":[],"total":0}` |
| `GET .../discovery-jobs/fake` | 404 | **PASS** |
| `POST discover` device 999999 | 404 | **PASS** |
| `POST discover` device sem senha | 422 | **PASS** `DEVICE_CREDENTIALS_NOT_CONFIGURED` |
| `POST discover` device 1 (cred OK) | 202 | **PASS** |
| Poll job mesmo `run_id` | 200 match | **PASS** `RUN_ID_MATCH true` |
| Job status SSH off | failed msg | **PASS** (sem SSH TCP) |
| Redact password/community | redacted | **PASS** (tsx manual) |

**Não executado:** SSH real no equipamento Huawei.

---

## Auth — exemplo curl (sem segredo real)

Projeto usa cookie `netops_session` **ou** header `Authorization: Bearer <token>`.

```bash
# 1) Login (substitua email/senha pelos valores do .env ADMIN_*)
curl -s -c /tmp/netops.cookies -X POST http://localhost:8080/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<ADMIN_EMAIL>","password":"<ADMIN_PASSWORD>"}'

# 2) Listar circuitos
curl -s -b /tmp/netops.cookies http://localhost:8080/api/l2-circuits

# Alternativa Bearer (token vem no JSON do login)
# curl -s -H "Authorization: Bearer <token>" http://localhost:8080/api/l2-circuits

# 3) Discovery (só após L2_DISCOVER_SSH_ENABLED=true para coleta real)
curl -s -b /tmp/netops.cookies -X POST http://localhost:8080/api/l2-circuits/discover \
  -H 'Content-Type: application/json' \
  -d '{"device_id":1}'

# 4) Poll job
curl -s -b /tmp/netops.cookies http://localhost:8080/api/l2-circuits/discovery-jobs/<run_id>
```

---

## Parser — pendência documentada (não blocker)

- `display interface brief` — fixture existe; parser **não** gera `vlan` / `dot1q_subif` ainda.
- `display interface description`, `mac-address vsi/vlan` — allowlist OK; parser **não** implementado.
- Planejado fase pós-MVP; não bloqueia hotfix runtime.

---

## Problemas remanescentes

| Item | Nota |
|------|------|
| `drizzle-kit push` migrate service | Falha TTY em constraint compliance — usar `tools/l2-schema-apply.sql` ou `push-l2` quando suportado |
| Device test row `l2-hotfix-no-cred` (id 36) | Inserido só para smoke 422 — pode remover após review |
| Upsert circuitos | Insert por run; duplicatas em re-runs |
| `listL2Circuits` filtros | Mutuamente exclusivos (pré-existente) |

---

## Go / No-Go

### Docker + API (sem device)

## **GO**

### Device Huawei real

## **NO-GO** até:

1. `L2_DISCOVER_SSH_ENABLED=true` no `.env` + rebuild api  
2. Confirmar SSH read-only allowlist em lab  
3. `POST discover` + poll + comparar CLI vs DB  
4. Remover device test `l2-hotfix-no-cred` se não quiser no inventário

---

## Referências

- `reports/l2-circuits/MVP_VALIDATION_REPORT.md`
- `docs/l2-circuits/MVP.md`
- `tools/l2-schema-apply.sql`
- `tools/l2-api-smoke.mjs`
