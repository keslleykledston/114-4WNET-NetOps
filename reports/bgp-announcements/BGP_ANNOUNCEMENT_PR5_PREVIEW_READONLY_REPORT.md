# BGP Announcement Matrix - PR 5 Preview Read-only + Change Plan Draft

## Resumo
- Preview read-only criado para célula da matriz.
- Change-plan draft persistido em banco.
- Preview valida `base_snapshot_id`, target, upstream, estado desejado e risco.
- Diff, rollback e comandos propostos saem do preview.
- Exact match de community-set usa `apply community community-list ...`.
- Sem exact match usa communities diretas.
- UI da matriz ganhou modal de preview.
- Aba Change Plans agora lista drafts e permite cancelar.
- Typecheck verde.
- Selftests BGP verdes, incluindo os dois novos do PR 5.

## Arquivos alterados
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.preview.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.controller.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.routes.ts`
- `workspace/artifacts/netops-manager/src/features/bgp/bgp-announcements-preview-modal.tsx`
- `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx`
- `workspace/artifacts/api-server/src/modules/netops/device-discovery/discovery.service.js`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.graph.service.js`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.preview.service.js`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.snapshot.service.js`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/services/announcement-context.service.js`
- `workspace/lib/db/src/index.ts`
- `workspace/lib/db/src/schema/bgp_announcements.ts`
- `workspace/lib/db/src/schema/index.ts`
- `workspace/lib/db/src/schema/index.js`
- `workspace/lib/db/migrations/0058_bgp_announcement_change_plans.sql`
- `tools/bgp-announcement-preview-compiler-selftest.mjs`
- `tools/bgp-announcement-change-plan-selftest.mjs`

## Endpoints criados
- `POST /api/bgp/announcements/preview-change`
- `POST /api/bgp/announcements/change-plans`
- `GET /api/bgp/announcements/change-plans`
- `GET /api/bgp/announcements/change-plans/:id`
- `POST /api/bgp/announcements/change-plans/:id/cancel`

## Como funciona
- Preview exige snapshot latest, completed e não stale.
- Preview bloqueia target inexistente, export, upstream audit-only e upstream sem node claro.
- Estado desejado vira `64777:5[CID][ACTION_CODE]`.
- Community-set exato vira comando com `community-list`.
- Sem match exato vira communities diretas.
- Diff mostra removidas, adicionadas e preservadas.
- Rollback restaura o estado observado.
- Draft guarda preview serializado, diff, comandos, rollback, findings e risco.

## Limitações
- Ainda não existe apply.
- Ainda não existe approval real.
- Ainda não existe execução controlada.
- Ainda não existe edição de community-list.
- Preview ainda é read-only.
- Risk/rollback seguem heurística conservadora.

## Testes rodados
- `pnpm run typecheck`
- `node ../tools/bgp-announcement-snapshot-selftest.mjs`
- `node ../tools/bgp-announcement-refresh-flow-selftest.mjs`
- `node ../tools/bgp-announcement-target-classification-selftest.mjs`
- `node ../tools/bgp-announcement-community-resolver-selftest.mjs`
- `node ../tools/bgp-announcement-prefix-expansion-selftest.mjs`
- `node ../tools/bgp-announcement-matrix-cells-selftest.mjs`
- `node ../tools/bgp-announcement-community-set-match-selftest.mjs`
- `node ../tools/bgp-protected-global-filter-selftest.mjs`
- `node ../tools/bgp-upstream-audit-local-as-selftest.mjs`
- `node ../tools/bgp-upstream-audit-conflict-selftest.mjs`
- `node ../tools/bgp-announcement-findings-refinement-selftest.mjs`
- `node ../tools/bgp-announcement-preview-compiler-selftest.mjs`
- `node ../tools/bgp-announcement-change-plan-selftest.mjs`

## Resultado
- `typecheck`: PASS
- `selftests`: PASS

## Próximo PR recomendado
- PR 6: approval gate + controlled execution scaffold, ou seja, preparar a transição do change-plan draft para um fluxo aprovado sem aplicar ainda.
