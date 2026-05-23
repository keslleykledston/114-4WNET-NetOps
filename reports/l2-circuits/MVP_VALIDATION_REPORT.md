# L2 Circuit Discovery MVP — Validation Report

**Date:** 2026-05-23  
**Commit:** `b9f0c6b` — `feat: add MVP L2 circuit discovery module (Huawei VRP read-only)`  
**Validator:** post-implementation review (no device contact)  
**Rules:** read-only validation; no device changes; no commands outside allowlist

---

## Resumo executivo

O MVP L2 está **bem alinhado** com a stack do projeto (TypeScript / Express / Drizzle / ssh2). Não há Python, FastAPI ou SQLAlchemy no commit. Segurança read-only via allowlist positiva em `huawei-vrp/commands.ts` está **sólida** para os comandos L2 e tokens destrutivos testados.

**Bloqueadores antes de teste em device real:**

| # | Severidade | Item |
|---|------------|------|
| 1 | **BLOCKER** | Tabelas `l2_circuits` / `l2_discovery_jobs` **não existem** no PostgreSQL do Docker em execução — `drizzle-kit push` exige TTY interativo |
| 2 | **BLOCKER** | Container `netops-api` **não contém** rotas L2 (`grep l2-circuits` → 0 no bundle) — imagem de 2026-05-22, anterior ao commit |
| 3 | **BLOCKER** | `POST /discover` usa SSH stub (`hostname` como host, user `admin`, senha vazia) — não reutiliza credenciais do device |
| 4 | **BLOCKER** | `run_id` da resposta HTTP 202 **≠** `run_id` gravado no job (timestamps diferentes) — polling quebra |
| 5 | HIGH | `onConflictDoUpdate({ target: [] })` inválido — **corrigido** nesta validação (insert simples) |
| 6 | MEDIUM | Parser ignora `display interface brief/description` e MAC — coleta SSH envia 4 cmds, parser só L2VC+VSI |
| 7 | MEDIUM | Sem sanitização dedicada de output L2 (só truncamento `rawEvidence` 240 chars) |
| 8 | LOW | Índices faltando: `peer_ip`, `last_seen`, status composto |

**Go/No-Go device real:** **NO-GO** até migration + rebuild API + correção controller SSH/`run_id`.

---

## Arquivos revisados

### Commit `b9f0c6b` (16 files, +1470 lines)

| Path | Papel |
|------|--------|
| `workspace/artifacts/api-server/src/modules/l2circuits/*` | Módulo MVP |
| `workspace/lib/db/src/schema/l2circuits.ts` | Schema Drizzle |
| `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/commands.ts` | Allowlist L2 |
| `workspace/artifacts/api-server/src/routes/index.ts` | Mount router |
| `docs/l2-circuits/MVP.md` | Spec operacional |

### Stack confirmada

- **Express 5** — `l2circuits.routes.ts`, `l2circuits.controller.ts`
- **Drizzle ORM** — `l2circuits.ts` schema + `@workspace/db`
- **ssh2** — `collectors/ssh.collector.ts` → `lib/ssh.ts`
- **Sem** `.py`, FastAPI, SQLAlchemy no diff

---

## Validação de segurança

### Allowlist positiva (`validateReadonlyCommand`)

Comandos L2 do collector validados **antes** do SSH:

```
display mpls l2vc verbose
display vsi verbose
display interface brief
display interface description
```

| Comando | Resultado |
|---------|-----------|
| `display mpls l2vc verbose` | ALLOW |
| `display vsi verbose` | ALLOW |
| `display interface brief` | ALLOW |
| `system-view` | BLOCK |
| `undo x` | BLOCK |
| `reset` | BLOCK |
| `clear bgp` | BLOCK |
| `save` | BLOCK |
| `commit` | BLOCK |
| `delete` | BLOCK |
| `reboot` | BLOCK |
| `format disk` | BLOCK |

### Tokens bloqueados em `BLOCKED_TOKENS`

`system-view`, `configure terminal`, `commit`, `save`, `undo`, `reset`, `clear`, `refresh`, `delete`, `reboot`, `format`, mais padrões BGP write.

### Regras adicionais

- Só comandos que começam com `display` ou `show`
- Allowlist regex explícita (não blacklist-only)
- Collector chama `validateReadonlyCommand` por comando antes de `runSSHCommands`

### Timeout SSH

Via `lib/ssh.ts` (reuso global):

- `readyTimeout` no connect config
- Shell prompt: default **30s** (`waitForShellPrompt`)
- Comandos grandes: até **300s** por comando
- `testSSHConnection`: **10s** connect timeout

### Sanitização / redaction

| Área | Estado |
|------|--------|
| `rawEvidence` | Truncado a 240 chars no parser |
| Módulo L2 | **Sem** redaction de password/secret no output SSH |
| Discovery evidence | `evidence-store.ts` redige password/community/token (outro módulo) |
| Audit | `sanitizeAuditMetadata` em `lib/audit.ts` |

**Gap:** outputs SSH L2 persistidos podem conter dados sensíveis se o device imprimir; recomendado reutilizar padrão `evidence-store` antes de `rawEvidence`.

### Risco operacional (sem alterar device)

`POST /api/l2-circuits/discover` **não foi invocado** nesta validação (evita SSH acidental). Se invocado no container atual, tentaria SSH com credenciais inválidas — falha rápida, mas gera ruído de auth no equipamento se host estiver errado.

---

## Validação de banco / migration

### Schema `l2_circuits`

| Campo | Tipo | Obrigatório | OK |
|-------|------|-------------|-----|
| `id` | serial PK | sim | ✓ |
| `device_id` | FK → devices CASCADE | sim | ✓ |
| `circuit_type` | text | sim | ✓ |
| `name` | text | sim | ✓ |
| `vc_id`, `vsi_name`, `peer_ip`, … | text/int nullable | parcial | ✓ |
| `findings` | jsonb default `[]` | sim | ✓ |
| `first_seen`, `last_seen` | timestamp | sim | ✓ |
| `discovery_run_id` | text | sim | ✓ |

### Schema `l2_discovery_jobs`

| Campo | OK |
|-------|-----|
| `run_id` UNIQUE | ✓ |
| `device_id` FK | ✓ |
| `status` pending/running/completed/failed | ✓ |
| `circuit_count`, `findings_count` | ✓ |

### Índices existentes

**`l2_circuits`:** `device_id`, `circuit_type`, `vc_id`, `vsi_name`, `discovery_run_id`, `(device_id, created_at)`

**`l2_discovery_jobs`:** `run_id`, `device_id`, `status`, `created_at`

### Índices sugeridos (mínimos)

```sql
CREATE INDEX l2_circuits_peer_ip_idx ON l2_circuits (peer_ip);
CREATE INDEX l2_circuits_last_seen_idx ON l2_circuits (last_seen DESC);
CREATE INDEX l2_circuits_device_last_seen_idx ON l2_circuits (device_id, last_seen DESC);
-- Status composto (filtro API previsto em types):
CREATE INDEX l2_circuits_admin_oper_idx ON l2_circuits (admin_status, oper_status);
```

**Unique constraint futuro** (upsert idempotente): `(device_id, circuit_type, coalesce(vc_id,''), coalesce(vsi_name,''), coalesce(local_interface,''))`.

### Estado do banco vivo (Docker `netops-db`)

```
\dt l2_*  →  Did not find any relation named "l2_*"
```

`docker compose run --rm migrate` conectou ao DB mas **falhou** em prompt interativo Drizzle (unique constraint em `compliance_policy_profiles`). Migration L2 **não aplicada** no ambiente local testado.

---

## Validação de parser (fixtures)

Executado com `pnpm dlx tsx` contra fixtures do commit.

### `display mpls l2vc verbose` + `display vsi verbose`

| Métrica | Resultado |
|---------|-----------|
| Circuitos parseados | **6** (2 l2vc, 1 vpws, 3 vsi) |
| `vc_id` | ✓ 1001, 1002, 2001 |
| `vsi_name` | ✓ VSI-VPLS-1..3 |
| `peer_ip` | ✓ |
| `local_interface` | ✓ |
| `admin_status` / `oper_status` | ✓ (raw Huawei: up/down) |
| `description` | ✓ |
| `raw_evidence` | ✓ len=240 |
| VPWS detection | ✓ VC 2001 (`Ethernet VLAN` → `vpws`) |

### `display interface brief` (fixture presente)

| Campo | Resultado |
|-------|-----------|
| circuitos vlan/dot1q | **0** — parser **não implementado** |
| Coleta SSH | Envia comando; parser ignora |

### `display interface description`, `mac-address vsi/vlan`

| Item | Estado |
|------|--------|
| Fixtures | **Ausentes** no commit |
| Parser | **Não implementado** |
| Allowlist | ✓ comandos permitidos em `commands.ts` |

### Findings resolver (fixtures)

`resolveL2Findings` → **2** findings globais (ex.: DESCRIPTION_MISSING, CIRCUIT_DOWN esperados em dataset maior; contagem 2 com attach parcial por nome).

---

## Validação de API

### Rotas registradas (código-fonte)

```
POST /api/l2-circuits/discover
GET  /api/l2-circuits/discovery-jobs/:runId
GET  /api/l2-circuits
GET  /api/l2-circuits/:id
```

Montadas em `routes/index.ts` **após** `authorizeRequest` → exigem sessão autenticada.

### Testes executados (sem device, sem POST discover)

| Teste | Resultado |
|-------|-----------|
| `GET /api/l2-circuits` (host, sem cookie) | **401** Authentication required |
| `GET` inside `netops-api` container | **401** (rota alcançável pelo middleware) |
| Bundle `netops-api` image | **0** ocorrências `l2-circuits` — **código L2 não deployado** |
| Seed/mock listagem | **Não executado** — tabelas inexistentes |

### Ordem de rotas

`discovery-jobs/:runId` registrado **antes** de `/:id` — sem conflito de roteamento.

### Gaps de contrato

- `L2CircuitListFilter.status` definido em types — **não implementado** em `listL2Circuits`
- `limit` / `offset` em types — **não implementados**

---

## Comandos executados

```bash
# Repo / commit
git log -1 --oneline
git show HEAD --stat

# Toolchain
cd workspace && pnpm install
pnpm run typecheck                    # OK
BASE_PATH=/ PORT=5000 pnpm run build  # OK
pnpm --filter @workspace/api-server run typecheck  # OK (pós-fix)

# Parser + segurança
cd workspace/artifacts/api-server
pnpm dlx tsx -e '... parseHuaweiL2Circuits + validateReadonlyCommand ...'

# DB (falhou interativo / password local)
DATABASE_URL=postgresql://netops:netops@127.0.0.1:5432/netops pnpm --filter @workspace/db run push
docker compose run --rm migrate

# Docker estado
docker exec netops-db psql -U netops -d netops -c '\dt l2_*'
docker exec netops-api grep -c 'l2-circuits' .../dist/index.mjs  # → 0

# API smoke (sem auth, sem POST discover)
docker exec netops-api node -e "fetch('http://127.0.0.1:8080/api/l2-circuits')..."
```

**Não executado (proposital):**

- `POST /api/l2-circuits/discover` (SSH → device)
- `docker compose down -v`
- Qualquer comando fora da allowlist no equipamento

---

## Resultado dos testes

| Suite | Existe no projeto? | Resultado |
|-------|-------------------|-----------|
| `pnpm run typecheck` | sim | **PASS** |
| `pnpm run build` | sim | **PASS** |
| `pnpm test` | **não** (sem script test no workspace) | N/A |
| `pnpm lint` | **não** | N/A |
| Parser fixtures (manual tsx) | ad-hoc | **PASS** L2VC/VSI; **FAIL** interface/mac |
| API integração | parcial | **INCONCLUSIVE** (imagem antiga + sem migration) |
| Migration | sim | **FAIL** (TTY + tabelas ausentes) |

---

## Problemas encontrados

### P0 — Bloqueadores

1. **Migration não aplicada** — tabelas L2 ausentes no DB Docker.
2. **API container desatualizado** — sem código L2 no bundle em produção local.
3. **`l2circuits.controller.ts`** — SSH config stub; deve usar `device.ipAddress`, `device.username`, `decrypt(device.passwordEncrypted)`, `device.sshPort` (padrão `device-discovery`).
4. **`run_id` divergente** — handler retorna `disc-l2-${deviceId}-${Date.now()}` na resposta 202, mas service cria outro `runId` internamente.
5. **`onConflictDoUpdate({ target: [] })`** — Drizzle/Postgres inválido em runtime no insert.

### P1 — Alto

6. Parser incompleto vs MVP.md (vlan, dot1q, mac-address, interface description).
7. Coleta envia 4 comandos; 2 outputs descartados pelo parser.
8. Sem testes automatizados no runner formal.

### P2 — Médio

9. Sem redaction SSH no módulo L2.
10. Índices `peer_ip` / `last_seen` ausentes.
11. `listL2Circuits` — filtros mutuamente exclusivos (`if/else if`), não combináveis.
12. `attachFindingsToCircuits` — match por `message.includes(circuit.name)` frágil.

---

## Correções aplicadas (esta validação)

| Arquivo | Mudança |
|---------|---------|
| `l2circuits.service.ts` | Removido `onConflictDoUpdate({ target: [] })`; insert simples por discovery run |

**Não alterado** (fora do escopo “bug único bloqueante DB” / sem feature nova):

- Controller SSH / `run_id`
- Parser interface/mac
- Índices DB
- Rebuild Docker

---

## Pendências

1. Aplicar schema L2 no DB (`drizzle-kit push` interativo ou SQL migration dedicada só L2).
2. `docker compose up -d --build api` (ou `tools/apply-containers.sh api`) com commit atual.
3. Corrigir controller: credenciais device + retornar `run_id` real do service.
4. Testes parser: `interface brief`, `description`, `mac-address` + fixtures.
5. Test runner: mover validação tsx para selftest formal.
6. Redaction em `rawEvidence` / campos description.
7. Índices sugeridos + unique key para upsert futuro.
8. OpenAPI + Orval (rotas L2 ainda fora do `openapi.yaml`).

---

## Plano de teste com device real (read-only)

**Pré-requisitos:** itens 1–3 das pendências resolvidos; operador com role `operator`+; device Huawei VRP cadastrado com SSH OK.

### Fase A — Pré-voo (sem discovery POST)

1. `GET /api/devices/:id` — confirmar IP, username, status SSH.
2. Teste conexão SSH existente na UI/API (`test connection`) — **somente** validação, sem novos comandos L2.
3. Confirmar allowlist: revisar log/API que só dispara `display mpls l2vc verbose`, `display vsi verbose`, `display interface brief`, `display interface description` (e MAC se habilitados depois).

### Fase B — Discovery controlado

1. `POST /api/l2-circuits/discover` `{ "device_id": <id> }` com sessão admin/operator.
2. Anotar `run_id` da resposta; poll `GET /api/l2-circuits/discovery-jobs/:runId` até `completed` ou `failed`.
3. `GET /api/l2-circuits?device_id=<id>` — comparar contagem com CLI manual.

### Fase C — Evidência bruta vs normalizado

No device (operador humano ou capture já existente em lab):

```
display mpls l2vc verbose
display vsi verbose
display interface brief
```

Comparar por circuito:

| Campo normalizado | Fonte CLI |
|------------------|-----------|
| `circuit_type` | VC Type / seção VSI |
| `vc_id` | VC ID |
| `vsi_name` | VSI Name |
| `peer_ip` | Peer IP |
| `local_interface` | Interface(Admin) / Bound Interface |
| `admin_status` / `oper_status` | Admin/Oper Status |
| `description` | Description |
| `raw_evidence` | trecho ≤240 chars da seção |

### Fase D — Critérios de aceite

- [ ] Nenhum comando fora da allowlist nos logs SSH
- [ ] Job `completed` com `circuit_count > 0` (se device tem L2VC/VSI)
- [ ] Findings coerentes (ex. oper down + admin up → CIRCUIT_DOWN)
- [ ] Zero alteração de config no device (sem `system-view`, `commit`, `save`)
- [ ] Audit trail registra discovery sem secrets

### Rollback / abort

- Se SSH lento: respeitar timeout 300s; não reenviar POST em loop.
- Se parser retorna 0 circuitos com output CLI não vazio: **parar** e abrir bug parser — não repetir discovery.

---

## Go / No-Go — teste em device real

| Critério | Status |
|----------|--------|
| Código no container API | **NO** |
| Tabelas DB | **NO** |
| Segurança allowlist | **YES** |
| Parser L2VC/VSI fixtures | **YES** |
| Parser vlan/mac/interface | **NO** |
| Controller SSH pronto | **NO** |
| Polling `run_id` confiável | **NO** |
| Insert DB funcional | **YES** (após fix local + migration) |

### Decisão final

## **NO-GO**

Liberar teste Huawei real somente após: migration L2 aplicada, rebuild `netops-api`, fix controller (`run_id` + credenciais), e smoke autenticado `GET /api/l2-circuits` retornando `200` com lista vazia.

---

## Referências

- `docs/l2-circuits/MVP.md`
- `workspace/artifacts/api-server/src/modules/l2circuits/`
- `workspace/lib/db/src/schema/l2circuits.ts`
- Commit `b9f0c6b`
