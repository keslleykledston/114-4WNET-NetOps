# BGP Announcement Matrix — Gap Report

Data: 2026-06-06  
Referência: `docs/BGP_ANNOUNCEMENT_ABSTRACTION.md`, `docs/BGP_POLICY_GRAPH_MODEL.md`, abstração v2 (Gestão de Anúncios BGP)

## Resumo executivo

| Status | Itens |
|--------|-------|
| **Implemented** | 28 |
| **Partial** | 9 |
| **Missing** | 4 |
| **Not applicable (MVP)** | 5 |

O núcleo read-only (matriz, preview, upstream audit, community sets, change plans draft) **já existia**. Nesta auditoria foram reforçados: **protected global filters**, **expansão IPv6**, **findings adicionais**, **grafo de dependências** e **selftests especializados**.

---

## FASE 1 — Pipeline e módulos existentes

| Item abstração | Status | Arquivos | Risco | Recomendação | Próxima ação |
|----------------|--------|----------|-------|--------------|--------------|
| BGP discovery / snapshot | implemented | `device-discovery/`, `announcement-context.service.ts` | baixo | Reutilizar snapshot | — |
| Policy dependency pipeline | implemented | `netops/huawei-vrp/parsers/policy-dependency-pipeline.ts` | baixo | Fonte única parsed_config | — |
| Community parser (running-config) | implemented | `community-parser.ts`, `apply-community.parser.ts` | baixo | Estender, não duplicar | — |
| Community-filter parser | implemented | `policy-dependency-pipeline.ts` catalogs | baixo | Usar catalogs | — |
| ip-prefix / ipv6-prefix catalogs | partial → **implemented** | `prefix-expansion.resolver.ts` | médio | IPv6 `permit PREFIX LEN` corrigido | ✅ feito |
| BGP policy bindings | implemented | `policy-dependency-pipeline.ts` | baixo | PEER_USES_POLICY no grafo | — |
| Controlled execution | not applicable | `bgp-announcement.gate.ts` | alto se habilitado | Manter `EXECUTION=false` | Não implementar |
| Approval flow execução | not applicable | RBAC `bgp.announcements.approve/execute` | médio | Draft only no MVP | Fase futura |
| Audit logs preview | partial | `logAuditEvent` em controller | baixo | Expandir cobertura | Opcional |
| Frontend BGP Operations | implemented | `AnnouncementPanel.tsx`, NetOps tree | baixo | Modal pode enriquecer rollback | Opcional |

---

## FASE 2 — Grafo de dependências

| Relação | Status | Arquivos | Risco | Recomendação | Próxima ação |
|---------|--------|----------|-------|--------------|--------------|
| NETWORK_USES_ORIGIN_POLICY | implemented | `bgp-policy-graph.builder.ts` | — | — | — |
| PEER_USES_POLICY | implemented | idem | — | — | — |
| POLICY_HAS_NODE | implemented | idem | — | — | — |
| POLICY_NODE_MATCHES_PREFIX_LIST | implemented | idem | — | — | — |
| POLICY_NODE_MATCHES_COMMUNITY_FILTER | partial → **implemented** | idem | médio | Inclui flag `protectedGlobal` | ✅ feito |
| POLICY_NODE_MATCHES_AS_PATH_FILTER | partial → **implemented** | idem | baixo | if-match as-path-filter | ✅ feito |
| POLICY_NODE_MATCHES_EXTCOMMUNITY_FILTER | missing | — | baixo | Raro em lab Huawei | Backlog |
| POLICY_NODE_APPLIES_COMMUNITY | implemented | idem | — | — | — |
| POLICY_NODE_APPLIES_COMMUNITY_LIST | implemented | idem | — | — | — |
| COMMUNITY_LIST_CONTAINS_COMMUNITY | implemented | idem | — | — | — |
| COMMUNITY_FILTER_MATCHES_COMMUNITY | partial → **implemented** | idem | médio | Via catalog entries | ✅ feito |
| POLICY_NODE_APPLIES_AS_PATH | partial → **implemented** | idem | — | apply as-path | ✅ feito |
| POLICY_NODE_APPLIES_LOCAL_PREF | partial → **implemented** | idem | baixo | apply local-preference | ✅ feito |
| POLICY_NODE_GOTO_NEXT | partial → **implemented** | idem | baixo | goto next-node | ✅ feito |
| COMMUNITY_RESOLVES_TO_CIRCUIT_ACTION | partial → **implemented** | idem | — | Edge semântica | ✅ feito |

---

## FASE 3–10 — Domínio funcional

| Item | Status | Arquivos | Risco | Recomendação | Próxima ação |
|------|--------|----------|-------|--------------|--------------|
| Classificação policies (origin/customer/upstream/mesh/unknown) | implemented | `policy-classifier.ts` | baixo | Heurística ASxxxx ok | Refinar por peer role |
| Upstream audit-only / target modifiable | implemented | classifier + preview gate | **crítico se violado** | Manter bloqueio Cxx | — |
| Circuit resolver (Cxx policy) | implemented | `circuit-policy.parser.ts` | — | — | — |
| Circuit ID de filter/prefix/as-path name | partial → **implemented** | `circuit-id.resolver.ts` | baixo | Regex Cxx em nomes | ✅ feito |
| Community 64777:5CIDACTION | implemented | `community-circuit.parser.ts` | — | — | — |
| Global community 64777:600xx | missing → **implemented** | `community-global.parser.ts` | médio | Namespace global separado | ✅ feito |
| Exclusividade por upstream | implemented | `community-set-matcher.ts` | alto | Testado | — |
| Off vs sem marcação (—) | implemented | matrix resolver + types | médio | action 67 vs ausente | — |
| Protected global filters | missing → **implemented** | `protected-global-filter.ts`, audit | **alto** | Não tratar como shared conflict | ✅ feito |
| Prefix-list expansion UI | implemented | `AnnouncementMatrixTable.tsx` | — | Expansor por linha | — |
| Community set exact match | implemented | `community-set-matcher.ts`, DB | — | Hash SHA256 | — |
| Preview compiler (diff/rollback/bloqueio) | implemented | `announcement-preview.service.ts` | **crítico** | Sem execução | — |
| Upstream audit Local-AS / prepend | partial → **implemented** | `bgp-upstream-audit.service.ts` | alto | P1–P4 vs as-path | ✅ reforçado |
| Findings ORIGIN_POLICY_WITHOUT_COMMUNITY | missing → **implemented** | matrix resolver | médio | Origin sem apply | ✅ feito |
| Findings UPSTREAM_EXPORT_POLICY_NO_OFF_RULE | missing → **implemented** | upstream audit | baixo | Regra Off explícita | ✅ feito |
| Findings PROTECTED_GLOBAL_FILTER_* | missing → **implemented** | upstream audit + preview | médio | Shared OK + preserve | ✅ feito |
| Findings COMMUNITY_LIST_SHARED_TARGET_BLOCKED | partial → **implemented** | preview + isShared sync | médio | MVP não edita list | ✅ feito |
| Materialização bgp_announcement_targets | partial | schema existe, não populado em build | baixo | Opcional performance | Backlog |
| Execução automática roteador | not applicable | gate 503 | **crítico** | Não implementar | — |

---

## FASE 11 — Frontend

| Tela/aba | Status | Arquivos | Gap | Próxima ação |
|----------|--------|----------|-----|--------------|
| Matriz | implemented | `AnnouncementPanel`, `AnnouncementMatrixTable` | Findings inline ok | — |
| Auditoria Upstreams | implemented | tab audit | Cards por Cxx | — |
| Biblioteca Communities | implemented | tab sets + sync | — | — |
| Change Plans | implemented | tab plans | Detalhe script/rollback | Backlog UI |
| Modal célula | partial | `AnnouncementEditModal` | Falta painel audit upstream inline | Opcional |
| Botão Executar | not applicable | ausente | Correto para MVP | — |
| NetOps Operations > Device > BGP | implemented | `netops-tree`, `AnnouncementPanel` | — | — |
| Atualizar = coleta SSH | implemented | `useRunDiscovery` | — | — |

---

## FASE 12 — Testes

| Selftest | Status antes | Status depois |
|----------|--------------|---------------|
| `bgp-announcement-matrix-selftest.mjs` | 1 arquivo | ✅ suite `matrix` |
| graph-parser | missing | ✅ `bgp-announcement-graph-parser-selftest.mjs` |
| community-resolver | missing | ✅ |
| prefix-expansion | missing | ✅ |
| community-set-match | missing | ✅ |
| preview-compiler | missing | ✅ |
| upstream-audit-local-as | missing | ✅ |
| upstream-audit-conflict | missing | ✅ |
| protected-global-filter | missing | ✅ |

Runner unificado: `tools/bgp-announcement-selftest-suites.mts`

---

## Prioridades atendidas nesta auditoria

1. ✅ Protected global filters  
2. ✅ Prefix-list expansion (IPv6)  
3. ✅ Community-set exact match (validado + isShared)  
4. ✅ Exclusividade por upstream (já existia, testes reforçados)  
5. ✅ Upstream audit Local-AS  
6. ✅ Preview seguro (findings adicionais)

---

## Riscos remanescentes

| Risco | Severidade | Mitigação |
|-------|------------|-----------|
| Classificação customer heurística (regex AS) | médio | Enriquecer com peer role do discovery |
| `bgp_announcement_targets` não materializado | baixo | Resolver on-the-fly ok para MVP |
| extcommunity-filter no grafo | baixo | Adicionar quando aparecer em prod |
| OpenAPI/Orval não gerado | baixo | fetch custom em `announcement-api.ts` |
| Execução acidental | **crítico** | Flags + RBAC + sem botão UI |

---

## Conclusão

A abstração v2 está **operacionalmente coberta no MVP read-only**. Gaps críticos restantes são **não executáveis por design** (execução) ou **backlog de UX/performance** (detalhe change plan, materialização targets, extcommunity).
