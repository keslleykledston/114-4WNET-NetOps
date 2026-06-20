# BGP Announcement Matrix - Status e Proximos Passos

## 1. Resumo executivo

A feature nao parou numa matriz de anuncios completa. Ela parou num conjunto parcial de primitivas de BGP:
- existe a base de `community library` e `community sets` por device;
- existe preview/apply de community-set;
- existe parser de policy, prefix e comunidade para o fluxo BGP geral;
- existe integracao de Copilot que cita `/bgp/announcements`.

Os docs com nome exato pedidos no inicio nao existem neste repo. Usei os equivalentes locais:
- `docs/netops/COMMUNITY_LIBRARY_SPEC.md`
- `docs/netops/ROUTE_POLICY_PARSER_SPEC.md`
- `docs/bgp/BGP_POLICY_EDITOR_CONTEXT_SUMMARY.md`
- `docs/bgp/BGP_POLICY_EDITOR_NEXT_STEPS.md`
- `docs/bgp/BGP_OPERATIONS_VS_DRILLDOWN_ANALYSIS.md`
- `reports/migration/COMMUNITY_SETS_LEGACY_EXTRACTION_AND_MIGRATION_PLAN.md`

Mas a feature alvo, como definida, nao esta pronta:
- nao existe tela real de Announcement Matrix;
- nao existe persistencia real de snapshots/latest/diff/timelapse da matriz;
- nao existem endpoints da matriz de anuncios;
- nao existe classificacao completa de policy target/audit/upstream;
- nao existe resolver de prefix-list expansion para a matriz;
- nao existe modelo de upstream audit e protected global filters.

Conclusao direta:
- usavel hoje: parcialmente, so para community library / community sets;
- MVP da Announcement Matrix: nao;
- feature completa: muito longe ainda, falta o nucleo da matriz.

## 2. O que ja existe

| Area | Status | Evidencia | Arquivos |
|---|---|---|---|
| Community library por device | Existe | GET de library + resync backup/live + tabela UI | [`community.routes.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/netops/device-discovery/community.routes.ts#L19), [`community.controller.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/netops/device-discovery/community.controller.ts#L98), [`community-library-tab.tsx`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/bgp/community-library-tab.tsx#L30) |
| Community sets por device | Existe | list/get/create/update/delete/compare | [`community.routes.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/netops/device-discovery/community.routes.ts#L24), [`community.controller.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/netops/device-discovery/community.controller.ts#L149) |
| Preview/apply de community set | Existe | preview gera sha e apply exige confirmacao | [`community.controller.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/netops/device-discovery/community.controller.ts#L289), [`community-apply.service.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/netops/device-discovery/community-apply.service.ts#L148) |
| Audit de community change | Existe | endpoint de audit por device | [`community.routes.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/netops/device-discovery/community.routes.ts#L36), [`community.controller.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/netops/device-discovery/community.controller.ts#L343) |
| Parser de community-filter/community-list | Existe | parser e formatador de bloco VRP | [`community-parser.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/community-parser.ts) |
| Parser/graph de route-policy geral | Existe | policy parser, dependency pipeline, community-filter refs | [`policy-parser.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-parser.ts), [`policy-dependency-pipeline.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-dependency-pipeline.ts) |
| BGP Drilldown snapshot read-only | Existe | tela read-only e cache snapshot por peer | [`bgp-peer-drilldown-view.tsx`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/bgp-drilldown/bgp-peer-drilldown-view.tsx), [`bgp-peer-drilldown-cache.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/bgp-drilldown/bgp-peer-drilldown-cache.ts) |
| BGP Operations | Existe | painel operacional e filtro por role/state/af | [`bgp-panel.tsx`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/netops-manager/src/features/bgp/bgp-panel.tsx#L139) |
| Copilot BGP announcements intent | Parcial | existe tool/skill para buscar matriz | [`copilot.tools.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/copilot/copilot.tools.ts#L181), [`bgp-announcements.skill.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/artifacts/api-server/src/modules/copilot/skills/bgp-announcements.skill.ts) |

## 3. O que esta parcial

| Area | O que funciona | O que falta | Risco |
|---|---|---|---|
| Community Sets | CRUD, compare, preview, apply, audit | sem matriz de anuncios; sem classificacao de target | usuario acha que esta mexendo na matriz, mas so mexe em community-set |
| Community Library | sync backup/live e listagem | nao vira Announcement Matrix | dados existem, mas nao resolvem policy graph |
| Copilot BGP | searchAnnouncements e matrixTimelapse existem como intencao | imports para `bgp-announcements` estao quebrados | typecheck quebra e o fluxo fica incompleto |
| Policy parser | encontra if-match/apply e dependencias | nao classifica origin/customer import/upstream audit/internal mesh | falso entendimento do papel da policy |
| UI BGP | tabs de Community Library e Community Sets existem no device detail | nao ha abas Matriz / Auditoria Upstreams / Change Plans | feature alvo nao aparece na navegacao |

## 4. O que esta errado

- Nao existe rota real de frontend para `/bgp/announcements`; ha so referencias textuais.
- `workspace/artifacts/api-server/src/modules/copilot/copilot.matrix-timelapse.ts` e outros arquivos importam `../bgp-announcements/...`, mas o diretorio fonte nao existe.
- `pnpm run typecheck` falha no `api-server` por imports faltando e exports faltando em `@workspace/db`.
- `tools/compliance-community-filter-reference-selftest.mjs` falha porque falta a fixture `route-policy-community-filter-dependencies.txt`.
- `tools/bgp-community-filter-resmoke.mjs` falha porque o snapshot de teste nao tem parsed community-filters.
- `community-sync.service.ts` cria sets importados com status `imported`, mas a UI `community-sets-tab.tsx` so trata `draft/ready/applied` de forma explicita; o resto cai em fallback visual.
- Nao ha migration source para `community_library_items`, `community_sets`, `community_set_members` e `community_change_audit`.
- O schema de Announcement Matrix aparece so em artefato gerado de `dist`, nao em `workspace/lib/db/src/schema`.

## 5. O que falta implementar

### P0 - bloqueante
- Recriar o modulo fonte de `bgp-announcements`.
- Criar schema/migrations reais para snapshots, runs, diffs e history da matriz.
- Criar endpoints da matriz e do audit upstream.
- Criar tela real `/bgp/announcements`.
- Corrigir os imports quebrados do `copilot` ligados a `bgp-announcements`.

### P1 - necessario para MVP
- Policy graph completo:
  - network -> ORIGIN route-policy
  - peer -> route-policy import/export
  - route-policy -> nodes
  - node -> if-match / apply
  - community-list -> communities
  - community-filter -> community
  - community -> circuit/action
- Classificacao:
  - `origin_target`
  - `customer_import_target`
  - `customer_export`
  - `upstream_export_audit`
  - `upstream_import_audit`
  - `internal_mesh`
  - `unknown`
- Circuit resolver com C01/C02/C10, role, local_as, remote_as e namespaces.
- Community resolver 64777:5[CID][ACTION_CODE] com exclusividade por upstream.
- Prefix-list expansion antes de preview.
- protected global filters sem falso conflito.
- snapshot latest + refresh + diff + timelapse.

### P2 - melhoria
- Exact match de community-set.
- preview/change-plan com rollback-safe contract.
- visibilidade melhor de drift e origem do snapshot.

### P3 - futuro
- UI polish.
- telemetria de eventos.
- cache/heuristica para diffs e timelapse.

## 6. Arquivos encontrados

### Backend modules
- `workspace/artifacts/api-server/src/modules/netops/device-discovery/community.controller.ts`
- `workspace/artifacts/api-server/src/modules/netops/device-discovery/community.routes.ts`
- `workspace/artifacts/api-server/src/modules/netops/device-discovery/community-sync.service.ts`
- `workspace/artifacts/api-server/src/modules/netops/device-discovery/community-apply.service.ts`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/community-parser.ts`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-parser.ts`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-dependency-pipeline.ts`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/bgp-peer-dependency-parser.ts`
- `workspace/artifacts/api-server/src/modules/copilot/copilot.queries.ts`
- `workspace/artifacts/api-server/src/modules/copilot/copilot.matrix-timelapse.ts`
- `workspace/artifacts/api-server/src/modules/copilot/copilot.prefix-trace.ts`
- `workspace/artifacts/api-server/src/modules/copilot/copilot.route-policy-explain.ts`
- `workspace/artifacts/api-server/src/modules/copilot/skills/bgp-announcements.skill.ts`
- `workspace/artifacts/api-server/src/modules/bgp-drilldown/*`

### Frontend components
- `workspace/artifacts/netops-manager/src/features/bgp/community-library-tab.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp/community-sets-tab.tsx`
- `workspace/artifacts/netops-manager/src/features/bgp/bgp-panel.tsx`
- `workspace/artifacts/netops-manager/src/pages/device-detail.tsx`
- `workspace/artifacts/netops-manager/src/pages/bgp-peer-drilldown.tsx`
- `workspace/artifacts/netops-manager/src/pages/copilot.tsx`

### Migrations
- `workspace/lib/db/migrations/0002_bgp_route_history.sql`
- `workspace/lib/db/migrations/0010_bgp_route_query_logging.sql`
- `workspace/lib/db/migrations/0017_bgp_peer_drilldown_snapshots.sql`
- `workspace/lib/db/migrations/0018_operational_bgp_peers.sql`
- `workspace/lib/db/migrations/0039_bgp_peer_cleanup_planner.sql`

### Docs
- `docs/netops/COMMUNITY_LIBRARY_SPEC.md`
- `docs/netops/ROUTE_POLICY_PARSER_SPEC.md`
- `docs/bgp/BGP_POLICY_EDITOR_CONTEXT_SUMMARY.md`
- `docs/bgp/BGP_POLICY_EDITOR_NEXT_STEPS.md`
- `docs/bgp/BGP_OPERATIONS_VS_DRILLDOWN_ANALYSIS.md`
- `reports/migration/COMMUNITY_SETS_LEGACY_EXTRACTION_AND_MIGRATION_PLAN.md`
- `reports/bgp/BGP_POLICY_EDITOR_PHASE_STATUS.md`

### Tools / selftests
- `tools/bgp-community-filter-resmoke.mjs`
- `tools/bgp-prefix-routes-selftest.mjs`
- `tools/bgp-peer-parser-selftest.mjs`
- `tools/bgp-peer-dependency-selftest.mjs`
- `tools/bgp-peer-drilldown-snapshot-selftest.mjs`
- `tools/compliance-community-filter-reference-selftest.mjs`
- `tools/policy-dependency-catalog-pipeline-selftest.mjs`
- `tools/bgp-policy-editor/bgp-policy-editor-backend-preview-selftest.mjs`
- `tools/bgp-policy-editor/bgp-policy-editor-preview-integration-selftest.mjs`
- `tools/bgp-policy-editor/bgp-policy-editor-preview-selftest.mjs`
- `tools/bgp-policy-editor/bgp-policy-editor-shell-selftest.mjs`

## 7. Endpoints encontrados

| Endpoint | Existe? | Status | Observacao |
|---|---|---|---|
| `GET /api/devices/:id/communities/library` | Sim | Ok | lista community library |
| `POST /api/devices/:id/communities/resync-from-config` | Sim | Ok | sync do ultimo running-config salvo |
| `POST /api/devices/:id/communities/resync-live` | Sim | Ok | sync live via SSH |
| `GET /api/devices/:id/community-sets` | Sim | Ok | lista sets |
| `GET /api/devices/:id/community-sets/:setId` | Sim | Ok | detalhes |
| `POST /api/devices/:id/community-sets` | Sim | Ok | create |
| `POST /api/devices/:id/community-sets/compare` | Sim | Ok | compare |
| `PUT /api/devices/:id/community-sets/:setId` | Sim | Ok | update |
| `DELETE /api/devices/:id/community-sets/:setId` | Sim | Ok | delete |
| `POST /api/devices/:id/community-sets/:setId/preview` | Sim | Ok | preview |
| `POST /api/devices/:id/community-sets/:setId/apply` | Sim | Ok | apply real bloqueado por flag por padrao |
| `GET /api/devices/:id/community-change-audit` | Sim | Ok | audit trail |
| `GET /api/bgp/announcements/matrix/latest` | Nao | Ausente | nao existe no router nem no openapi |
| `POST /api/bgp/announcements/matrix/refresh` | Nao | Ausente | faltando |
| `GET /api/bgp/announcements/matrix/snapshots` | Nao | Ausente | faltando |
| `GET /api/bgp/announcements/matrix/snapshots/:id` | Nao | Ausente | faltando |
| `GET /api/bgp/announcements/matrix/runs/:runId` | Nao | Ausente | faltando |
| `GET /api/bgp/announcements/matrix/diff` | Nao | Ausente | faltando |
| `GET /api/bgp/announcements/history` | Nao | Ausente | faltando |
| `GET /api/bgp/announcements/targets` | Nao | Ausente | faltando |
| `GET /api/bgp/announcements/targets/:id/evidence` | Nao | Ausente | faltando |
| `GET /api/bgp/announcements/targets/:id/expanded-prefixes` | Nao | Ausente | faltando |
| `POST /api/bgp/announcements/preview-change` | Nao | Ausente | faltando |
| `POST /api/bgp/announcements/change-plans` | Nao | Ausente | faltando |
| `GET /api/bgp/community-sets` | Nao | Ausente | o contrato atual esta em `/api/devices/:id/community-sets` |
| `POST /api/bgp/community-sets/resolve` | Nao | Ausente | faltando |
| `POST /api/bgp/community-sets/find-exact-match` | Nao | Ausente | faltando |
| `GET /api/bgp/upstreams/audit` | Nao | Ausente | faltando |
| `GET /api/bgp/upstreams/:circuitId/audit` | Nao | Ausente | faltando |
| `POST /api/bgp/upstreams/audit/run` | Nao | Ausente | faltando |

## 8. Banco de dados

| Tabela | Existe? | Campos faltantes | Observacao |
|---|---|---|---|
| `community_library_items` | No src schema, sem migration | nao da para validar no banco atual | schema existe em [`communities.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/lib/db/src/schema/communities.ts#L4) |
| `community_sets` | No src schema, sem migration | nao da para validar no banco atual | schema existe em [`communities.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/lib/db/src/schema/communities.ts#L38) |
| `community_set_members` | No src schema, sem migration | nao da para validar no banco atual | schema existe em [`communities.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/lib/db/src/schema/communities.ts#L67) |
| `community_change_audit` | No src schema, sem migration | nao da para validar no banco atual | schema existe em [`communities.ts`](/data/home-moved/Projects/_legacy_lowercase_projects/114-4WNET_NetOps/workspace/lib/db/src/schema/communities.ts#L88) |
| `bgp_upstream_circuits` | So aparece em `dist` | tabela fonte ausente | sinal de artefato gerado/stale |
| `bgp_announcement_matrix_snapshots` | So aparece em `dist` | tabela fonte ausente | nao existe schema source nem migration |
| `bgp_announcement_matrix_runs` | Nao encontrado | tudo | faltando |
| `bgp_announcement_matrix_diffs` | Nao encontrado | tudo | faltando |
| `bgp_announcement_matrix_events` | Nao encontrado | tudo | faltando |
| `bgp_announcement_targets` | Nao encontrado | tudo | faltando |

## 9. Frontend

- Tela atual:
  - em `device-detail.tsx`, a aba `Communities` mostra `CommunityLibraryTab` e `CommunitySetsTab`.
  - em `bgp-panel.tsx`, o painel BGP e read-only de rotas/peer details/cleanup existe.
- Problemas visiveis:
  - nao ha tela `Announcement Matrix`;
  - nao ha abas `Auditoria Upstreams` ou `Change Plans`;
  - nao ha seletor de snapshot latest ou botao de refresh da matriz;
  - nao ha expansor de prefixos afetados na matriz;
  - nao ha separacao visual entre ORIGIN e Customer Import como alvo editavel da matriz.
- Componentes presentes:
  - `CommunityLibraryTab`
  - `CommunitySetsTab`
  - `BgpPanel`
  - `BgpPeerContextCard`
  - `CopilotChat`
- Filtros:
  - existentes: search em library e sets;
  - ausentes: filtros de target policy/upstream/snapshot/classificacao.
- Snapshot/latest:
  - nao existe consumindo `GET latest snapshot` da matriz;
  - o que existe eh discovery snapshot e BGP drilldown snapshot.
- Refresh:
  - existe refresh de community library via backup/live;
  - nao existe refresh da Announcement Matrix.
- Export de cliente:
  - nao aparece como matriz dedicada;
  - hoje o que aparece e community library/sets, nao o mapa completo de anuncios.

## 10. Testes

### Rodados
- `cd workspace && pnpm run typecheck`
- `node tools/bgp-community-filter-resmoke.mjs`
- `node tools/policy-dependency-catalog-pipeline-selftest.mjs`
- `node tools/compliance-community-filter-reference-selftest.mjs`
- `node tools/bgp-peer-dependency-selftest.mjs`
- `node tools/bgp-prefix-routes-selftest.mjs`
- `node tools/bgp-peer-parser-selftest.mjs`
- `node tools/bgp-peer-drilldown-snapshot-selftest.mjs`

### Resultado
- `pnpm run typecheck`: falhou.
  - faltam exports em `@workspace/db` para o copilot;
  - faltam modulos `../bgp-announcements/...` no `api-server`.
- `tools/bgp-community-filter-resmoke.mjs`: falhou.
  - erro: `snapshot has no parsed community-filters`.
- `tools/compliance-community-filter-reference-selftest.mjs`: falhou.
  - erro: fixture ausente `route-policy-community-filter-dependencies.txt`.
- `tools/bgp-peer-dependency-selftest.mjs`: passou.
- `tools/policy-dependency-catalog-pipeline-selftest.mjs`: passou.
- `tools/bgp-prefix-routes-selftest.mjs`: passou.
- `tools/bgp-peer-parser-selftest.mjs`: passou.
- `tools/bgp-peer-drilldown-snapshot-selftest.mjs`: falhou.
  - erro de import ESM para `bgp-peer-drilldown.types.js`.

## 11. Plano de acao para entregar completo

### Etapa 1
Corrigir o target classification para remover Export de cliente da matriz e separar:
- `origin_target`
- `customer_import_target`

### Etapa 2
Persistir snapshots/latest/timelapse da matriz em banco.

### Etapa 3
Implementar prefix-list expansion e expansor visual antes de preview.

### Etapa 4
Implementar community-set exact match e resolver de community namespace.

### Etapa 5
Implementar upstream audit com Local-AS, prepend e findinds de conflito.

### Etapa 6
Tratar protected global filters como shared-safe na remocao/auditoria.

### Etapa 7
Fechar preview/change-plan seguro com rollback e referencias `base_snapshot_id` + `collection_id`.

### Etapa 8
Polir UI e navegaçao:
- Matriz
- Auditoria Upstreams
- Community Sets
- Change Plans

## 12. Proximo PR sugerido

Entrar com um PR unico e pequeno de base:
- reintroduzir o modulo fonte `bgp-announcements`;
- criar as tabelas/migrations de snapshot/run/diff/event;
- publicar os endpoints `matrix/latest`, `matrix/refresh`, `matrix/snapshots`, `history`, `targets` e `upstreams/audit`;
- adicionar a rota frontend `/bgp/announcements` com abas vazias mas reais;
- remover o erro de typecheck dos imports quebrados do copilot.
