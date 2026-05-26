# PHASE — BGP IPv4/IPv6 Prefix Route-Policy False Positive Fix

**Date:** 2026-05-23  
**Status:** **GO** (fixtures + selftests; live compliance smoke pendente)  
**Vendor:** Huawei VRP

---

## Resumo

Compliance BGP gerava **MISSING** em prefixos que existiam no export. Causa: `if-match ipv6 address prefix-list` classificado como `ip-prefix` e resolvido no catálogo IPv4. Corrigido com catálogos/resolvers separados. IPv4 `if-match ip-prefix` validado e intacto.

---

## Causa raiz

Regex legada no pipeline:

```regex
/\b(?:ip-prefix|prefix-list)\s+(\S+)/i
```

Casava substrings de linhas IPv6:

```
if-match ipv6 address prefix-list GATEWAY-IPV6
```

→ `dependencyType=ip-prefix` → lookup `ip_prefixes` → **MISSING** (falso positivo).

IPv4 correto (`if-match ip-prefix NAME`) às vezes falhava pelo mesmo regex ambíguo ou catálogo não populado com `ip ipv6-prefix` misturado.

---

## Correção

### Catálogos

| Declaração config | Catálogo | Tipo objeto |
|-------------------|----------|-------------|
| `ip ip-prefix NAME index N permit\|deny ...` | `ip_prefixes` | `ip-prefix` |
| `ip ipv6-prefix NAME index N permit\|deny ...` | `ipv6_prefixes` | `ipv6-prefix` |

### Dependências route-policy (`extractRoutePolicyIfMatchDependencies`)

Ordem **obrigatória**:

1. `^if-match ipv6 address prefix-list (\S+)` → `ipv6-prefix`
2. `^if-match ip-prefix (\S+)` → `ip-prefix`

**Proibido** regex genérica `prefix-list` para IPv6.

### Resolver

- `ip-prefix` → só `catalogs.ip_prefixes` + `catalog_status.ip_prefixes`
- `ipv6-prefix` → só `catalogs.ipv6_prefixes` + `catalog_status.ipv6_prefixes`
- Catálogo `loaded` + nome ausente → **MISSING** (fail)
- Catálogo `empty`/`unknown` → **UNKNOWN** (warning), não fail

### Mensagens

| Tipo | MISSING |
|------|---------|
| IPv4 | Route-policy \<P\> node \<N\> referencia **ip-prefix** \<NAME\>, mas ele não foi encontrado no snapshot. |
| IPv6 | Route-policy \<P\> node \<N\> referencia **ipv6-prefix** \<NAME\>, mas ele não foi encontrado no snapshot. |

---

## Evidência manual (4WNET-BVA-BRT-RX)

**IPv4:** `AS268707-4WNET`, `DEFAULT`, `GATEWAY-IPV4`, `C17-PREFIX-PREFERENCE-IPV4`, …

**IPv6:** `AS266208-4WNET-V6-332`, `GATEWAY-IPV6`, `C17-BLOCKLIST-IPV6`, …

**Uso:**

```
if-match ip-prefix AS268707-4WNET
if-match ipv6 address prefix-list GATEWAY-IPV6
```

---

## Fixtures

| Arquivo | Escopo |
|---------|--------|
| `route-policy-ipv4-ipv6-prefix-dependencies.txt` | Casos A–H (V4+V6) |
| `route-policy-ipv6-prefix-dependencies.txt` | C17 / MALHA (regressão IPv6) |

---

## Selftests

| Script | Casos | Resultado |
|--------|-------|-----------|
| `compliance-prefix-route-policy-selftest.mjs` | A–H + separação catálogo | **PASS** |
| `compliance-ipv6-prefix-route-policy-selftest.mjs` | A–E IPv6 | **PASS** |
| `policy-dependency-catalog-pipeline-selftest.mjs` | pipeline geral | **PASS** |
| `compliance-community-filter-reference-selftest.mjs` | community (regressão) | **PASS** |

Rodar: `pnpm dlx tsx tools/<script>.mjs`

`bgp-community-filter-resmoke.mjs` — **não executado** (live DB; fora escopo).

`bgp-peer-parser-selftest.mjs` — opcional; não bloqueia GO prefix.

---

## Validações build

| Comando | Resultado |
|---------|-----------|
| `pnpm typecheck` | **PASS** |
| `pnpm --filter @workspace/api-server build` | **PASS** |

---

## Findings antes / depois (fixture combinada)

| Ref | Antes | Depois |
|-----|-------|--------|
| `if-match ip-prefix AS268707-4WNET` | MISSING ou tipo errado | **FOUND** `ip-prefix` |
| `if-match ip-prefix DEFAULT` | MISSING | **FOUND** |
| `if-match ip-prefix GATEWAY-IPV4` | MISSING | **FOUND** |
| `if-match ipv6 … AS266208-4WNET-V6-332` | fail `ip-prefix` | **FOUND** `ipv6-prefix` |
| `if-match ipv6 … GATEWAY-IPV6` | fail `ip-prefix` | **FOUND** `ipv6-prefix` |
| MISSING-V4 / MISSING-V6 | — | fail com mensagem correta |
| catálogo vazio V4/V6 | fail indevido | **UNKNOWN** |

---

## Arquivos (escopo commit)

- `policy-dependency-pipeline.ts` / `.js`
- `policy-utils.ts` / `.js`
- `policy-parser.ts`
- `discovery.types.ts`, `policy.normalizer.ts`, `discovery.orchestrator.ts`, `discovery.service.ts`, `evidence-store.ts`, `discovery-netops.adapter.ts`
- `netops/types.ts`
- fixtures `route-policy-*-prefix-dependencies.txt`
- `tools/compliance-prefix-route-policy-selftest.mjs`
- `tools/compliance-ipv6-prefix-route-policy-selftest.mjs`
- `tools/policy-dependency-catalog-pipeline-selftest.mjs`
- este relatório + `PHASE_BGP_IPV6_PREFIX_POLICY_FALSE_POSITIVE_FIX_REPORT.md`

---

## Critérios de aceite

- [x] IPv4 `if-match ip-prefix` → `ip-prefix` / `ip_prefixes`
- [x] IPv4 existente → FOUND
- [x] IPv4 missing → fail
- [x] IPv4 catálogo ausente → UNKNOWN
- [x] IPv6 `if-match ipv6 address prefix-list` → `ipv6-prefix` / `ipv6_prefixes`
- [x] IPv6 existente → FOUND
- [x] IPv6 missing → fail
- [x] IPv6 catálogo ausente → UNKNOWN
- [x] Mensagens diferenciam ip-prefix vs ipv6-prefix
- [x] typecheck + build + selftests OK
- [x] zero SSH / discovery nesta sessão

---

## Pendências

1. Smoke compliance **live/UI** pós-rebuild API (fase seguinte).
2. Validar device BRT-RX com export completo `4WNET-BVA-BRT-RX.txt`.

---

## GO / NO-GO

**GO** para commit código + fixtures + selftests.

**NO-GO** para fechar piloto compliance em produção até smoke live confirmar zero falsos positivos prefix V4/V6 na UI.
