# Arquitetura — BGP Announcement Matrix

## Módulos backend

| Módulo | Responsabilidade |
|--------|------------------|
| `bgp-announcements.service.ts` | Latest matrix, refresh orchestration |
| `bgp-announcements.refresh.service.ts` | Run refresh, snapshot persist, diff, history events |
| `bgp-announcements.snapshot.service.ts` | Load snapshots, diffs, history query |
| `bgp-announcements.graph.service.ts` | Policy graph, target classification |
| `bgp-announcements.matrix-resolver.ts` | Community → cell label (On/P1/…/!) |
| `resolvers/prefix-expansion.resolver.ts` | network / ip-prefix / ipv6 expansion |
| `bgp-announcements.audit.service.ts` | Community sets, upstream audit, protected filters |
| `bgp-announcements.preview.service.ts` | Preview compiler, change-plan draft |
| `bgp-announcements.approval-execution.service.ts` | Approval, dry-run, execute guard, postcheck, rollback |
| `bgp-announcements.timeline-utils.ts` | Matrix diff compare, timelapse sort |
| `bgp-announcements.controller.ts` / `.routes.ts` | HTTP + RBAC |

## Tabelas (PostgreSQL)

| Tabela | Uso |
|--------|-----|
| `bgp_announcement_matrix_snapshots` | Snapshots da matriz (`matrix_json`, `is_latest`) |
| `bgp_announcement_matrix_runs` | Execuções de refresh |
| `bgp_announcement_matrix_diffs` | Diff entre snapshots consecutivos |
| `bgp_announcement_history_events` | Timelapse (cell/state/community changes) |
| `bgp_announcement_change_plans` | Drafts e status operacional |
| `bgp_announcement_approvals` | Pedidos e decisões de aprovação |
| `bgp_announcement_executions` | Dry-run / real_blocked / mock |
| `bgp_announcement_postchecks` | Comparação expected vs observed |
| `bgp_announcement_execution_locks` | Lock por device+target+upstream |
| `bgp_announcement_rollbacks` | Rollback requests e execuções |

## Snapshots

- Refresh cria run → gera `matrix_json` via policy graph + resolver.
- Snapshot anterior perde `is_latest`; diff e history events são gravados.
- Snapshot stale = idade > 24h (bloqueia preview/approval).

## Policy graph

- Classifica route-policies: `origin_target`, `customer_import_target`, `customer_export` (excluído), Cxx audit-only, internal/unknown (excluídos).
- Só targets `includeInAnnouncementMatrix=true` entram na matriz.

## Community resolver

- Direct `apply community` ou `community-list` → label On/P1/P2/P3/P4/Off/—/?/!
- Conflito mesmo upstream → `!`
- Community desconhecida → `?`

## Preview

- `simulateAnnouncementPreview` / `compileAnnouncementPreview`
- Gera diff, proposed commands, rollback commands, risk level, findings.
- Token `bgp-preview-v1.*` para draft persistence.

## Approval

- Gates: snapshot latest, não stale, commands+rollback presentes, risk ≠ critical, sem conflito ativo.
- Status: `draft` → `pending_approval` → `approved` | `rejected`.

## Execution guard

- Real execution exige: flag ON, approval, dry-run OK, lock, postcheck policy, provider ≠ disabled.
- Default: `BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false` → mode `real_blocked`.

## Postcheck

- Dispara refresh → compara célula observada vs desired do preview.
- Status: `succeeded` | `failed` | `inconclusive`.

## Rollback

- Entidade própria ligada ao change-plan.
- Dry-run rollback simula undo commands.
- Real rollback bloqueado por `BGP_ANNOUNCEMENT_ROLLBACK_ENABLED=false`.

## Timelapse

- Eventos em `bgp_announcement_history_events` gerados no refresh quando cell/state/community muda.
- Endpoint `GET /api/bgp/announcements/history` com filtros.

## Frontend

- Página: `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx`
- Tabs: Matriz, Auditoria Upstreams, Community Sets, Change Plans, Histórico.
