# BGP Announcement Matrix — Implementation Report

Data: 2026-06-06  
Escopo: auditoria abstração v2 + ajustes incrementais (read-only, sem execução em roteador)

## Resumo

Auditoria comparativa concluída. O módulo **BGP Announcement Matrix / Gestão de Anúncios** já estava implementado em ~75% da abstração v2. Nesta passagem foram fechados gaps em **protected global filters**, **grafo BGP**, **expansão IPv6**, **findings de auditoria** e **selftests especializados**.

## Implementado / reforçado nesta sessão

### Backend

| Arquivo | Mudança |
|---------|---------|
| `resolvers/protected-global-filter.ts` | **Novo** — padrões GLOBAL-EXPORT-*, IXBR-*, FULL-ROUTE-ALL |
| `parsers/community-global.parser.ts` | **Novo** — namespace `64777:600xx` |
| `resolvers/circuit-id.resolver.ts` | **Novo** — extrai CID de nomes Cxx |
| `graph/bgp-policy-graph.builder.ts` | Arestas community-filter, as-path, local-pref, goto, COMMUNITY_RESOLVES_TO_CIRCUIT_ACTION |
| `resolvers/prefix-expansion.resolver.ts` | Fix expansão IPv6 `permit PREFIX LEN` |
| `resolvers/announcement-matrix.resolver.ts` | Finding `ORIGIN_POLICY_WITHOUT_COMMUNITY` |
| `services/announcement-preview.service.ts` | Findings `COMMUNITY_LIST_SHARED_TARGET_BLOCKED`, `PROTECTED_GLOBAL_FILTER_PRESERVE_ON_REMOVE` |
| `services/announcement-matrix.service.ts` | `isShared` em community sets via contagem no grafo |
| `bgp-upstream-audit/bgp-upstream-audit.service.ts` | Protected filters, Unknown≠Off, NO_OFF_RULE, PROTECTED_GLOBAL_FILTER_SHARED_OK |

### Frontend (sessão anterior + integração)

| Item | Status |
|------|--------|
| NetOps Operations > Device > BGP > Anúncios (matriz) | ✅ |
| Atualizar = discovery SSH read-only | ✅ |
| Abas Matriz / Audit / Sets / Plans | ✅ |
| Sem botão Executar | ✅ |

### Migrations / DB

| Migration | Tabelas |
|-----------|---------|
| `0041_bgp_announcement_matrix.sql` | `bgp_upstream_circuits`, `bgp_community_action_catalog`, `bgp_announcement_targets`, `bgp_community_sets`, `bgp_announcement_change_plans` |

Nenhuma migration nova nesta auditoria.

### Endpoints (existentes, inalterados)

```
GET  /api/bgp/announcements/matrix
GET  /api/bgp/announcements/evidence
GET  /api/bgp/announcements/expanded-prefixes
POST /api/bgp/announcements/preview-change
GET|POST /api/bgp/announcements/change-plans
GET|POST /api/bgp/community-sets/*
GET  /api/bgp/upstreams/audit
GET  /api/bgp/policies/:name/dependencies
```

Execução em roteador: **503** (`BGP_ANNOUNCEMENT_EXECUTION_ENABLED=false`).

### Selftests

| Comando | Resultado |
|---------|-----------|
| `node tools/bgp-announcement-graph-parser-selftest.mjs` | 2/2 ✅ |
| `node tools/bgp-announcement-community-resolver-selftest.mjs` | 5/5 ✅ |
| `node tools/bgp-announcement-prefix-expansion-selftest.mjs` | 3/3 ✅ |
| `node tools/bgp-announcement-community-set-match-selftest.mjs` | 2/2 ✅ |
| `node tools/bgp-announcement-preview-compiler-selftest.mjs` | 3/3 ✅ |
| `node tools/bgp-upstream-audit-local-as-selftest.mjs` | 2/2 ✅ |
| `node tools/bgp-upstream-audit-conflict-selftest.mjs` | 1/1 ✅ |
| `node tools/bgp-protected-global-filter-selftest.mjs` | 3/3 ✅ |
| `node tools/bgp-announcement-matrix-selftest.mjs` | 2/2 ✅ |

Runner: `tools/bgp-announcement-selftest-suites.mts`

### Typecheck

```
cd workspace && pnpm run typecheck  → OK
```

## Critérios de aceite

| Critério | Status |
|----------|--------|
| Relatório de gap | ✅ `reports/bgp-announcements/BGP_ANNOUNCEMENT_ABSTRACTION_GAP_REPORT.md` |
| Grafo policy → node → match → action | ✅ |
| Matriz só targets origin/customer | ✅ |
| Upstream Cxx audit-only | ✅ |
| Prefix-list expansível | ✅ |
| Community-list match exato | ✅ |
| Sem duas ações por upstream | ✅ |
| Off ≠ sem marcação | ✅ |
| Protected global filters sem falso conflito | ✅ |
| Upstream audit Local-AS / prepend | ✅ |
| Preview diff + rollback | ✅ |
| Sem execução automática | ✅ |
| Typecheck OK | ✅ |
| Selftests OK | ✅ (23 cenários) |

## Limitações conhecidas

- `bgp_announcement_targets` não é materializado automaticamente na build da matriz.
- `POLICY_NODE_MATCHES_EXTCOMMUNITY_FILTER` não implementado (baixa incidência no lab).
- Modal de célula não exibe painel completo de auditoria upstream (dados disponíveis via API/tab Audit).
- OpenAPI/Orval não sincronizado — frontend usa `announcement-api.ts`.
- Classificação `customer_target` depende de regex `AS\d+-` — pode exigir tuning por naming real.

## Próximos passos sugeridos

1. Materializar `bgp_announcement_targets` no build da matriz (performance/histórico).
2. Enriquecer modal com rollback visível + snippet audit upstream da célula.
3. OpenAPI contract + hooks Orval.
4. Fase execução controlada (somente com flag explícita + approval workflow).

## Riscos

| Risco | Controle |
|-------|----------|
| Write em roteador | Flags OFF + preview-only + change plan draft |
| Alteração upstream Cxx | Bloqueio em preview + classifier audit-only |
| Edição community-list compartilhada | MVP usa communities diretas; finding BLOCKED |
| Coleta stale | `BGP_ANNOUNCEMENT_MAX_COLLECTION_AGE_MINUTES` + botão Atualizar (SSH discovery) |
