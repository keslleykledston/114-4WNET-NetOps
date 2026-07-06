# BGP Announcement Matrix - Approval Gate + Dry-Run Scaffold

## Resumo
- PR6 entregou o fluxo operacional read-only para approval gate e dry-run mock.
- Change-plan agora pode pedir aprovação, ser aprovado/rejeitado, rodar dry-run e registrar logs.
- Execução real continua bloqueada por feature flag.
- UI mostra o fluxo na aba Change Plans e no detalhe do change-plan.
- Endpoints novos foram adicionados para approvals e executions.
- Audit logs passam a registrar request, approve, reject, cancel, dry-run started/succeeded/failed e real execution blocked.
- O scaffold grava execution rows e mantém postcheck pendente.
- Nada foi enviado ao roteador.

## Arquivos Alterados
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.controller.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.routes.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.types.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.preview.service.ts`
- `workspace/artifacts/api-server/src/lib/auth.ts`
- `workspace/artifacts/api-server/src/lib/env.ts`
- `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx`
- `workspace/lib/db/src/schema/bgp_announcements.ts`
- `workspace/lib/db/migrations/0059_bgp_announcement_approval_gate.sql`
- `workspace/artifacts/api-server/src/lib/env.js`
- `workspace/artifacts/api-server/src/lib/audit.js`
- `workspace/artifacts/api-server/src/lib/request-context.js`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.js`

## Tabelas e Migração
- `bgp_announcement_approvals`
- `bgp_announcement_executions`
- `bgp_announcement_change_plans.postcheck_required`
- `bgp_announcement_change_plans.postcheck_status`

## Endpoints
- `POST /api/bgp/announcements/change-plans/:id/request-approval`
- `POST /api/bgp/announcements/approvals/:id/approve`
- `POST /api/bgp/announcements/approvals/:id/reject`
- `GET /api/bgp/announcements/approvals`
- `GET /api/bgp/announcements/approvals/:id`
- `POST /api/bgp/announcements/change-plans/:id/dry-run`
- `GET /api/bgp/announcements/executions`
- `GET /api/bgp/announcements/executions/:id`
- `POST /api/bgp/announcements/change-plans/:id/execute` bloqueado

## Fluxo
- Draft -> `pending_approval`
- Approval request cria row em `bgp_announcement_approvals`
- Approve -> `approved`
- Reject -> `rejected`
- Dry-run -> `dry_run_ready` -> `dry_run_running` -> `dry_run_succeeded`
- Dry-run grava `execution_log_json` com `would_execute`
- Real execute sempre retorna bloqueado
- Postcheck fica pendente

## Logs
- `CHANGE_PLAN_APPROVAL_REQUESTED`
- `CHANGE_PLAN_APPROVED`
- `CHANGE_PLAN_REJECTED`
- `CHANGE_PLAN_CANCELLED`
- `CHANGE_PLAN_DRY_RUN_STARTED`
- `CHANGE_PLAN_DRY_RUN_SUCCEEDED`
- `CHANGE_PLAN_DRY_RUN_FAILED`
- `CHANGE_PLAN_REAL_EXECUTION_BLOCKED`

## Testes Rodados
- `cd workspace && pnpm run typecheck`
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

## Resultado
- `pnpm run typecheck`: PASS
- Selftests BGP: PASS

## Limitações
- Execução real não existe neste PR.
- SSH/conector/roteador não foram tocados.
- Postcheck real ainda não roda.
- Approval/request é scaffold operacional, não governança completa.
- UI não expõe botão de execução real.

## Próximo PR
- PR7: postcheck real + execução controlada real sob flag, com rollback/aprovação final e integração operacional completa.
