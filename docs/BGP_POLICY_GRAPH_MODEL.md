# BGP Policy Graph Model

Data: 2026-06-06

## Objetivo

Modelar configuração BGP Huawei VRP como **grafo tipado**, não como texto, para suportar:

- matriz prefixo × upstream
- índice reverso community → usage
- expansão de prefix-list
- preview com preservação de communities
- auditoria upstream

## Nós

| Tipo | Identificador | Origem |
|------|---------------|--------|
| `network` | prefix + family | parser `bgp-network.parser` |
| `peer` / `peer_group` | peerKey | `bgp-peer-dependency-parser` |
| `route_policy` | policy name | `policy-dependency-pipeline` |
| `policy_node` | policy + sequence | idem |
| `ip_prefix_list` | name | catalogs.ip_prefixes |
| `ipv6_prefix_list` | name | catalogs.ipv6_prefixes |
| `community_filter` | name | catalogs.community_filters |
| `community_list` | name | community-parser |
| `community` | value string | apply / list / filter |
| `upstream_circuit` | circuit_id | classifier + catalog |

## Arestas

| Relação | De → Para | Atributos |
|---------|-----------|-----------|
| `NETWORK_USES_ORIGIN_POLICY` | network → route_policy | source line |
| `PEER_USES_POLICY` | peer/group → route_policy | direction, family |
| `POLICY_HAS_NODE` | route_policy → policy_node | action |
| `POLICY_NODE_MATCHES_PREFIX_LIST` | node → ip/ipv6 prefix list | raw if-match |
| `POLICY_NODE_MATCHES_COMMUNITY_FILTER` | node → community_filter | |
| `POLICY_NODE_APPLIES_COMMUNITY` | node → community | direct apply |
| `POLICY_NODE_APPLIES_COMMUNITY_LIST` | node → community_list | |
| `COMMUNITY_LIST_CONTAINS_COMMUNITY` | list → community | position |
| `COMMUNITY_FILTER_MATCHES_COMMUNITY` | filter → community | permit/deny |
| `COMMUNITY_RESOLVES_TO_CIRCUIT_ACTION` | community → circuit + action | semantic label |
| `POLICY_CLASSIFIED_AS` | route_policy → class | modifiable, audit_only |

## Classificação de policies

```typescript
type PolicyClass =
  | "origin_target"           // modifiable
  | "customer_target"         // modifiable
  | "upstream_export_audit"   // audit_only
  | "upstream_import_audit"   // audit_only
  | "internal_mesh"           // audit_only MVP
  | "unknown";                // modifiable=false
```

Heurísticas:

- `origin_target`: referenciada em `network … route-policy` OU nome `ORIGIN-*`
- `customer_target`: `AS\d+-.*-(Import|Export)` em peer customer
- `upstream_*`: regex circuito `Cxx-*-(IMPORT|EXPORT)`
- `internal_mesh`: `MALHA-*`, reflect-client, iBGP interno

## Índice reverso (obrigatório)

```text
community
  → community_lists[]
  → policy_nodes[]
  → route_policies[]
  → networks[] | peers[]
```

Implementado em `bgp-policy-graph.builder.ts` → `reverseIndex`.

## Resolução de estado por célula

Para target node com communities `{64777:50101, 64777:51003, 64777:51601}`:

1. Parse cada community via `community-circuit.parser`
2. Agrupar por `circuit_id`
3. Se >1 action por circuit → `Conflict`
4. Se action desconhecida → `Unknown` (nunca Off)
5. Se ausente para circuit → `—` (sem marcação)
6. Lookup action_code → label UI (On, P1, …)

## Exclusividade na alteração

Ao mudar circuit 10 de On→P2:

```text
Antes: 64777:50101 64777:51001 64777:51601
Depois: 64777:50101 64777:51003 64777:51601
```

Nunca: `64777:51001 64777:51003` simultâneos.

## Community-list match

1. Normalizar conjunto desejado (sort + dedupe)
2. Hash SHA256 do conjunto ordenado
3. Match exato em `bgp_community_sets.normalized_hash`
4. Se match → `apply community community-list NAME`
5. Se não → communities diretas; finding `COMMUNITY_SET_NO_EXACT_MATCH`

## Upstream audit (export policy)

Para cada `Cxx-EXPORT*`:

1. Parse nodes com `if-match community-filter`
2. Resolver filter → community value
3. Validar circuit_id community vs circuit_id policy
4. Validar action_code vs nome filter (P3, OFF, …)
5. Validar `apply as-path` vs Local-AS (SNMP/peer model)
6. Emitir findings tipados

## Implementação

| Arquivo | Responsabilidade |
|---------|------------------|
| `parsers/circuit-policy.parser.ts` | Regex Cxx policies |
| `parsers/community-circuit.parser.ts` | 64777:5CIDACTION |
| `parsers/apply-community.parser.ts` | apply community / list |
| `parsers/bgp-network.parser.ts` | network route-policy |
| `graph/bgp-policy-graph.builder.ts` | Monta grafo + índices |
| `resolvers/policy-classifier.ts` | Classifica policies |
| `resolvers/semantic-dependency-classifier.ts` | targetRole, editMode, dependencyScope, protected globals |
| `services/semantic-matrix-view.service.ts` | Read model `semanticView` (counters, conflitos reais, globais) |
| `resolvers/announcement-matrix.resolver.ts` | Matriz + células |
| `resolvers/community-set-matcher.ts` | Match exato |
| `services/announcement-preview.service.ts` | Preview compiler |

Entrada canônica: `buildPolicyDependencyConfigFromSnapshot()` + raw config text.

## Visão semântica (MATRIX-SEMANTIC-VIEW)

- **Matriz principal:** apenas import de cliente + ORIGIN (`editable_future`).
- **Export Cxx:** excluída da matriz; visível em auditoria upstream (`audit_only`).
- **Globais protegidos:** `GLOBAL-*`, community-filters compartilhados — `protected_global`, sem falso positivo de remoção.
- **Conflitos reais:** apenas células `conflict` em rows editáveis; globais compartilhados suprimem finding `PREFIX_LIST_SHARED_BY_MULTIPLE_POLICIES`.
