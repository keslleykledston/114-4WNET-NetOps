# PHASE — BGP IPv6 Prefix Route-Policy False Positive Fix

**Date:** 2026-05-23  
**Status:** **GO** (fixture + unit pipeline; live compliance smoke pendente)  
**Vendor:** Huawei VRP

---

## Resumo

Findings BGP/Compliance marcavam **MISSING** em `if-match ipv6 address prefix-list <NAME>` porque parser tratava como `ip-prefix` e buscava no catálogo IPv4. Corrigido: tipo `ipv6-prefix`, catálogo `ipv6_prefixes`, mensagens e resolver separados.

---

## Causa raiz

Em `policy-dependency-pipeline.ts` (e `policy-parser.ts`):

```regex
/\b(?:ip-prefix|prefix-list)\s+(\S+)/i
```

Casava linha Huawei:

```
if-match ipv6 address prefix-list GATEWAY-IPV6
```

→ `dependencyType = ip-prefix`  
→ lookup em `catalogs.ip_prefixes`  
→ prefix só existia como `ip ipv6-prefix GATEWAY-IPV6`  
→ **MISSING** (falso positivo)

---

## Falsos positivos (antes)

| Route-policy | Node | Ref | Mensagem errada |
|--------------|------|-----|-----------------|
| C17-IMPORT-IPV6 | 3011 | GATEWAY-IPV6 | referencia **ip-prefix** GATEWAY-IPV6 … não encontrado |
| MALHA-MNS-Export-IPv6 | 10 | AS266208-4WNET-V6-332 | referencia **ip-prefix** AS266208-4WNET-V6-332 … não encontrado |

---

## Evidência manual

Export `4WNET-BVA-BRT-RX.txt` (trechos):

```
ip ipv6-prefix AS266208-4WNET-V6-332 index 10 permit 2804:5984:8000:: 33 ...
ip ipv6-prefix GATEWAY-IPV6 index 10 permit :: 0

route-policy MALHA-MNS-Export-IPv6 permit node 10
 if-match ip-prefix AS268707-4WNET
 if-match ipv6 address prefix-list AS266208-4WNET-V6-332

route-policy C17-IMPORT-IPV6 permit node 3011
 if-match ipv6 address prefix-list GATEWAY-IPV6
```

Fixture sanitizada:  
`workspace/artifacts/api-server/src/modules/netops/huawei-vrp/parsers/__fixtures__/route-policy-ipv6-prefix-dependencies.txt`

---

## Regra nova

| Linha Huawei | dependencyType | Catálogo | Declaração config |
|--------------|----------------|----------|-------------------|
| `if-match ip-prefix NAME` | `ip-prefix` | `ip_prefixes` | `ip ip-prefix NAME ...` |
| `if-match ipv6 address prefix-list NAME` | `ipv6-prefix` | `ipv6_prefixes` | `ip ipv6-prefix NAME ...` |

- IPv4 e IPv6 **não** misturam catálogo.
- Catálogo `ipv6_prefixes` com status `loaded` \| `empty` \| `unknown`.
- `loaded` + ausente → **MISSING** (fail).
- `empty`/`unknown` → **UNKNOWN** (warning), não fail.

Mensagem MISSING correta:

> Route-policy \<POLICY\> node \<NODE\> referencia **ipv6-prefix** \<NAME\>, mas ele não foi encontrado no snapshot.

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `policy-utils.ts` / `.js` | `extractRoutePolicyIfMatchDependencies()` |
| `policy-dependency-pipeline.ts` | catálogo `ipv6_prefixes`, parse `ip ipv6-prefix`, resolver |
| `policy-parser.ts` | parse catálogo + matchDetails `ipv6-prefix` |
| `discovery.types.ts` | `ipv6PrefixLists`, matchDetail type |
| `policy.normalizer.ts` | split `ipv6PrefixLists` |
| `discovery.orchestrator.ts` | snapshot `ipv6PrefixLists` |
| `discovery.service.ts`, `evidence-store.ts`, `discovery-netops.adapter.ts` | plumbing |
| `netops/types.ts` | `NetopsFilter.type` + `ipv6-prefix` |
| `tools/compliance-ipv6-prefix-route-policy-selftest.mjs` | novo |
| `__fixtures__/route-policy-ipv6-prefix-dependencies.txt` | novo |

`bgp-checks.ts` — sem mudança de lógica; usa `dep.dependencyType` / `dep.evidence` já corrigidos.

---

## Findings antes / depois (fixture)

| Caso | Antes | Depois |
|------|-------|--------|
| C17 node 3011 / GATEWAY-IPV6 | fail ip-prefix MISSING | **FOUND** ipv6-prefix |
| MALHA node 10 / AS266208-4WNET-V6-332 | fail ip-prefix MISSING | **FOUND** ipv6-prefix |
| MALHA node 10 / AS268707-4WNET | FOUND ip-prefix | **FOUND** ip-prefix (IPv4 intacto) |
| Ref V6 inexistente, catálogo loaded | — | fail ipv6-prefix MISSING |
| Ref V6, catálogo empty | fail ip-prefix MISSING | **unknown** Catálogo ipv6-prefix indisponível |

---

## Testes executados

| Comando | Resultado |
|---------|-----------|
| `pnpm typecheck` | **PASS** |
| `pnpm --filter @workspace/api-server build` | **PASS** (após sync `policy-utils.js`) |
| `pnpm dlx tsx tools/compliance-ipv6-prefix-route-policy-selftest.mjs` | **PASS** (A–E) |
| `pnpm dlx tsx tools/policy-dependency-catalog-pipeline-selftest.mjs` | **PASS** |
| `pnpm dlx tsx tools/compliance-community-filter-reference-selftest.mjs` | **PASS** |

Nota: selftests importam `.ts` — usar `pnpm dlx tsx` (Node 20 puro falha em `.ts`).

Opcional existente `bgp-community-filter-resmoke.mjs` rodou contra stack local (DB) — fora escopo fixture-only; não substitui smoke compliance UI pós-deploy.

---

## Critérios de aceite

- [x] `if-match ipv6 address prefix-list` → `dependencyType=ipv6-prefix`
- [x] `ip ipv6-prefix` → catálogo `ipv6_prefixes`
- [x] resolver IPv6 só em `ipv6_prefixes`
- [x] C17-3011 / GATEWAY-IPV6 — FOUND na fixture
- [x] MALHA-10 / AS266208-4WNET-V6-332 — FOUND na fixture
- [x] mensagem usa `ipv6-prefix`, não `ip-prefix`
- [x] IPv4 `if-match ip-prefix` intacto
- [x] catálogo ausente → UNKNOWN, não fail
- [x] typecheck OK
- [x] api-server build OK
- [x] zero SSH / discovery nesta sessão

---

## Pendências

1. Smoke compliance **live/UI** após rebuild container API (não feito nesta fase).
2. Regenerar OpenAPI/Zod client se expor `ipv6PrefixLists` na API pública.
3. Commit dedicado quando solicitado.

---

## GO / NO-GO

**GO** para merge código + fixtures + selftests.

**NO-GO** para fechar piloto compliance em produção até smoke live confirmar ausência dos dois falsos positivos no device BRT-RX.
