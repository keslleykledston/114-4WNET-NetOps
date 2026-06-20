# BGP Announcement Matrix - PR 2 Target Classification + Policy Graph

## 1. Resumo executivo
Este PR tira a feature do modo foundation/placeholder e põe a base real da matriz.

- Onde parou: a matriz agora nasce de `policy_graph`, com bindings de `network ... route-policy` e `peer route-policy import/export`.
- Usabilidade: já existe `GET latest`, `POST refresh`, tela real `/bgp/announcements`, persistencia em banco e rows reais basicas.
- O que falta para MVP: community resolver completo, prefix-list expansion completa, community-set exact match, audit upstream e change-plan real.
- O que falta para feature completa: policy graph mais rico, community matrix, timelapse detalhado, preview seguro, apply bloqueado por regra e auditoria upstream completa.

## 2. O que ja existe
| Area | Status | Evidencia | Arquivos |
|---|---|---|---|
| Policy graph basico | Pronto | Monta bindings `NETWORK_USES_ORIGIN_POLICY` e `PEER_USES_POLICY` | `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.graph.service.ts` |
| Classificacao de policies | Pronto | Classifica `origin_target`, `customer_import_target`, `customer_export`, `upstream_export_audit`, `upstream_import_audit`, `internal_mesh`, `unknown` | `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.graph.service.ts` |
| Filtro da matriz | Pronto | Entra so `origin_target` e `customer_import_target` | `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.graph.service.ts` |
| Persistencia da matriz | Pronto | Snapshots, runs, diffs, history events | `workspace/lib/db/src/schema/bgp_announcements.ts`, `workspace/lib/db/migrations/0057_bgp_announcement_matrix.sql` |
| API latest/refresh | Pronto | Endpoints ativos e persistindo snapshot latest | `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.routes.ts`, `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.controller.ts`, `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.refresh.service.ts` |
| UI real | Pronto | Tela `/bgp/announcements` carrega latest e chama refresh | `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx`, `workspace/artifacts/netops-manager/src/App.tsx`, `workspace/artifacts/netops-manager/src/components/layout.tsx` |
| Parser de network | Pronto | Converte `network` com mascara/prefixo para CIDR | `workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/bgp-network.parser.ts` |
| Selftests | Pronto | Snapshot, refresh flow e target classification verdes | `tools/bgp-announcement-snapshot-selftest.mjs`, `tools/bgp-announcement-refresh-flow-selftest.mjs`, `tools/bgp-announcement-target-classification-selftest.mjs` |

## 3. O que esta parcial
| Area | O que funciona | O que falta | Risco |
|---|---|---|---|
| Rows da matriz | ORIGIN e Customer Import ja aparecem | Cells/community ainda vazios ou placeholder | Baixo |
| Prefix scope | ORIGIN usa prefixo do `network`; customer import usa `pending_prefix_expansion` ou hint | Expansao completa de prefix-list | Medio |
| Summary | Conta origin, import, export excluido, upstream excluido, internal, unknown | Nao ha visao completa de findings por celula | Medio |
| Audit/debug | Findings informativos de exclusao existem | Auditoria upstream real ainda nao foi implementada | Medio |
| Frontend | Tabela renderiza rows reais sem quebrar | Tabs extras ainda sao placeholder de fase futura | Baixo |

## 4. O que esta errado
- Export de cliente nao pode entrar na matriz. Agora esta excluido por classificacao.
- Cxx upstream nao pode entrar na matriz. Agora esta excluido como audit-only.
- `MALHA` e `iBGP/internal` nao podem entrar na matriz. Agora sao excluidos.
- Community cells ainda nao existem de verdade neste PR.
- Prefix-list expansion ainda nao esta completa.
- Audit upstream Local-AS, change-plan e apply ainda nao existem.

## 5. O que falta implementar
### P0 - bloqueante
- Community resolver real por upstream.
- Prefix-list expansion real para `if-match ip-prefix` e `if-match ipv6 address prefix-list`.
- Snapshot com cells reais por upstream.

### P1 - necessario para MVP
- Community-set exact match.
- Community-list reuse sem criar lista nova.
- Change-plan compilado com base_snapshot_id e collection_id.
- Auditar upstream sem alterar nada.

### P2 - melhoria
- Timelapse visual e diff detalhado por evento.
- Confidence e risk melhores por target.
- Filtro de busca mais rico na tela.

### P3 - futuro
- Apply controlado e segurado por flags.
- Tabela de eventos historicos completa por acao/comunidade.
- UX completa para audit/preview/change-plan.

## 6. Arquivos encontrados
### Backend modules
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.controller.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.graph.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.refresh.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.routes.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.schemas.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.snapshot.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.types.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/bgp-network.parser.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/parsers/bgp-network.parser.js`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/resolvers/prefix-expansion.resolver.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/services/announcement-context.service.ts`

### Frontend
- `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx`
- `workspace/artifacts/netops-manager/src/App.tsx`
- `workspace/artifacts/netops-manager/src/components/layout.tsx`

### Migrations e schema
- `workspace/lib/db/migrations/0057_bgp_announcement_matrix.sql`
- `workspace/lib/db/src/schema/bgp_announcements.ts`

### Docs e report
- `reports/bgp-announcements/BGP_ANNOUNCEMENT_FOUNDATION_PR_REPORT.md`
- `reports/bgp-announcements/BGP_ANNOUNCEMENT_PR2_TARGET_CLASSIFICATION_REPORT.md`

### Tools / selftests
- `tools/bgp-announcement-snapshot-selftest.mjs`
- `tools/bgp-announcement-refresh-flow-selftest.mjs`
- `tools/bgp-announcement-target-classification-selftest.mjs`

## 7. Endpoints encontrados
| Endpoint | Existe? | Status | Observacao |
|---|---|---|---|
| `GET /api/bgp/announcements/matrix/latest` | Sim | Pronto | Retorna latest snapshot persistido |
| `POST /api/bgp/announcements/matrix/refresh` | Sim | Pronto | Gera snapshot policy_graph e salva no banco |
| `GET /api/bgp/announcements/matrix/snapshots` | Nao | Faltando | Ainda nao exposto |
| `GET /api/bgp/announcements/matrix/snapshots/:id` | Nao | Faltando | Ainda nao exposto |
| `GET /api/bgp/announcements/matrix/runs/:runId` | Nao | Faltando | Ainda nao exposto |
| `GET /api/bgp/announcements/matrix/diff` | Nao | Faltando | Ainda nao exposto |
| `GET /api/bgp/announcements/history` | Nao | Faltando | Ainda nao exposto |
| `GET /api/bgp/announcements/targets` | Nao | Faltando | Ainda nao exposto |
| `GET /api/bgp/announcements/targets/:id/evidence` | Nao | Faltando | Ainda nao exposto |
| `GET /api/bgp/announcements/targets/:id/expanded-prefixes` | Nao | Faltando | Ainda nao exposto |
| `POST /api/bgp/announcements/preview-change` | Nao | Faltando | Fora do PR |
| `POST /api/bgp/announcements/change-plans` | Nao | Faltando | Fora do PR |
| `GET /api/bgp/community-sets` | Nao | Faltando | Fora do PR |
| `POST /api/bgp/community-sets/resolve` | Nao | Faltando | Fora do PR |
| `POST /api/bgp/community-sets/find-exact-match` | Nao | Faltando | Fora do PR |
| `GET /api/bgp/upstreams/audit` | Nao | Faltando | Fora do PR |
| `GET /api/bgp/upstreams/:circuitId/audit` | Nao | Faltando | Fora do PR |
| `POST /api/bgp/upstreams/audit/run` | Nao | Faltando | Fora do PR |

## 8. Banco de dados
| Tabela | Existe? | Campos faltantes | Observacao |
|---|---|---|---|
| `bgp_announcement_matrix_snapshots` | Sim | Nao critica para PR 2 | Guarda `matrix_json`, `summary_json`, `is_latest`, `source`, `family_scope`, contadores |
| `bgp_announcement_matrix_runs` | Sim | Nao critica para PR 2 | Guarda `status`, `previous_snapshot_id`, `new_snapshot_id`, `logs_json` |
| `bgp_announcement_matrix_diffs` | Sim | Nao critica para PR 2 | Guarda diff entre snapshots |
| `bgp_announcement_history_events` | Sim | Nao critica para PR 2 | Estrutura pronta para eventos futuros |

## 9. Frontend
- Tela atual: `/bgp/announcements`.
- Estado atual: carrega latest snapshot, mostra badge de fonte `policy_graph` e botao de refresh.
- Problemas visiveis: cells ainda nao estao preenchidas; alguns blocos ainda sao fase futura.
- Componentes: pagina dedicada, layout lateral e rota no `App.tsx`.
- Filtros: familia, target e busca.
- Snapshot/latest: usa `GET /api/bgp/announcements/matrix/latest`.
- Refresh: usa `POST /api/bgp/announcements/matrix/refresh`.
- Export de cliente: nao aparece na matriz.
- Cxx upstream: nao aparece na matriz.

## 10. Testes
Rodado:
- `pnpm run typecheck` - verde.
- `node tools/bgp-announcement-snapshot-selftest.mjs` - verde.
- `node tools/bgp-announcement-refresh-flow-selftest.mjs` - verde.
- `node tools/bgp-announcement-target-classification-selftest.mjs` - verde.

Resultado do selftest de classificacao:
- ORIGIN X e ORIGIN V6 entram como `origin_target`.
- `AS1234-CLIENT-IMPORT` entra como `customer_import_target`.
- `AS1234-CLIENT-EXPORT` sai da matriz.
- `C01-EXPORT` e `C01-IMPORT-IPV4` saem como audit-only.
- `MALHA-Export` sai como `internal_mesh`.
- `UNKNOWN-POLICY` nao entra.

## 11. Plano de acao para entregar completo
Etapa 1: community resolver real e cells por upstream.

Etapa 2: prefix-list expansion para scope real antes do preview.

Etapa 3: community-set exact match e reuse de community-list.

Etapa 4: upstream audit Local-AS, prepend e validacao de coerencia.

Etapa 5: protected global filters e remocao segura.

Etapa 6: preview/change-plan com rollback e snapshot base.

Etapa 7: timelapse/diff visual e history events completos.

Etapa 8: UI final da matriz e auditoria upstream.

## 12. Proximo PR sugerido
PR 3: `Community Resolver + Prefix Expansion`.

Entrar neste PR:
- resolver de community por upstream/circuito;
- exclusividade por upstream;
- prefix-list expansion;
- exact match de community-set;
- cells reais na matriz;
- mais findings estruturados.

