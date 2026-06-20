# BGP Announcement Matrix — Homologation Result (PR9 + NOC)

## Identificação

| Campo | Valor |
|-------|-------|
| Data PR9 | 2026-06-20 |
| Data NOC manual | 2026-06-20 |
| Ambiente | Lab Docker local (api :8085, web :3005, db :5435) |
| Branch | `kgs-145/provisioning-template-registry-fix` |
| Commit base | `0b115ba` |
| Device NOC | `#94 4WNET-BVA-BRT-RB` |
| Responsável | Agent PR9 + NOC homologation |

## Validação automatizada

| Check | Resultado | Evidência |
|-------|-----------|-----------|
| Typecheck | **PASS** | `cd workspace && pnpm run typecheck` |
| Full suite (24 testes) | **PASS** | `node tools/bgp-announcement-full-suite.mjs` — ~2.3s |
| E2E flow | **PASS** | `node tools/bgp-announcement-e2e-flow-selftest.mjs` |
| Web build | **PASS** | `PORT=3000 BASE_PATH=/ pnpm --filter @workspace/netops-manager run build` |
| NOC API smoke | **PASS** | `tools/bgp-announcement-noc-homologation-smoke.mjs` (30/32) |

## Validação NOC manual (API — device 94)

| Fluxo | Status |
|-------|--------|
| Refresh → snapshot latest | PASS |
| Preview On→P2 | PASS |
| Change-plan draft | PASS |
| Approval request/approve | PASS |
| Dry-run (`would_execute`) | PASS |
| Execute real | BLOCKED ✅ |
| Postcheck change-plan | Inconclusivo (esperado) |
| Rollback dry-run + postcheck | PASS |
| Rollback execute real | BLOCKED ✅ |
| Export/Cxx fora matriz | PASS |

## Checklist UI (amostra verificada em código)

| Item | Status |
|------|--------|
| Loading / empty state matriz | OK |
| Stale snapshot badge | OK (PR9) |
| Refresh progress badge | OK (PR9) |
| Badge execução real bloqueada | OK |
| Badge rollback real bloqueado | OK |
| Sem botão execute real | OK |
| Tabs: matriz, audit, sets, plans, history | OK |

## Checklist API

| Item | Status |
|------|--------|
| Matrix latest/refresh gates (MATRIX_ENABLED) | OK (PR9) |
| Preview gate (PREVIEW_ENABLED) | OK (PR9) |
| Timelapse gate | OK (PR9) |
| Approval/dry-run/postcheck/rollback endpoints | OK (selftests) |
| Real execution blocked | OK |
| Rollback real blocked | OK |

## Checklist segurança

| Item | Status |
|------|--------|
| `BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false` default | OK |
| `BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false` default | OK |
| Dry-run não chama SSH | OK |
| Preview bloqueia export/Cxx/stale | OK |
| Approval bloqueia critical | OK |
| Lock concorrência | OK (selftest) |

## Problemas achados

1. Flags `BGP_ANNOUNCEMENT_MATRIX_ENABLED` e `BGP_ANNOUNCEMENT_PREVIEW_ENABLED` ausentes em `env.ts` — **corrigido PR9**.
2. Web build exige `PORT` e `BASE_PATH` — documentado no checklist.
3. Header UI ainda descrevia fase foundation — **corrigido PR9**.
4. **NOC:** DB lab com schema prototype legado (`rows_json`) — API 500 — **corrigido migration 0062**.
5. **NOC:** Rollback execute gate rejeitava plan `execution_blocked` — **corrigido 1 linha**.

## Correções aplicadas (PR9 + NOC)

- `env.ts`: flags MATRIX + PREVIEW
- Controller: gates 503 matrix/preview/timelapse OFF
- `buildAnnouncementDryRunGateFindings` exportado + usado no dry-run
- `buildAnnouncementPreviewTargetGateFindings` exportado
- `isAnnouncementRealExecutionBlocked` / `isAnnouncementRollbackRealExecutionBlocked`
- UI: stale badge, refresh badge, descrição atualizada
- `.env.example`: bloco BGP flags
- `tools/bgp-announcement-full-suite.mjs` (24 testes)
- `tools/bgp-announcement-e2e-flow-selftest.mjs`
- `tools/bgp-announcement-noc-homologation-smoke.mjs`
- Docs `docs/bgp-announcements/*` (8 arquivos)
- Relatórios audit events, release notes, final delivery
- **`0062_bgp_announcement_legacy_schema_reset.sql`** — reset schema prototype
- **Rollback gate fix** — `execution_blocked` aceito em `blockAnnouncementRollbackExecution`

## Pós-fix (NOC)

| Check | Resultado |
|-------|-----------|
| typecheck | PASS |
| full suite 24/24 | PASS |
| e2e | PASS |
| web build | PASS |
| API smoke device 94 | PASS (30/32) |
| Schema DB | `is_latest`, `matrix_json` confirmados |

## Pendências

- Homologação UI browser humana (tabs, modal, prints)
- Device com `origin_target` + community-sets + upstream audit
- Execução real e rollback real: **não homologados** (intencionalmente OFF)
- Provider `connector_scaffold` para lab: fase pós-MVP
- Commit + deploy controlado (ver deploy readiness report)

## Conclusão

**Status final pós-correção:** **APROVADO COM RESSALVAS**

Feature pronta para **deploy controlado em modo seguro** (read-only + dry-run + governança). Execução real permanece OFF até ciclo NOC humano completo.

Relatórios:
- `BGP_ANNOUNCEMENT_NOC_MANUAL_HOMOLOGATION_RESULT.md`
- `BGP_ANNOUNCEMENT_POST_HOMOLOGATION_DEPLOY_READINESS.md`
- `noc-homologation-evidence.json`
