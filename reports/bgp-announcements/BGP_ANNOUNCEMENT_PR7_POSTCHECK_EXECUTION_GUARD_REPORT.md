# BGP Announcement Matrix - PR7 Postcheck Execution Guard

## Resumo

PR7 fechou a base de operacao controlada da feature.

- Execution lock operacional entrou.
- Postcheck real entrou.
- Controlled execution foi preparado, mas continua bloqueado por flag default.
- O fluxo agora tem: lock, guard, execution scaffold, postcheck por snapshot e audit logs.
- Execucao real segue desligada por padrao.

## O que foi implementado

- Lock por alvo de execucao.
- Guard de execucao real com validacoes de approval, dry-run, snapshot, permissao, risk e lock.
- Postcheck que dispara refresh, gera snapshot novo e compara esperado vs observado.
- Estado de postcheck salvo no change-plan.
- UI com botao de postcheck e resumo do resultado.
- Endpoints de postcheck e execute guardado.

## Arquivos alterados

### Backend

- [workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts)
- [workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.controller.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.controller.ts)
- [workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.routes.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.routes.ts)
- [workspace/artifacts/api-server/src/lib/env.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/lib/env.ts)
- [workspace/artifacts/api-server/src/lib/auth.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/lib/auth.ts)
- [workspace/lib/db/src/schema/bgp_announcements.ts](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/lib/db/src/schema/bgp_announcements.ts)
- [workspace/lib/db/migrations/0060_bgp_announcement_execution_lock_postcheck.sql](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/lib/db/migrations/0060_bgp_announcement_execution_lock_postcheck.sql)

### Frontend

- [workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx)

### JS shims

- [workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.service.js](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.service.js)
- [workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.refresh.service.js](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.refresh.service.js)

### Selftests

- [tools/bgp-announcement-execution-lock-selftest.mjs](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/tools/bgp-announcement-execution-lock-selftest.mjs)
- [tools/bgp-announcement-postcheck-selftest.mjs](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/tools/bgp-announcement-postcheck-selftest.mjs)
- [tools/bgp-announcement-real-execution-guard-selftest.mjs](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/tools/bgp-announcement-real-execution-guard-selftest.mjs)

## Tabelas e migrations

### Novas tabelas

- `bgp_announcement_execution_locks`
- `bgp_announcement_postchecks`

### Campos existentes reforcados

- `bgp_announcement_change_plans.postcheck_required`
- `bgp_announcement_change_plans.postcheck_status`

### Campos das tabelas novas

- Lock: `device_id`, `target_policy_name`, `node`, `upstream_circuit_id`, `change_plan_id`, `execution_id`, `status`, `locked_by`, `locked_at`, `expires_at`, `released_at`, `release_reason`
- Postcheck: `change_plan_id`, `execution_id`, `device_id`, `expected_snapshot_id`, `observed_snapshot_id`, `expected_state`, `observed_state`, `expected_community`, `observed_community`, `status`, `diff_json`, `findings_json`

## Endpoints

### Novos ou reforcados

- `POST /api/bgp/announcements/change-plans/:id/postcheck`
- `POST /api/bgp/announcements/change-plans/:id/execute`

### Fluxo atual

- `GET /api/bgp/announcements/matrix/latest`
- `POST /api/bgp/announcements/matrix/refresh`
- `GET /api/bgp/announcements/change-plans`
- `GET /api/bgp/announcements/change-plans/:id`
- `POST /api/bgp/announcements/change-plans/:id/request-approval`
- `POST /api/bgp/announcements/change-plans/:id/dry-run`
- `POST /api/bgp/announcements/change-plans/:id/postcheck`
- `POST /api/bgp/announcements/change-plans/:id/execute`

## Execution lock

- Lock criado por `device_id + target_policy_name + node + upstream_circuit_id`.
- Lock ativo bloqueia outra execucao.
- Lock expirado nao bloqueia.
- Lock e liberado com status `released` ou `failed`.
- Audit logs:
  - `EXECUTION_LOCK_ACQUIRED`
  - `EXECUTION_LOCK_RELEASED`
  - `EXECUTION_LOCK_ACTIVE`
  - `EXECUTION_LOCK_ACQUIRE_FAILED`
  - `EXECUTION_LOCK_RELEASE_FAILED`

## Real execution guard

Validacoes cobertas no guard:

- flag `BGP_ANNOUNCEMENT_EXECUTION_ENABLED`
- approval aprovado
- dry-run concluido
- postcheck required
- lock operacional
- snapshot base existe e segue latest
- target modifiable
- target nao e export
- target nao e audit-only
- refresh em andamento
- permissao `execute.real`
- risk nao critical
- provider nao disabled

Quando a flag esta `false`, a rota `execute` continua bloqueada.

## Postcheck

- Postcheck dispara refresh da matriz.
- Novo snapshot observado e comparado com o preview/base.
- Compara:
  - estado esperado vs observado
  - community esperada vs observada
  - target/upstream ainda resolvidos
  - conflito ainda presente ou nao
  - audit upstream critico novo
- Status salvo:
  - `pending`
  - `running`
  - `succeeded`
  - `failed`
  - `inconclusive`
  - `skipped`

## UI

- Aba Change Plans recebeu:
  - botao `Rodar postcheck`
  - badge de status do postcheck
  - snapshot observado
  - diff do postcheck
- A tela segue sem botao de execucao real quando a flag esta desligada.

## Testes rodados

### Typecheck

- `cd workspace && pnpm run typecheck`

Resultado:

- PASS

### Selftests BGP

Rodados e aprovados:

- `node tools/bgp-announcement-snapshot-selftest.mjs`
- `node tools/bgp-announcement-refresh-flow-selftest.mjs`
- `node tools/bgp-announcement-target-classification-selftest.mjs`
- `node tools/bgp-announcement-community-resolver-selftest.mjs`
- `node tools/bgp-announcement-prefix-expansion-selftest.mjs`
- `node tools/bgp-announcement-matrix-cells-selftest.mjs`
- `node tools/bgp-announcement-community-set-match-selftest.mjs`
- `node tools/bgp-protected-global-filter-selftest.mjs`
- `node tools/bgp-upstream-audit-local-as-selftest.mjs`
- `node tools/bgp-upstream-audit-conflict-selftest.mjs`
- `node tools/bgp-announcement-findings-refinement-selftest.mjs`
- `node tools/bgp-announcement-preview-compiler-selftest.mjs`
- `node tools/bgp-announcement-change-plan-selftest.mjs`
- `node tools/bgp-announcement-approval-gate-selftest.mjs`
- `node tools/bgp-announcement-dry-run-execution-selftest.mjs`
- `node tools/bgp-announcement-execution-block-selftest.mjs`
- `node tools/bgp-announcement-execution-lock-selftest.mjs`
- `node tools/bgp-announcement-postcheck-selftest.mjs`
- `node tools/bgp-announcement-real-execution-guard-selftest.mjs`

## Falhas encontradas e correcoes

- Faltavam shims JS para `bgp-announcements.service.js` e `bgp-announcements.refresh.service.js`.
- O helper de execucao real puxava dependencias cedo demais; foi trocado para import dinamico dentro das funcoes.
- A comparacao de postcheck precisava de cast no snapshot observado para passar no typecheck.

## Limitacoes

- Execucao real continua bloqueada por `BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false`.
- Provider real default continua `disabled`.
- Nao ha SSH real nem apply real neste PR.
- Postcheck depende de refresh/coleta da matriz.
- O scaffold de execucao real e mockado/simulado, pronto para lab.

## Proximo PR recomendado

PR8:

- ligacao do provider real em lab
- step de postcheck automatico apos execucao real
- consolidacao de execution logs e result schema
- UI de detalhe de execucao/postcheck mais completa
- hardening de lock expiry e cleanup
