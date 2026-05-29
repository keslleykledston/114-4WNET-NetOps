# Community-filter Dependency Fix

## Arquivos alterados

- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/community-parser.ts`
- `workspace/artifacts/api-server/src/modules/compliance/checks/bgp-checks.ts`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/__fixtures__/route-policy-community-filter-dependencies.txt`
- `tools/compliance-community-filter-reference-selftest.mjs`
- `reports/compliance/community_filter_dependency_fix.md`

## Causa raiz

O parser Huawei VRP aceitava parte dos formatos de `ip community-filter`, mas não preservava a linha original nem expunha o tipo no formato esperado pelo teste de dependência. No parser auxiliar de community de route-policy, o node era salvo errado como `permit`/`deny` em vez do número do node.

Na análise BGP, a validação de dependências tratava community-filters ausentes no snapshot como falta genérica de catálogo em alguns caminhos. Isso gerava falso positivo pouco acionável mesmo quando o snapshot tinha community-filters parseados, ou não informava a dependência específica ausente.

## Antes / Depois

Antes:

```text
Não foi possível comprovar community-filters no snapshot
```

Depois, quando a dependência existe:

```text
community-filter GLOBAL-EXPORT-UPSTREAM-P3 encontrado no snapshot.
```

Depois, quando a dependência específica está ausente:

```text
Route-policy C15-EXPORT node 2013 referencia community-filter GLOBAL-EXPORT-UPSTREAM-P3, mas ele não foi encontrado no snapshot.
```

## Casos cobertos

- `ip community-filter basic NAME permit COMMUNITY`
- `ip community-filter basic NAME deny COMMUNITY`
- `ip community-filter basic NAME index 10 permit COMMUNITY`
- `ip community-filter advanced NAME permit ...`
- `ip community-filter advanced NAME index 10 permit ...`
- `route-policy NAME permit|deny node NUMBER`
- `if-match ip-prefix NAME`
- `if-match community-filter NAME`
- `apply community ...`
- `apply as-path ...`

## Testes executados

- `node tools/compliance-community-filter-reference-selftest.mjs`
- `node tools/bgp-peer-parser-selftest.mjs`
- `cd workspace && pnpm --filter @workspace/api-server run typecheck`
- `cd workspace && pnpm run typecheck`

Não há script `lint` nos `package.json` verificados.

## Riscos

- Baixo. Mudança limitada a parser de running-config Huawei VRP e findings de dependência BGP.
- O fluxo SSH existente não foi alterado.
- A validação continua read-only; nenhuma operação destrutiva foi adicionada.

## Confirmação operacional

Nenhum write em device foi feito.
Nenhum write em NetBox foi feito.
Nenhum comando destrutivo foi executado.
