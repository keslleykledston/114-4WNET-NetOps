# BGP Announcement Matrix - PR8 Rollback, Timelapse e Confirmação de Estado

## 1. Resumo

PR8 fechou o ciclo operacional de rollback read-only/dry-run e histórico temporal.

- Rollback passou a existir como entidade própria.
- Rollback request, approval, dry-run e postcheck estão expostos na API.
- Rollback real continua bloqueado por flag por padrão.
- Diff entre snapshots agora compara target, cells, community, scope e findings.
- Timelapse agora usa `bgp_announcement_history_events` com eventos reais gerados na refresh.
- UI recebeu tab de Histórico e bloco de rollback no detalhe do change-plan.

## 2. Arquivos alterados

### Backend

- `workspace/artifacts/api-server/src/lib/env.ts`
- `workspace/artifacts/api-server/src/lib/auth.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.approval-execution.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.controller.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.routes.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.refresh.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.snapshot.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.timeline-utils.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.types.ts`

### DB

- `workspace/lib/db/src/schema/bgp_announcements.ts`
- `workspace/lib/db/migrations/0061_bgp_announcement_rollbacks_history.sql`

### Frontend

- `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx`

### Selftests

- `tools/bgp-announcement-rollback-selftest.mjs`
- `tools/bgp-announcement-rollback-postcheck-selftest.mjs`
- `tools/bgp-announcement-snapshot-diff-selftest.mjs`
- `tools/bgp-announcement-timelapse-selftest.mjs`

## 3. Tabelas e migrations

### Nova tabela

- `bgp_announcement_rollbacks`

### Campos principais

- `change_plan_id`
- `execution_id`
- `approval_id`
- `device_id`
- `base_snapshot_id`
- `rollback_to_snapshot_id`
- `current_snapshot_id`
- `status`
- `mode`
- `requested_by`
- `approved_by`
- `rollback_commands_json`
- `rollback_diff_json`
- `rollback_log_json`
- `postcheck_id`

### Migration nova

- `0061_bgp_announcement_rollbacks_history.sql`

### Timelapse

- Reuso de `bgp_announcement_history_events`
- Refresh agora grava eventos por target/cell/prefix scope

## 4. Endpoints

### Novos

- `GET /api/bgp/announcements/matrix/diff`
- `GET /api/bgp/announcements/history`
- `POST /api/bgp/announcements/change-plans/:id/rollback/request`
- `GET /api/bgp/announcements/rollbacks`
- `GET /api/bgp/announcements/rollbacks/:id`
- `POST /api/bgp/announcements/rollbacks/:id/approve`
- `POST /api/bgp/announcements/rollbacks/:id/reject`
- `POST /api/bgp/announcements/rollbacks/:id/dry-run`
- `POST /api/bgp/announcements/rollbacks/:id/execute`
- `POST /api/bgp/announcements/rollbacks/:id/postcheck`

### Mantidos

- `GET /api/bgp/announcements/matrix/latest`
- `POST /api/bgp/announcements/matrix/refresh`
- `POST /api/bgp/announcements/preview-change`
- `POST /api/bgp/announcements/change-plans`
- `POST /api/bgp/announcements/change-plans/:id/request-approval`
- `POST /api/bgp/announcements/change-plans/:id/dry-run`
- `POST /api/bgp/announcements/change-plans/:id/execute`
- `POST /api/bgp/announcements/change-plans/:id/postcheck`

## 5. Fluxo de rollback

### Request

- Cria rollback ligado ao change-plan.
- Usa `rollbackCommands` do preview.
- Salva `rollback_to_snapshot_id` com base no snapshot base do change-plan.
- Marca status inicial como `pending_approval`.

### Approval

- `approve` muda para `approved`.
- `reject` cancela o rollback.

### Dry-run

- Gera log `would_execute`.
- Não conecta em roteador.
- Mantém rollback em modo `dry_run`.

### Real execution

- Continua bloqueada por `BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false`.
- Mesmo com flag ligada, o guard exige approval/dry-run válidos.

### Postcheck

- Dispara refresh.
- Compara snapshot esperado vs observado.
- Resultados:
  - `postcheck_succeeded`
  - `postcheck_failed`
  - `postcheck_inconclusive`

## 6. Diff entre snapshots

O diff agora compara:

- target adicionado/removido
- upstream/cell alterado
- state alterado
- community alterada
- source alterada
- prefix scope alterado
- finding adicionado/resolvido
- risk alterado

Helper puro criado em `bgp-announcements.timeline-utils.ts`.

## 7. Timelapse

- Endpoint `GET /api/bgp/announcements/history`
- Ordenação cronológica ascendente
- Filtros:
  - `deviceId`
  - `targetPolicyName`
  - `prefix`
  - `upstreamCircuitId`
  - `upstreamName`
  - `family`
  - `dateFrom`
  - `dateTo`
  - `eventType`

Refresh agora grava eventos de:

- `target_added`
- `cell_added`
- `cell_removed`
- `cell_state_changed`
- `prefix_scope_changed`
- `snapshot_generated`

## 8. UI

### Mudanças

- Nova tab `Histórico`
- Filtros de timelapse por target/upstream/prefix
- Tabela de eventos temporal
- Bloco de rollback dentro do modal de change-plan
- Botões:
  - Solicitar rollback
  - Aprovar rollback
  - Rejeitar rollback
  - Rollback dry-run
  - Postcheck rollback

### Estado visível

- Exibe `rollback status`
- Exibe `rollback diff`
- Exibe `rollback log`
- Exibe badge de rollback real bloqueado

## 9. Testes rodados

### Typecheck

- `cd workspace && pnpm run typecheck`

### Selftests

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
- `node tools/bgp-announcement-rollback-selftest.mjs`
- `node tools/bgp-announcement-rollback-postcheck-selftest.mjs`
- `node tools/bgp-announcement-snapshot-diff-selftest.mjs`
- `node tools/bgp-announcement-timelapse-selftest.mjs`

## 10. Limitações

- Rollback real segue bloqueado por flag por padrão.
- Postcheck de rollback ainda usa refresh da matriz como fonte de confirmação.
- Timelapse depende dos eventos gerados na refresh.
- Não há execução real nem SSH real neste PR.

## 11. Próximo PR recomendado

PR9 - Hardening + Homologação + Release Final

- revisar fluxo ponta a ponta
- endurecer validações
- fechar documentação operacional
- gerar checklist de homologação
- consolidar release notes
- manter execução real bloqueada por default
