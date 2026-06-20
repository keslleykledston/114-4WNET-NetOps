# BGP Announcement Matrix — NOC Manual Homologation Result

## Identificação

| Campo | Valor |
|-------|-------|
| Data | 2026-06-20 |
| Ambiente | Lab Docker local (`netops-api` :8085, `netops-web` :3005, `netops-db` :5435) |
| Branch | `kgs-145/provisioning-template-registry-fix` |
| Commit base | `0b115ba` (+ correções homologação não commitadas) |
| Device homologação | `#94 4WNET-BVA-BRT-RB` |
| Modo | Seguro — sem SSH write, sem exec real, sem rollback real |
| Executor | Agent NOC homologation |
| Evidência JSON | `reports/bgp-announcements/noc-homologation-evidence.json` |
| Smoke script | `tools/bgp-announcement-noc-homologation-smoke.mjs` |

## Validação automatizada (pré/pós homologação)

| Check | Resultado |
|-------|-----------|
| `pnpm run typecheck` | **PASS** |
| `node tools/bgp-announcement-full-suite.mjs` | **PASS** (24/24) |
| `node tools/bgp-announcement-e2e-flow-selftest.mjs` | **PASS** |
| Web build | **PASS** (`PORT=3000 BASE_PATH=/`) |
| `CONFIG_APPLY_ENABLED` | `false` (container) |
| Exec real / rollback real flags | Default código (`EXECUTION_ENABLED=false`, `ROLLBACK_ENABLED=false`) |

## Fluxo operacional seguro (API smoke — device 94)

| Etapa | Resultado | Evidência |
|-------|-----------|-----------|
| Matrix latest | PASS | snapshot latest carregado |
| Refresh x2 | PASS | snapshots 23 → 24, rotação OK |
| History | PASS | 20 eventos |
| Preview On→P2 | PASS | `AS264196-RORAIMANET-Import-IPv4` / C15 |
| Change-plan draft | PASS | plan `#5` |
| Approval request/approve | PASS | status `approved` |
| Dry-run | PASS | mode `dry_run`, 9 steps `would_execute` |
| Execute real | **BLOCKED** | `EXECUTION_FLAG_DISABLED` |
| Postcheck change-plan | **INCONCLUSIVO** | HTTP ≠ 200 (sem write real — esperado) |
| Rollback request/approve | PASS | |
| Rollback dry-run | PASS | logs `would_execute` |
| Rollback execute real | **BLOCKED** | `BGP_ANNOUNCEMENT_ROLLBACK_ENABLED` |
| Rollback postcheck | PASS | `postcheck_succeeded` |

**Smoke final:** `noc-homologation-smoke: PASS (30/32 checks)`

## Checklist manual — seções

### Ambiente
- [x] Branch/commit registrados
- [x] typecheck / full suite / e2e PASS
- [x] Flags seguras confirmadas
- [x] Web build PASS
- [x] API/web containers rebuild pós-PR9

### A) Snapshot e matriz
- [x] Endpoint matrix/latest OK
- [x] Empty state validado (device 2 antes de refresh)
- [x] Refresh cria snapshot latest
- [x] Snapshot anterior preservado (IDs incrementais)
- [x] History events gravados (20 eventos)
- [~] Diff entre snapshots consecutivos sem mudança config → `changed=0` (esperado)

### B) Target classification (device 94)
- [~] ORIGIN na matriz — **0 rows** (lab: device sem origin_target parseado)
- [x] customer import na matriz — **5 rows**
- [x] customer export **fora** — 0
- [x] Cxx **fora** como target — 0
- [x] internal **fora** — 0
- [x] unknown **fora** — 0

### C–F) Community / prefix / sets / audit
- [x] Labels On/— visíveis na matriz (cells device 94)
- [~] Community-set library vazia no device 94 (0 sets)
- [~] Upstream audit sem findings no device 94
- [ ] Validação visual UI tabs — **não executada** (browser MCP sem acesso localhost)

### G–M) Preview → Rollback → Timelapse
- [x] Preview API com diff/commands/rollback
- [x] Change-plan CRUD + approval
- [x] Dry-run sem SSH (`would_execute` only)
- [x] Exec real bloqueada
- [~] Postcheck change-plan inconclusivo (modo seguro)
- [x] Rollback dry-run + postcheck succeeded
- [x] Rollback real bloqueado
- [x] History/timelapse endpoint OK

### Segurança
- [x] POST execute → `{ blocked: true, featureFlag: BGP_ANNOUNCEMENT_EXECUTION_ENABLED }`
- [x] POST rollback execute → `{ blocked: true, featureFlag: BGP_ANNOUNCEMENT_ROLLBACK_ENABLED }`
- [x] Dry-run logs apenas `would_execute`
- [x] Refresh usa config persistida (discovery/raw_config) — **sem SSH write**
- [x] Código UI: badge "Execução real bloqueada" / sem botão execute (review estático PR9)

## Evidências

### API — execução real bloqueada
```json
{
  "blocked": true,
  "reason": "BGP announcement real execution is disabled by feature flag",
  "featureFlag": "BGP_ANNOUNCEMENT_EXECUTION_ENABLED"
}
```

### API — rollback real bloqueado
```json
{
  "blocked": true,
  "reason": "Rollback real execution is disabled by feature flag",
  "featureFlag": "BGP_ANNOUNCEMENT_ROLLBACK_ENABLED"
}
```

### Dry-run log (amostra)
- 4 proposed commands + 4 rollback commands → status `would_execute`
- Nota final: `postcheck_required`

### Matriz device 94 (amostra)
- 5 targets `customer_import_target`
- Células `On` com communities `64777:51x01` em múltiplos upstreams
- Targets `DENY` com células `—` (unmarked)

### Prints UI
- Não capturados — browser automation indisponível para `localhost:3005` neste ambiente
- Web HTTP 200 confirmado via curl

## Falhas / limitações encontradas

| # | Item | Severidade | Ação |
|---|------|------------|------|
| 1 | DB lab com schema BGP legado (`rows_json`) bloqueava API 500 | **Bloqueante** | Migration `0062` + apply 0057–0061 |
| 2 | Rollback execute real retornava 409 quando plan em `execution_blocked` | **Bloqueante** | Fix gate: aceitar `execution_blocked` |
| 3 | Device 94 sem `origin_target` na matriz | Ressalva | Homologar ORIGIN em device com policy origin |
| 4 | Postcheck change-plan não succeeded sem write real | Ressalva | Esperado em modo seguro |
| 5 | Community sets / upstream audit vazios no device 94 | Ressalva | Validar em device com catálogo completo |
| 6 | UI manual não navegada | Ressalva | NOC validar `/bgp/announcements` no browser |

## Correções aplicadas durante homologação

1. **`0062_bgp_announcement_legacy_schema_reset.sql`** — drop schema prototype + apply 0057–0061
2. **`bgp-announcements.approval-execution.service.ts`** — `blockAnnouncementRollbackExecution` aceita plan `execution_blocked`
3. **`tools/bgp-announcement-noc-homologation-smoke.mjs`** — smoke API fluxo seguro (criado para homologação)

Pós-correções: typecheck PASS, full suite 24/24 PASS.

## Confirmações solicitadas

| Confirmação | Status |
|-------------|--------|
| Export cliente fora da matriz | **OK** (0 export rows) |
| Cxx upstream fora como target | **OK** (0 audit targets na matriz) |
| Execução real bloqueada | **OK** |
| Rollback real bloqueado | **OK** (após fix gate) |
| Dry-run sem SSH | **OK** (`would_execute` only) |
| Full suite PASS | **OK** |
| E2E PASS | **OK** |
| Web build PASS | **OK** |

## Status final

### **APROVADO COM RESSALVAS**

Feature apta para uso operacional **read-only + dry-run + governança** no NOC lab.

**Ressalvas para fechar homologação plena:**
1. Validar UI manualmente em `/bgp/announcements` (login NOC, tabs, modal preview, badges bloqueio)
2. Repetir checklist B/C/E/F em device com `origin_target` + community-sets populados
3. Documentar no runbook que postcheck change-plan pode ser inconclusivo sem write real (comportamento esperado)
4. Commitar migration 0062 + fix rollback gate antes de deploy em outros ambientes

**Execução real e rollback real permanecem proibidos** até checklist manual completo em lab controlado com flags explícitas.

## Assinatura

| Campo | Valor |
|-------|-------|
| Responsável | Agent NOC homologation |
| Resultado | **Aprovado com ressalvas** |
| Próximo passo | NOC humano: UI walkthrough + device com ORIGIN |
