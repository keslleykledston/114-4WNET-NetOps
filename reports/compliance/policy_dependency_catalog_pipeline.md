# Policy Dependency Catalog Pipeline

## Pipeline antigo

- `parseHuaweiPolicies` misturava catálogo (`ip-prefix`) e consumer (`route-policy`) no mesmo fluxo.
- Compliance BGP fazia lookups diretos em arrays do snapshot.
- Route-policy era tratada como lista de policy e também como fonte de dependências.
- Catálogo ausente podia virar finding de dependência ausente em alguns caminhos.
- Evidência FOUND ficava parcial e acoplada ao finding pass final.

## Pipeline novo

FASE 1 - Catalogs:

- `community_filters`
- `ip_prefixes`
- `as_path_filters`
- `extcommunity_filters`
- `acls`

FASE 2 - Consumers:

- `route_policies`
- `bgp_peers`
- `peer_groups`
- `vpn_instances`

FASE 3 - Dependency resolver:

- `route_policy_dependencies`
- `bgp_policy_bindings`

FASE 4 - Compliance:

- `FOUND`: evidence/detail com severity `info`, não risco.
- `MISSING`: finding só quando catálogo do tipo está `loaded`.
- `UNKNOWN`: catálogo `empty`, `unknown` ou `failed`.
- `ORPHAN`: reservado como estado informativo para catálogo sem consumer.

## Arquivos alterados

- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-dependency-pipeline.ts`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-dependency-pipeline.js`
- `workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/policy-parser.ts`
- `workspace/artifacts/api-server/src/modules/netops/device-discovery/discovery.types.ts`
- `workspace/artifacts/api-server/src/modules/netops/device-discovery/normalizers/policy.normalizer.ts`
- `workspace/artifacts/api-server/src/modules/netops/device-discovery/discovery.orchestrator.ts`
- `workspace/artifacts/api-server/src/modules/netops/types.ts`
- `workspace/artifacts/api-server/src/modules/compliance/checks/bgp-checks.ts`
- `tools/policy-dependency-catalog-pipeline-selftest.mjs`
- `tools/compliance-community-filter-reference-selftest.mjs`
- `tools/bgp-community-filter-resmoke.mjs`

## Evidências

- Catálogo community-filter carregado antes de route-policy: `policy dependency catalog pipeline selftest passed`.
- Catálogo ip-prefix carregado antes de route-policy: `policy dependency catalog pipeline selftest passed`.
- Catálogo as-path-filter carregado antes de route-policy: `policy dependency catalog pipeline selftest passed`.
- FOUND community-filter: evidence `community-filter CF-FOUND encontrado no snapshot`.
- MISSING community-filter: `Route-policy RP-MISSING-CF node 20 referencia community-filter CF-MISSING, mas ele não foi encontrado no snapshot`.
- UNKNOWN community-filter: `Catálogo community-filter indisponível ... status=empty`.
- FOUND ip-prefix: evidence `ip-prefix PFX-FOUND encontrado no snapshot`.
- MISSING ip-prefix: `Route-policy RP-MISSING-PFX node 40 referencia ip-prefix PFX-MISSING, mas ele não foi encontrado no snapshot`.
- FOUND BGP binding: evidence `BGP consumer peer-a export route-policy RP-EXPORT encontrado no snapshot`.
- MISSING BGP binding: `BGP consumer peer-b referencia route-policy RP-MISSING import, mas ela não foi encontrada no snapshot`.

## Testes executados

- `node tools/policy-dependency-catalog-pipeline-selftest.mjs`
- `node tools/compliance-community-filter-reference-selftest.mjs`
- `node tools/bgp-peer-parser-selftest.mjs`
- `node tools/bgp-community-filter-resmoke.mjs`
- `cd workspace && pnpm --filter @workspace/api-server run typecheck`
- `cd workspace && pnpm run typecheck`
- `tools/apply-containers.sh api`
- `docker compose ps api`

## Riscos

- Baixo/médio: compliance BGP agora usa grafo central de dependências. Saída de findings muda para mensagens mais específicas.
- `UNKNOWN` substitui falso `MISSING` quando catálogo não carregou.
- BGP peer/route-policy binding agora respeita status do catálogo `route_policies`.

## Read-only

- Nenhum write em device.
- Nenhum write em NetBox.
- Nenhum sync.
- Nenhum apply plan.
- Comandos executados foram testes locais, typecheck, build/recreate do container API e resmoke read-only.
