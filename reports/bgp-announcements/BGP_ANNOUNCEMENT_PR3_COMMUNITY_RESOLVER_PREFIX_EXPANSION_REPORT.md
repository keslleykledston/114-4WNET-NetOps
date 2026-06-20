# BGP Announcement Matrix - PR 3 Community Resolver + Prefix Expansion

## 1. Resumo executivo
Este PR fecha a parte visivel da matriz BGP.

- Community por upstream agora e resolvida para cells reais.
- Prefix scope agora expande `network`, `ip-prefix` e `ipv6-prefix`.
- A matriz passou a ter colunas por upstream e cells por target.
- `community-list` e `apply community ...` entram no resolver de leitura.
- Erros de conflito, namespace desconhecido e prefix-list faltando viram findings.

## 2. O que foi implementado
### Community resolver
- Namespace base: `64777:5[CID][ACTION]`.
- Actions suportadas: `On`, `P1`, `P2`, `P3`, `P4`, `NE`, `Def`, `BH`, `Off`, `Rx`.
- `—` representa sem marcacao.
- `?` representa community desconhecida.
- `!` representa conflito de actions no mesmo upstream.
- `community-list` expande para leitura sem alterar lista existente.

### Prefix expansion
- `network ... route-policy ...` vira `prefixScope.type = network`.
- `if-match ip-prefix NAME` expande em `prefixScope.type = ip_prefix`.
- `if-match ipv6 address prefix-list NAME` expande em `prefixScope.type = ipv6_prefix`.
- Prefixos com `greater-equal` e `less-equal` preservam metadados.
- Prefix-list ausente ou vazia gera findings.

### Matrix real
- `rows` agora carregam `cells` por circuito.
- `columns` agora representam upstreams observados.
- `summary` conta `On`, `P1`, `P2`, `P3`, `P4`, `Off`, `Unmarked`, `Conflict`, `Unknown`.
- `generatedFrom` virou `policy_graph_community_resolver`.
- `featureStatus` virou `community_cells`.

## 3. Arquivos alterados
### Backend
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.graph.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.matrix-resolver.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.matrix-resolver.js`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.refresh.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.snapshot.service.ts`
- `workspace/artifacts/api-server/src/modules/bgp-announcements/bgp-announcements.types.ts`

### Frontend
- `workspace/artifacts/netops-manager/src/pages/bgp-announcements.tsx`

### Selftests
- `tools/bgp-announcement-community-resolver-selftest.mjs`
- `tools/bgp-announcement-prefix-expansion-selftest.mjs`
- `tools/bgp-announcement-matrix-cells-selftest.mjs`
- `tools/bgp-announcement-target-classification-selftest.mjs`
- `tools/bgp-announcement-snapshot-selftest.mjs`
- `tools/bgp-announcement-refresh-flow-selftest.mjs`

## 4. Como o community resolver funciona
- Lê `apply community 64777:5CIDACTION`.
- Lê `apply community community-list NAME` e expande a lista.
- Agrupa por `circuitId`.
- Se tem 1 action, gera cell.
- Se tem 2 actions diferentes no mesmo circuito, gera conflito.
- Se a community nao bate com namespace conhecido, vira `UNKNOWN_COMMUNITY_NAMESPACE`.

Exemplo de cell:
```json
{
  "circuitId": "10",
  "upstreamName": "C10",
  "state": "p2",
  "label": "P2",
  "community": "64777:51003",
  "actionCode": "03",
  "communitySourceType": "direct",
  "communitySourceName": null
}
```

## 5. Como o prefix expansion funciona
- `network 45.169.160.0 255.255.254.0 route-policy ORIGIN-X`
  - vira `45.169.160.0/23`
- `if-match ip-prefix AS269485-GTA`
  - expande para `45.187.201.0/24`
- `if-match ipv6 address prefix-list AS266208-4WNET-V6-332`
  - expande para `2804:5984:8000::/32`
- `greater-equal` e `less-equal` ficam no item expandido.

Exemplo de `prefixScope`:
```json
{
  "type": "ip_prefix",
  "name": "AS269485-RANGE",
  "expandedPrefixes": [
    {
      "index": 10,
      "action": "permit",
      "prefix": "138.219.128.0/22",
      "ge": 22,
      "le": 24,
      "raw": "ip ip-prefix AS269485-RANGE index 10 permit 138.219.128.0 22 greater-equal 22 less-equal 24"
    }
  ],
  "affectedPrefixCount": 1,
  "shared": false
}
```

## 6. Exemplo de row
Exemplo real de PR 3:
- `ORIGIN-RP`
  - `prefixScope.type = network`
  - cell `01 = On`
  - cell `10 = P2`
- `CUST-RP`
  - `prefixScope.type = ip_prefix`
  - cell `10 = On`

## 7. Limitations
- Preview compiler ainda nao entrou.
- Change-plan real ainda nao entrou.
- Community-set exact match ainda nao entrou.
- Upstream audit Local-AS ainda nao entrou.
- Apply/exec continuam fora.
- Editor de matriz continua read-only.

## 8. Endpoints impactados
- `GET /api/bgp/announcements/matrix/latest`
- `POST /api/bgp/announcements/matrix/refresh`

Os dois continuam iguais na rota, mas agora devolvem payload com:
- `columns`
- `rows`
- `prefixScope` estruturado
- `cells` por upstream
- `summary` com contagem de states

## 9. Testes rodados
### Typecheck
- `pnpm run typecheck`
- Resultado: verde

### Selftests
- `node tools/bgp-announcement-snapshot-selftest.mjs` - verde
- `node tools/bgp-announcement-refresh-flow-selftest.mjs` - verde
- `node tools/bgp-announcement-target-classification-selftest.mjs` - verde
- `node tools/bgp-announcement-community-resolver-selftest.mjs` - verde
- `node tools/bgp-announcement-prefix-expansion-selftest.mjs` - verde
- `node tools/bgp-announcement-matrix-cells-selftest.mjs` - verde

### Sinais observados
- `DIRECT-CONFLICT` gerou `MULTIPLE_ACTIONS_FOR_SAME_UPSTREAM`.
- `UNKNOWN` gerou `UNKNOWN_COMMUNITY_NAMESPACE`.
- `EMPTY-LIST` gerou `COMMUNITY_LIST_NOT_FOUND`.
- `MISSING` gerou `PREFIX_LIST_EMPTY` e `PREFIX_LIST_EXPANSION_REQUIRED`.

## 10. Proximos passos
PR 4 sugerido:
- prefix-list shared detection melhor.
- community-set exact match.
- upstream audit Local-AS.
- summary e findings mais finos por target.
- preview/change-plan usando snapshot base.

