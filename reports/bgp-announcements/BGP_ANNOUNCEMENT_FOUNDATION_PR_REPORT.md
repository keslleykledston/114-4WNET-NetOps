# BGP Announcement Matrix — Foundation PR Report

## 1. Resumo executivo
Base criada. A feature agora tem módulo backend próprio, persistência inicial da matriz, rota real no backend, tela real em `/bgp/announcements` e refresh que grava snapshot no banco.

Ainda não é a matriz real. O snapshot atual é foundation/stub estruturado, sem target classification completa, sem policy graph, sem prefix expansion, sem upstream audit e sem preview/apply.

Para MVP operacional ainda falta transformar o stub em rows reais e classificar só `origin_target` e `customer_import_target`.

Para feature completa ainda faltam graph, resolver de circuit/upstream/community, audit, history/timelapse completo, diff real e proteções de filtro global.

## 2. O que já existe

| Área | Status | Evidência | Arquivos |
|---|---|---|---|
| Backend module bgp-announcements | Feito | módulo criado e exportado | `workspace/artifacts/api-server/src/modules/bgp-announcements/*` |
| Latest snapshot endpoint | Feito | `GET /api/bgp/announcements/matrix/latest` | `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.routes.ts` |
| Refresh endpoint | Feito | `POST /api/bgp/announcements/matrix/refresh` persiste snapshot | `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.refresh.service.ts` |
| Snapshot persistence | Feito | tables + migration criadas | `workspace/lib/db/src/schema/bgp_announcements.ts`, `workspace/lib/db/migrations/0057_bgp_announcement_matrix.sql` |
| Latest page | Feito | rota real e carregamento de latest | `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx` |
| Sidebar entry | Feito | item visível no menu | `workspace/artifacts/netops-manager/src/components/layout.tsx` |
| Typecheck | Feito | `pnpm run typecheck` verde | workspace inteiro |
| Selftests foundation | Feito | 2 selftests novos passaram | `tools/bgp-announcement-snapshot-selftest.mjs`, `tools/bgp-announcement-refresh-flow-selftest.mjs` |

## 3. O que está parcial

| Área | O que funciona | O que falta | Risco |
|---|---|---|---|
| Matrix snapshot | salva latest, supersede, run, diff placeholder | rows ainda foundation/stub | UI mostra base, não matriz real |
| Frontend matrix | abre, filtra, refresh, empty state | conteúdo ainda stub | usuário pode achar que é final |
| Copilot BGP hooks | imports agora resolvem | ainda usam matriz foundation | respostas parciais |
| DB schema | tabelas e colunas principais existem | sem dados históricos reais | migração só cria base |
| API contrato | endpoints base existem | demais endpoints esperados ainda ausentes | integrações futuras quebram se assumirem contrato completo |

## 4. O que está errado

- A matriz ainda não classifica policies de verdade.
- A refresh base ainda gera snapshot foundation, não rows reais.
- Não existe policy graph completo.
- Não existe prefix-list expansion na matriz.
- Não existe upstream audit.
- Não existe community-set exact match resolver.
- Não existe protected global filter model.
- Não existe timelapse/history/diff API completo.

## 5. O que falta implementar

### P0 — bloqueante
- Target classification real.
- Remover export de cliente da matriz.
- Mapear `origin_target` e `customer_import_target`.
- Gerar rows reais a partir de discovery/config.

### P1 — necessário para MVP
- Policy graph básico.
- Circuit/upstream resolver.
- Community resolver e exclusividade por upstream.
- Prefix scope básico por target.

### P2 — melhoria
- History, diffs, timelapse.
- Community set exact match.
- Protected global filters.
- Upstream audit.

### P3 — futuro
- Preview compiler completo.
- Change plans completos.
- Apply controlado.
- UI avançada de auditoria.

## 6. Arquivos encontrados

### Backend modules
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.routes.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.controller.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.snapshot.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.refresh.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.types.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.schemas.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-matrix.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/announcement-matrix-snapshot.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/bgp-network.parser.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/prefix-expansion.resolver.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/services/announcement-context.service.ts`

### Frontend components
- `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx`
- `workspace/artifacts/netops-manager/src/components/layout.tsx`
- `workspace/artifacts/netops-manager/src/App.tsx`

### Migrations / schema
- `workspace/lib/db/src/schema/bgp_announcements.ts`
- `workspace/lib/db/src/schema/bgp_peer_collection_history.ts`
- `workspace/lib/db/src/schema/copilot.ts`
- `workspace/lib/db/migrations/0057_bgp_announcement_matrix.sql`

### Docs
- `reports/bgp-announcements/BGP_ANNOUNCEMENT_FEATURE_STATUS_AND_NEXT_STEPS.md`
- `reports/bgp-announcements/BGP_ANNOUNCEMENT_FOUNDATION_PR_REPORT.md`

### Tools / selftests
- `tools/bgp-announcement-snapshot-selftest.mjs`
- `tools/bgp-announcement-refresh-flow-selftest.mjs`

## 7. Endpoints encontrados

| Endpoint | Existe? | Status | Observação |
|---|---|---|---|
| `GET /api/bgp/announcements/matrix/latest` | Sim | Feito | retorna latest snapshot por `deviceId` |
| `POST /api/bgp/announcements/matrix/refresh` | Sim | Feito | persiste snapshot e run |
| `GET /api/bgp/announcements/matrix/snapshots` | Não | Ausente | backlog |
| `GET /api/bgp/announcements/matrix/snapshots/:id` | Não | Ausente | backlog |
| `GET /api/bgp/announcements/matrix/runs/:runId` | Não | Ausente | backlog |
| `GET /api/bgp/announcements/matrix/diff` | Não | Ausente | backlog |
| `GET /api/bgp/announcements/history` | Não | Ausente | backlog |
| `GET /api/bgp/announcements/targets` | Não | Ausente | backlog |
| `GET /api/bgp/announcements/targets/:id/evidence` | Não | Ausente | backlog |
| `GET /api/bgp/announcements/targets/:id/expanded-prefixes` | Não | Ausente | backlog |
| `POST /api/bgp/announcements/preview-change` | Não | Ausente | fora deste PR |
| `POST /api/bgp/announcements/change-plans` | Não | Ausente | fora deste PR |
| `GET /api/bgp/community-sets` | Não | Existente em outro módulo | não implementado aqui |
| `GET /api/bgp/upstreams/audit` | Não | Ausente | backlog |

## 8. Banco de dados

| Tabela | Existe? | Campos faltantes | Observação |
|---|---|---|---|
| `bgp_announcement_matrix_snapshots` | Sim | nenhum do foundation | snapshot latest persistido |
| `bgp_announcement_matrix_runs` | Sim | nenhum do foundation | run/status/erro persistidos |
| `bgp_announcement_matrix_diffs` | Sim | diff real de matriz ainda stub | estrutura pronta |
| `bgp_announcement_history_events` | Sim | sem evento de negócio real | foundation event only |

## 9. Frontend

- Tela atual: `/bgp/announcements`.
- Problemas visíveis: matriz ainda foundation, sem rows reais.
- Componentes: `Select`, `Tabs`, `Table`, `Empty`, `Badge`, `Button`.
- Filtros: `Família`, `Target`, `Busca`.
- Snapshot/latest: carrega `latest` do backend.
- Refresh: chama `POST /api/bgp/announcements/matrix/refresh`.
- Export de cliente: não aparece na tela porque ainda não há rows reais.

## 10. Testes

Executado:

- `pnpm run typecheck` em `workspace/` -> passou.
- `node tools/bgp-announcement-snapshot-selftest.mjs` -> passou.
- `node tools/bgp-announcement-refresh-flow-selftest.mjs` -> passou.

Não executado neste PR:

- selftests antigos de BGP que dependem de fixtures e outras áreas não tocadas.

## 11. Plano de ação para entregar completo

### Etapa 1
Target classification real e filtro de export de cliente.

### Etapa 2
Policy graph básico: network -> route-policy -> nodes -> matches/applies -> communities.

### Etapa 3
Circuit resolver e community resolver com exclusividade por upstream.

### Etapa 4
Prefix-list expansion com preview de prefixos afetados.

### Etapa 5
Community-set exact match e preservação de sets existentes.

### Etapa 6
Upstream audit Local-AS + prepend + community/action coherence.

### Etapa 7
History/diff/timelapse completos.

### Etapa 8
UI final: auditoria upstreams, community sets e change plans.

## 12. Próximo PR sugerido

PR 2: `Target Classification + Policy Graph`.

Escopo exato:
- classificar `origin_target` e `customer_import_target`;
- excluir export de cliente e Cxx da matriz;
- ligar `network`, `peer`, `route-policy`, `node`, `if-match`, `apply`;
- produzir rows reais da matriz;
- manter snapshot persistido no mesmo contrato já criado neste PR.
