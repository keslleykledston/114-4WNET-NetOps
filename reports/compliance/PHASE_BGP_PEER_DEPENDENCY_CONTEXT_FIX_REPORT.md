# PHASE — BGP Peer Dependency Context Fix

**Date:** 2026-05-23  
**Status:** **GO** (fixtures + selftests; live compliance smoke pendente)  
**Vendor:** Huawei VRP / NE  
**Base:** export manual `4WNET-BVA-BRT-RX.txt` (sanitizado)

---

## Resumo

Compliance tratava peering BGP sem separar **raiz BGP** vs **address-family**. Policies `import/export` na `ipv4-family` / `ipv6-family` não viravam dependências por AFI/SAFI; peer-group sem herança gerava falsos positivos.

Corrigido: parser dedicado `bgp-peer-dependency-parser.ts` + integração em `policy-dependency-pipeline.ts`.

---

## Causa raiz

1. `buildBgpPolicyBindings()` usava só `snapshot.bgpPeers` (output `display bgp peer`) — **sem** `route-policy import/export` por family do running-config.
2. Linhas `peer X enable` / `peer X route-policy P import` dentro de `ipv4-family unicast` eram ignoradas ou confundidas com peer “incompleto” na raiz.
3. Membros `peer X group IX-AM` não herdavam policies do peer-group na mesma family.

---

## Regra Huawei (implementada)

### Raiz `bgp <ASN>` (antes de `*-family`)

| Linha | Campo |
|-------|--------|
| `peer X as-number N` | root peer / group |
| `peer X description` | description |
| `peer X connect-interface` | connectInterface |

### Dentro de address-family

| Contexto | afiSafi |
|----------|---------|
| `ipv4-family unicast` | `ipv4_unicast` |
| `ipv6-family unicast` | `ipv6_unicast` |
| `ipv4-family vpnv4` | `vpnv4` |
| `ipv6-family vpnv6` | `vpnv6` |
| `ipv4-family vpn-instance NAME` | `ipv4_vrf` |
| `ipv6-family vpn-instance NAME` | `ipv6_vrf` |

| Linha family | Efeito |
|--------------|--------|
| `peer X enable` | enabled |
| `peer X route-policy P import/export` | dependência route-policy |
| `peer X default-route-advertise` | flag |
| `peer X group G` | herança do group G |

### Resolver route-policy

- Catálogo `route_policies` **loaded** + policy ausente → **MISSING** (fail)
- Catálogo empty/unknown → **UNKNOWN** (warning), não fail

### Mensagens

- Direto: `Peer <PEER> em <AFI/SAFI> referencia route-policy <POLICY> <import/export>, mas ela não foi encontrada no snapshot.`
- Herdado: `Peer <PEER> em <AFI/SAFI> herda route-policy <POLICY> <import/export> do peer-group <GROUP>, mas ela não foi encontrada no snapshot.`

---

## Estrutura normalizada

- `BgpPeerRoot` — identidade na raiz BGP
- `BgpPeerFamily` — parâmetros por AFI/SAFI (+ `effectiveImportRoutePolicy`, `effectiveExportRoutePolicy`, `effectiveNextHopLocal`, `effectiveAdvertiseCommunity`, `effectiveAdvertiseExtCommunity` após herança)
- `BgpPeerPolicyDependency` — dependência route-policy resolvida
- `ParsedHuaweiBgpPeerDependencyModel` — modelo completo em `parsed_config.bgp_peer_model`

Grafo compliance:

```
peer 172.28.1.138 / ipv4_unicast
  → route-policy AS262663-WIFIZAO.BRT-Import-IPv4
    → ip-prefix AS262663-WIFIZAO (via pipeline existente)
```

---

## Arquivos

| Arquivo | Função |
|---------|--------|
| `bgp-peer-dependency-parser.ts` | parse root + family + herança + bindings |
| `bgp-peer-dependency-parser.js` | re-export build |
| `policy-dependency-pipeline.ts` | integra `bgp_peer_model` + bindings por config |
| `__fixtures__/bgp-peer-dependencies.txt` | fixture sanitizada |
| `tools/bgp-peer-dependency-selftest.mjs` | casos A–G |

**Preservado:** fix IPv4/IPv6 prefix (`ip-prefix` vs `ipv6-prefix`), community-filter, pipeline catalog.

---

## Falsos positivos corrigidos (esperado pós-deploy)

- Peer com `enable` + policies só na family → **não** fail por “peer incompleto” na raiz
- `if-match ipv6 address prefix-list` em policy do peer → continua `ipv6-prefix` (regressão OK)
- Membro de `IX-AM` → herda `C07-IMPORT-IPV6` / `C07-EXPORT` sem MISSING indevido

---

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `pnpm typecheck` | **PASS** |
| `pnpm --filter @workspace/api-server run build` | **PASS** |
| `pnpm dlx tsx tools/bgp-peer-dependency-selftest.mjs` | **PASS** (A–G) |
| `pnpm dlx tsx tools/bgp-peer-parser-selftest.mjs` | **PASS** |
| `pnpm dlx tsx tools/compliance-prefix-route-policy-selftest.mjs` | **PASS** |
| `pnpm dlx tsx tools/compliance-ipv6-prefix-route-policy-selftest.mjs` | **PASS** |
| `pnpm dlx tsx tools/policy-dependency-catalog-pipeline-selftest.mjs` | **PASS** |
| `pnpm dlx tsx tools/compliance-community-filter-reference-selftest.mjs` | **PASS** |

Não executado: `bgp-community-filter-resmoke` (live DB).  
Zero SSH / discovery nesta sessão.

---

## Limitações

1. Parser usa indentação Huawei (`peer` na raiz = 1 espaço; family peer = 2 espaços). Export com indent diferente pode precisar ajuste.
2. Peers só em family sem `as-number` na raiz: OK para policies; root opcional.
3. Smoke live/UI e device BRT-RX full export: **pendente** (fase seguinte, pós-rebuild API).

---

## Critérios de aceite

- [x] peer root e peer family separados
- [x] 172.28.1.138 as-number/description na raiz; enable/policies em ipv4_unicast
- [x] route-policy import/export → dependência do peer por AFI/SAFI
- [x] IPv6 ipv6_unicast OK
- [x] peer-group IX-AM herda para ::253/::254
- [x] vpnv4 MALHA enable + advertise-community
- [x] missing real → fail; catálogo ausente → UNKNOWN
- [x] grafo peer→policy→ip-prefix
- [x] typecheck + build + selftests OK
- [x] zero SSH / discovery

---

## GO / NO-GO

**GO** para commit + merge código/fixtures/selftests.

**NO-GO** para fechar piloto compliance produção até smoke live/UI no BRT-RX confirmar zero falsos positivos de peering + prefix.
