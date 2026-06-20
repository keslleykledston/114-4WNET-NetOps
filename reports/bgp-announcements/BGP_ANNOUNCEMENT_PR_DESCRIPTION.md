# feat(bgp-announcements): safe BGP announcement matrix workflow

## Contexto

Entrega a **BGP Announcement Matrix** em modo operacional seguro para NOC: observação de matriz, preview read-only, change-plan com approval gate, dry-run sem SSH, postcheck por snapshot, rollback dry-run e timelapse/histórico.

Homologação NOC manual concluída em device **#94 4WNET-BVA-BRT-RB** — **aprovado com ressalvas**.

**Execução real e rollback real permanecem bloqueados por default.**

Branch: `kgs-145/provisioning-template-registry-fix`  
Commits BGP principais: `2304f0e`, `0ef3699`

> **Nota reviewer:** esta branch contém também outras entregas (system-update, vsi-vpls, copilot, tenants, graphify-out). Revisar escopo BGP nos paths listados abaixo.

---

## O que foi entregue

- Matriz real com snapshots / latest / history / timelapse
- Target classification: **ORIGIN** + **customer import** na matriz; **export** e **Cxx upstream audit** fora
- Community resolver, prefix expansion, community-set exact match
- Upstream audit + protected global filters
- Preview read-only (On/P2/P3/Off)
- Change-plan draft + approval gate
- Dry-run sem SSH (`would_execute` only)
- Postcheck por snapshot (simulado)
- Rollback dry-run + rollback postcheck
- UI `/bgp/announcements` (tabs, modal preview, badges stale/refresh/blocked)
- Docs operacionais (`docs/bgp-announcements/*`)
- Relatórios PR1–PR9 + homologação NOC + deploy readiness

---

## Segurança

Flags obrigatórias em deploy seguro:

```
BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false
BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false
BGP_ANNOUNCEMENT_REAL_EXECUTION_PROVIDER=disabled
CONFIG_APPLY_ENABLED=false
```

- POST `/change-plans/:id/execute` → `{ blocked: true, featureFlag: "BGP_ANNOUNCEMENT_EXECUTION_ENABLED" }`
- POST `/change-plans/:id/rollback/execute` → `{ blocked: true, featureFlag: "BGP_ANNOUNCEMENT_ROLLBACK_ENABLED" }`
- UI sem botão de execução real (badge "Execução real bloqueada")
- Dry-run nunca abre SSH

Detalhes: `docs/bgp-announcements/SAFETY_MODEL.md`, `docs/bgp-announcements/FEATURE_FLAGS.md`

---

## Fluxo suportado

```
refresh → matrix/latest → preview → change-plan draft
  → request approval → approve → dry-run → postcheck
  → rollback dry-run → rollback postcheck → history/timelapse
```

Validado NOC (device 94): fluxo completo em modo seguro. Postcheck change-plan inconclusivo sem write real — **esperado**.

---

## Banco / migrations

Aplicar em ordem:

| Migration | Propósito |
|-----------|-----------|
| `0057_bgp_announcement_matrix.sql` | Snapshots, runs, diffs, history |
| `0058_bgp_announcement_change_plans.sql` | Change-plans |
| `0059_bgp_announcement_approval_gate.sql` | Approvals + executions |
| `0060_bgp_announcement_execution_lock_postcheck.sql` | Locks + postchecks |
| `0061_bgp_announcement_rollbacks_history.sql` | Rollbacks |
| `0062_bgp_announcement_legacy_schema_reset.sql` | Reset schema prototype legado (`rows_json` → PR9) |

Ambiente com prototype legado: 0062 drop condicional, depois 0057 recria. Greenfield: 0062 no-op.

---

## Endpoints

Base: `/api/bgp/announcements` — ver `docs/bgp-announcements/API.md`

Principais:
- `GET /matrix/latest`, `POST /matrix/refresh`, `GET /matrix/diff`
- `POST /preview-change`, CRUD `/change-plans`
- Approval: `/change-plans/:id/request-approval`, `/approvals/:id/approve|reject`
- Execution: `/change-plans/:id/dry-run`, `/change-plans/:id/execute` (blocked)
- Postcheck: `/change-plans/:id/postcheck`
- Rollback: `/change-plans/:id/rollback/dry-run`, `/rollback/execute` (blocked)
- `GET /history` (timelapse)

---

## UI

- Rota: `/bgp/announcements`
- Tabs: Matriz, Auditoria Upstreams, Community Sets, Planos, Histórico
- Modal preview com diff, commands, rollback
- Badges: stale, refresh em progresso, execução real bloqueada

---

## Testes

```bash
cd workspace && pnpm run typecheck
node tools/bgp-announcement-full-suite.mjs      # 24/24
node tools/bgp-announcement-e2e-flow-selftest.mjs
PORT=3000 BASE_PATH=/ pnpm --filter @workspace/netops-manager run build
```

Selftests importam módulos `.ts` via **tsx** (sem artifacts `.js` commitados).

Validações pós-push:
- typecheck **PASS**
- full suite **24/24 PASS**
- e2e **PASS**
- web build **PASS**

Smoke NOC API:
```bash
set -a && source .env && set +a
BGP_HOMOLOG_DEVICE_ID=94 node tools/bgp-announcement-noc-homologation-smoke.mjs
```

---

## Homologação NOC

| Item | Resultado |
|------|-----------|
| Status | **Aprovado com ressalvas** |
| Device | `#94 4WNET-BVA-BRT-RB` |
| Export fora matriz | OK (0 rows) |
| Cxx fora como target | OK (0) |
| Exec real bloqueada | OK |
| Rollback real bloqueado | OK |
| Dry-run sem SSH | OK |
| Full suite | 24/24 PASS |

Bugs corrigidos na homologação:
1. Schema DB legado → migration **0062**
2. Rollback execute gate rejeitava plan `execution_blocked` → fix 1 linha

Evidências:
- `reports/bgp-announcements/BGP_ANNOUNCEMENT_NOC_MANUAL_HOMOLOGATION_RESULT.md`
- `reports/bgp-announcements/noc-homologation-evidence.json`
- `reports/bgp-announcements/BGP_ANNOUNCEMENT_POST_HOMOLOGATION_DEPLOY_READINESS.md`

---

## Ressalvas conhecidas

1. Device 94: **0 origin_target** (só customer_import)
2. Community-sets / upstream audit vazios no device 94
3. **UI browser não validada** por humano (curl 200 OK; prints pendentes)
4. Execução real só em lab futuro com flags explícitas
5. Branch inclui escopo além de BGP — revisar diff completo

---

## Checklist reviewer

- [ ] Conferir migrations **0057–0062** (0062 legacy reset)
- [ ] Conferir flags default OFF: `EXECUTION_ENABLED`, `ROLLBACK_ENABLED`
- [ ] Conferir UI sem botão exec real
- [ ] Conferir endpoints execute/rollback execute bloqueados
- [ ] Conferir target classification: export e Cxx fora da matriz
- [ ] Rodar `node tools/bgp-announcement-full-suite.mjs` (24/24)
- [ ] Rodar `node tools/bgp-announcement-e2e-flow-selftest.mjs`
- [ ] Conferir docs `docs/bgp-announcements/*`
- [ ] Conferir relatórios NOC em `reports/bgp-announcements/`
- [ ] Confirmar **sem artifacts `.js`/build** commitados em `api-server/src/`
- [ ] Revisar escopo não-BGP na branch (system-update, vsi-vpls, copilot, graphify-out)

---

## Checklist deploy seguro

### Antes

- [ ] Backup banco
- [ ] Aplicar migrations 0057–0062
- [ ] Conferir `.env`: execution/rollback OFF, provider `disabled`
- [ ] `cd workspace && pnpm run typecheck`
- [ ] `node tools/bgp-announcement-full-suite.mjs`
- [ ] `node tools/bgp-announcement-e2e-flow-selftest.mjs`
- [ ] `PORT=3000 BASE_PATH=/ pnpm --filter @workspace/netops-manager run build`
- [ ] Rebuild: `tools/apply-containers.sh api web`
- [ ] curl health + `GET /api/bgp/announcements/matrix/latest?deviceId=<id>`
- [ ] POST execute → blocked; POST rollback execute → blocked

### Depois

- [ ] Abrir `/bgp/announcements`
- [ ] Refresh device conhecido
- [ ] Preview → draft → approval → dry-run → postcheck
- [ ] Rollback dry-run → rollback postcheck
- [ ] History/timelapse
- [ ] Confirmar logs audit
- [ ] Confirmar exec real + rollback real bloqueados
- [ ] **Não** ligar flags de execução real

---

## Fora de escopo

- Execução real em device (SSH/write)
- Rollback real em device
- Provider `connector_scaffold` em produção
- Validação UI humana completa (próximo ciclo NOC)
- Habilitar `BGP_ANNOUNCEMENT_EXECUTION_ENABLED=true`

---

## Comentário curto para PR

BGP Announcement Matrix entregue em modo seguro. Fluxo validado: refresh → preview → draft → approval → dry-run → postcheck → rollback dry-run → rollback postcheck. Execução real e rollback real seguem OFF por default. Full suite 24/24, e2e e web build PASS.
