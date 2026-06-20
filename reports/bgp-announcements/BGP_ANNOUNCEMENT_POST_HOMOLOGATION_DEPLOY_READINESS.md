# BGP Announcement Matrix — Post-Homologation Deploy Readiness

## Resumo do status

| Item | Valor |
|------|-------|
| Feature | BGP Announcement Matrix (PR Foundation → PR9) |
| Homologação NOC | **APROVADO COM RESSALVAS** |
| Deploy readiness | **Pronto para deploy controlado em modo seguro** |
| Exec real | **OFF** (default) |
| Rollback real | **OFF** (default) |
| Data | 2026-06-20 |
| Branch | `kgs-145/provisioning-template-registry-fix` |
| Device homologação | `#94 4WNET-BVA-BRT-RB` |

**Recomendação final:** Deploy permitido em ambiente NOC/lab com flags seguras. Execução real e rollback real permanecem bloqueados por default até ciclo NOC humano completo.

---

## Bugs corrigidos na homologação NOC

| # | Bug | Correção | Arquivo |
|---|-----|----------|---------|
| 1 | Schema DB legado (`rows_json`) conflitava com PR9 (`matrix_json`, `is_latest`) — API 500 | Migration reset condicional + reapply 0057–0061 | `0062_bgp_announcement_legacy_schema_reset.sql` |
| 2 | Rollback execute real retornava 409 quando change-plan em `execution_blocked` | Gate aceita `execution_blocked` (igual dry-run rollback) | `bgp-announcements.approval-execution.service.ts:1210` |

Pós-correção: typecheck PASS, full suite 24/24 PASS, e2e PASS.

---

## Arquivos alterados (escopo deploy)

### Migrations (obrigatório no deploy)

| Arquivo | Propósito |
|---------|-----------|
| `0057_bgp_announcement_matrix.sql` | Snapshots, runs, diffs, history |
| `0058_bgp_announcement_change_plans.sql` | Change-plans |
| `0059_bgp_announcement_approval_gate.sql` | Approvals + executions |
| `0060_bgp_announcement_execution_lock_postcheck.sql` | Locks + postchecks |
| `0061_bgp_announcement_rollbacks_history.sql` | Rollbacks |
| `0062_bgp_announcement_legacy_schema_reset.sql` | Reset schema prototype legado |

### Backend / frontend (feature)

- `workspace/artifacts/api-server/src/modules/bgp-announcements/**`
- `workspace/artifacts/api-server/src/lib/env.ts` — flags BGP
- `workspace/artifacts/api-server/src/lib/auth.ts` — RBAC `bgp_announcements.*`
- `workspace/artifacts/api-server/src/routes/index.ts` — router
- `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp/bgp-announcements-preview-modal.tsx`
- `workspace/lib/db/src/schema/bgp_announcements.ts`

### Config / docs / testes / relatórios

- `.env.example` — bloco flags BGP safe defaults
- `docs/bgp-announcements/*` — 8 docs operacionais
- `tools/bgp-announcement-*.mjs` — 24 selftests + full-suite + e2e + noc smoke
- `reports/bgp-announcements/*` — PR reports, homologation, evidence, release notes

---

## Migrations — estado e ordem

### Lab (aplicado)

```
0057 → 0058 → 0059 → 0060 → 0061 → 0062
```

Confirmado em `schema_migrations` do lab. Tabela `bgp_announcement_matrix_snapshots` possui `is_latest`, `matrix_json`, `summary_json`.

### Ambiente novo (sequência segura)

1. `docker compose run --rm migrate` (ou `DATABASE_URL=... node workspace/lib/db/scripts/apply-safe-migrations.mjs`)
2. Se ambiente tinha prototype legado (`rows_json` sem `is_latest`): **0062 roda primeiro** (drop condicional), depois 0057 recria tabelas
3. Ambiente greenfield: 0062 no-op, 0057–0061 criam schema

**Atenção:** 0062 dropa tabelas prototype legado **somente** se detectar coluna `rows_json` sem `is_latest`. Dados prototype serão perdidos — aceitável (não eram schema PR9).

---

## Comandos rodados (pós-homologação)

```bash
cd workspace && pnpm run typecheck
node tools/bgp-announcement-full-suite.mjs
node tools/bgp-announcement-e2e-flow-selftest.mjs
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/netops-manager run build
```

### Resultados

| Comando | Resultado |
|---------|-----------|
| typecheck | **PASS** |
| full suite | **PASS** (24/24, ~2.3s) |
| e2e flow | **PASS** |
| web build | **PASS** |

Homologação NOC API smoke (device 94): **PASS** (30/32 checks) — ver `noc-homologation-evidence.json`.

---

## Ressalvas remanescentes

1. Device 94: **0 origin_target** (5 customer_import only) — validar ORIGIN em outro device
2. Community sets / upstream audit vazios no device 94
3. UI browser não navegada (MCP sem localhost) — NOC humano pendente
4. Prints não capturados
5. Postcheck change-plan inconclusivo sem write real — **esperado** em modo seguro
6. `.js` artifacts em `api-server/src/modules/bgp-announcements/` — não commitar (build artifacts)

---

## Checklist de deploy seguro

### Antes do deploy

- [ ] Backup banco (`pg_dump` ou snapshot volume)
- [ ] Aplicar migrations 0057–0062 em ordem
- [ ] Conferir `.env` / `.env.example` flags BGP
- [ ] `BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false`
- [ ] `BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false`
- [ ] `BGP_ANNOUNCEMENT_REAL_EXECUTION_PROVIDER=disabled`
- [ ] `CONFIG_APPLY_ENABLED=false`
- [ ] Rebuild containers: `tools/apply-containers.sh api web`
- [ ] `cd workspace && pnpm run typecheck`
- [ ] `node tools/bgp-announcement-full-suite.mjs`
- [ ] `node tools/bgp-announcement-e2e-flow-selftest.mjs`
- [ ] curl matrix latest (auth): `GET /api/bgp/announcements/matrix/latest?deviceId=<id>`
- [ ] POST execute retorna blocked
- [ ] POST rollback execute retorna blocked
- [ ] UI code review: sem botão exec real (badge "Execução real bloqueada")

### Depois do deploy

- [ ] Abrir `/bgp/announcements` no browser
- [ ] Refresh em device conhecido (ex. #94)
- [ ] Gerar preview (célula On/P2)
- [ ] Salvar draft + solicitar aprovação
- [ ] Dry-run — confirmar logs `would_execute`
- [ ] Postcheck (pode ser inconclusivo sem write)
- [ ] Rollback dry-run + postcheck
- [ ] Consultar tab Histórico
- [ ] Confirmar audit logs (change-plan events)
- [ ] **Não** ligar exec real / rollback real

---

## Próximo ciclo NOC humano

| # | Ação | Evidência esperada |
|---|------|-------------------|
| 1 | Browser real: `http://localhost:3005/bgp/announcements` | Prints tabs Matriz/Audit/Sets/Plans/History |
| 2 | Validar badges stale, refresh, "Execução real bloqueada" | Screenshot |
| 3 | Modal preview — diff, commands, rollback | Screenshot |
| 4 | Device com **ORIGIN** target na matriz | API + print |
| 5 | Device com **community-sets** populados | Tab Community Sets |
| 6 | Device com **upstream audit** findings | Tab Auditoria Upstreams |
| 7 | Registrar em novo evidence JSON | `noc-homologation-ui-evidence.json` |
| 8 | Manter `EXECUTION_ENABLED=false` / `ROLLBACK_ENABLED=false` | grep .env |

Smoke API repetível:

```bash
set -a && source .env && set +a
BGP_HOMOLOG_DEVICE_ID=94 node tools/bgp-announcement-noc-homologation-smoke.mjs
```

---

## Recomendação final

**Pronto para deploy controlado em modo seguro**, com execução real e rollback real bloqueados por default.

Deploy steps:

1. Commit + push branch
2. Backup DB target
3. Migrate 0057–0062
4. Rebuild api/web
5. Validar smoke + curl
6. NOC humano UI walkthrough (ressalvas pendentes)

**Não habilitar** `BGP_ANNOUNCEMENT_EXECUTION_ENABLED` ou `BGP_ANNOUNCEMENT_ROLLBACK_ENABLED` até pilot lab explícito com runbook.

---

## Commit sugerido

```
feat(bgp-announcements): finalize safe NOC homologation readiness

- PR9 hardening: flags, gates, full suite, e2e, docs
- NOC homologation report + evidence JSON
- Migration 0062 legacy schema reset for prototype DBs
- Fix rollback execute gate for execution_blocked plans
- Deploy readiness report and release notes update
```

**Não incluir no commit:** `*.js` build artifacts em `bgp-announcements/`, `.env` local.
