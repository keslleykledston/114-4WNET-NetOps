# BGP Announcement Matrix — PR 4 Community Set Exact Match + Upstream Audit Local-AS + Findings Refinement

## 1. Resumo
PR 4 fechou camada de leitura da feature. Agora existe library normalized de `community-list`, exact match de community-set, auditoria de upstream com `Local-AS` e prepend count, protected global filters, e findings com `scope`/contexto melhor.

Matriz continua read-only. Nada de apply, nada de roteador, nada de alteração de policy.

## 2. O que foi implementado
- Community-set library normalized a partir do running-config.
- `findExactCommunitySetMatch(desiredCommunities)`.
- Endpoints de community-sets.
- Protected global filters com findings `info`.
- Upstream audit read-only com `Local-AS`, prepend count, `community-filter` vs community, e circuit mismatch.
- Findings refinados com `scope`, `targetPolicyName`, `upstreamCircuitId`, `communityList`, `communityFilter`, `prefixList`.
- UI com aba `Auditoria Upstreams` e aba `Community Sets` reais.

## 3. Arquivos alterados
### Backend
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.audit.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.audit.service.js`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.controller.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.graph.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.insights.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.matrix-resolver.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.refresh.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.routes.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.types.ts`

### Frontend
- `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx`

### Selftests
- `tools/bgp-announcement-community-set-match-selftest.mjs`
- `tools/bgp-protected-global-filter-selftest.mjs`
- `tools/bgp-upstream-audit-local-as-selftest.mjs`
- `tools/bgp-upstream-audit-conflict-selftest.mjs`
- `tools/bgp-announcement-findings-refinement-selftest.mjs`

## 4. Endpoints adicionados
| Endpoint | Status | Obs |
|---|---:|---|
| `GET /api/bgp/community-sets` | OK | lista normalized do device |
| `GET /api/bgp/community-sets/:name` | OK | detalhe por nome |
| `POST /api/bgp/community-sets/resolve` | OK | resolve community por semântica |
| `POST /api/bgp/community-sets/find-exact-match` | OK | exact match exato |
| `GET /api/bgp/upstreams/audit` | OK | audit latest read-only |
| `GET /api/bgp/upstreams/:circuitId/audit` | OK | audit filtrado por circuito |
| `POST /api/bgp/upstreams/audit/run` | OK | roda audit read-only sob demanda |

## 5. Community Set Exact Match
Implementado em `bgp-announcements.audit.service.ts`.

Regras:
- dedupe;
- sort;
- hash SHA-256 do conjunto normalizado;
- match só se conjunto for exato.

Exemplo:
- `CLIENTES|2G` -> `["64777:50101", "64777:51003"]`
- `findExactCommunitySetMatch(["64777:51003", "64777:50101"])` -> `matched=true`

## 6. Protected Global Filters
Padrões auditados:
- `GLOBAL-EXPORT-UPSTREAM-*`
- `GLOBAL-EXPORT-ALL-*`
- `GLOBAL-EXPORT-CDNS-*`
- `GLOBAL-EXPORT-PTT-PUBLIC-*`
- `IXBR-EXPORT-*`
- `FULL-ROUTE-ALL`

Findings:
- `PROTECTED_GLOBAL_FILTER_SHARED_OK`
- `PROTECTED_GLOBAL_FILTER_PRESERVE_ON_REMOVE`

Sem falso conflito de shared dependency.

## 7. Upstream Audit Local-AS
Audit lê:
- `Local-AS`
- action code do `community-filter`
- circuit id da community
- prepend count do `apply as-path`

Findings principais:
- `AS_PATH_PREPEND_LOCAL_AS_MISMATCH`
- `AS_PATH_PREPEND_COUNT_MISMATCH`
- `UPSTREAM_COMMUNITY_CIRCUIT_MISMATCH`
- `COMMUNITY_FILTER_ACTION_CODE_MISMATCH`
- `UPSTREAM_EXPORT_POLICY_NO_OFF_RULE`
- `UPSTREAM_EXPORT_POLICY_UNKNOWN_COMMUNITY`
- `LOCAL_AS_UNKNOWN`

## 8. Findings Refinement
Agora findings carregam contexto:
- `scope`
- `targetPolicyName`
- `upstreamCircuitId`
- `upstreamName`
- `community`
- `communityFilter`
- `communityList`
- `prefixList`
- `recommendation`

Isso vale para matrix, community set, protected filter e upstream audit.

## 9. UI
### Matriz
- continua read-only
- mostra rows reais
- mostra badge de community-list compartilhada
- mostra exact-match/placeholder read-only nos rows

### Auditoria Upstreams
- mostra upstream
- CID
- Local-AS
- export policy
- colunas On/P1/P2/P3/P4/Off/NE/BH/Def/Rx
- findings e severity máxima

### Community Sets
- lista sets normalized
- hash
- contagem
- usage
- shared/exclusive
- semantic summary

## 10. Resultados
### Typecheck
- `pnpm run typecheck` -> PASS

### Selftests
- `node ../tools/bgp-announcement-snapshot-selftest.mjs` -> PASS
- `node ../tools/bgp-announcement-refresh-flow-selftest.mjs` -> PASS
- `node ../tools/bgp-announcement-target-classification-selftest.mjs` -> PASS
- `node ../tools/bgp-announcement-community-resolver-selftest.mjs` -> PASS
- `node ../tools/bgp-announcement-prefix-expansion-selftest.mjs` -> PASS
- `node ../tools/bgp-announcement-matrix-cells-selftest.mjs` -> PASS
- `node ../tools/bgp-announcement-community-set-match-selftest.mjs` -> PASS
- `node ../tools/bgp-protected-global-filter-selftest.mjs` -> PASS
- `node ../tools/bgp-upstream-audit-local-as-selftest.mjs` -> PASS
- `node ../tools/bgp-upstream-audit-conflict-selftest.mjs` -> PASS
- `node ../tools/bgp-announcement-findings-refinement-selftest.mjs` -> PASS

## 11. Limitações
- Não tem preview/apply.
- Não cria community-list.
- Não altera roteador.
- Community-set exact match ainda é audit/read-only.
- Upstream audit ainda depende do que existe em discovery/config.

## 12. Próximo PR recomendado
PR 5: Preview Read-only

Escopo sugerido:
- compilar change-plan sem aplicar;
- preview de impacto por target/upstream;
- rollback preview;
- diff visual da matriz;
- preparar caminho para edit controlado.
