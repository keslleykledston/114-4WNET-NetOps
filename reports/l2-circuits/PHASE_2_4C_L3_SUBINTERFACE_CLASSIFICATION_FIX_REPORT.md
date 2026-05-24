# FASE 2.4C — L3 Subinterface Classification Fix — Report

**Date:** 2026-05-24  
**Status:** **GO**  
**Branch:** `feature/v0.3.4-operational-pilot-noc`

---

## Resumo

Subinterfaces dot1q com IP/IPv6/OSPF/VRF eram classificadas como `vlan_orphan` após FASE 2.4. Corrigido parser + inferência read-time. L3 válido → `l3_interface`; órfã real continua `vlan_orphan`. Match exato por interface preservado.

---

## Causa raiz

**Regra errada (FASE 2.4):** `inferDot1qView()` e classificador tratavam subif dot1q sem description/binding L2 como órfã, **ignorando evidência L3** (IP, IPv6, OSPF, VRF).

**Parser legado:** `hasIp || hasVrf` em dot1q **sem VRF** caía em `l3_vrf_link` — também incorreto para casos como Eth-Trunk1.93 (só IPv4).

---

## Abstração corrigida

**Novo helper:** `parsers/l3-evidence.helpers.ts`

- `hasL3ServiceEvidence(flags, rawEvidence?)` — detecta serviço L3
- `buildL3RoleContext(flags)` — JSON role_context L3

**Regra VLAN_ORPHAN (nova):** só quando **nenhuma** evidência L2 **nem** L3:

- sem IP/IPv6/VRF/OSPF/ISIS/BGP/RIP/MPLS L3
- sem L2 binding / ve-group / bridge-domain / vsi / l2vc
- sem description válida como único critério L2 (dot1q)

**Regra L3 (nova):** qualquer evidência L3 →

- `classification = l3_interface`
- `circuit_type = l3_interface`
- `l2_transport = l3`
- **sem** `VLAN_ORPHAN`

Com VRF binding (`ip binding vpn-instance`):

- `classification = l3_vrf_link` (compat schema atual)

---

## Exemplos corrigidos

### Eth-Trunk1.93 (Caso A)

```
vlan-type dot1q 93
ip address 10.20.0.1 ...
statistic enable
```

| Campo | Valor |
|-------|-------|
| classification | `l3_interface` |
| findings | `DESCRIPTION_MISSING` |
| VLAN_ORPHAN | **não** |
| flags | dot1q, ipv4, statistic_enable |

### Eth-Trunk2.152 (Caso B)

```
ip/ipv6 + ospf network-type p2p + mtu + statistic enable
```

| Campo | Valor |
|-------|-------|
| classification | `l3_interface` |
| role_context | `{ service_family: "l3", ipv4: true, ipv6: true, ospf: true }` |
| findings | `DESCRIPTION_MISSING` only |
| VLAN_ORPHAN | **não** |

### Por que IP/IPv6/OSPF elimina VLAN_ORPHAN

NE/VRP: subif dot1q com endereço ou protocolo de roteamento = **serviço L3 válido**, não resíduo L2. Órfã = dot1q nu sem amarração.

### Eth-Trunk1.891 (órfã real — Caso C)

```
vlan-type dot1q 891
```

| Campo | Valor |
|-------|-------|
| classification | `vlan_orphan` |
| finding | `VLAN_ORPHAN` (warning) |
| flags | dot1q only |

---

## Findings

| Cenário | Findings |
|---------|----------|
| L3 sem description | `DESCRIPTION_MISSING` (info) — mensagem PT recomendando descrição operacional |
| L3 com description | nenhum finding de orphan |
| Órfã real | `VLAN_ORPHAN` + opcional `ROUTER_L2_VLAN_ANOMALY` |
| Match exato | preservado (Caso D — Eth-Trunk1.89/.891/.893) |

---

## Arquivos alterados

```
workspace/artifacts/api-server/src/modules/l2circuits/parsers/l3-evidence.helpers.ts      (novo)
workspace/artifacts/api-server/src/modules/l2circuits/parsers/dot1q-local.parser.ts
workspace/artifacts/api-server/src/modules/l2circuits/l2circuits.types.ts
workspace/artifacts/api-server/src/modules/l2circuits/l2circuits.service.ts
workspace/artifacts/api-server/src/modules/l2circuits/normalizers/findings.resolver.ts
workspace/artifacts/netops-manager/src/features/l2-circuits/l2-circuit-badges.tsx
workspace/artifacts/netops-manager/src/features/l2-circuits/l2-circuit-detail-sheet.tsx
tools/l2-l3-subinterface-classification-selftest.mjs   (novo)
tools/l2-dot1q-parser-selftest.mjs                   (expectativa Eth-Trunk0.77)
```

---

## Testes executados

| Teste | Resultado |
|-------|-----------|
| `pnpm typecheck` | ✅ OK |
| `pnpm --filter @workspace/netops-manager build` | ✅ OK |
| `node tools/l2-l3-subinterface-classification-selftest.mjs` | ✅ PASS (A/B/C/D) |
| `node tools/l2-findings-interface-match-selftest.mjs` | ✅ PASS |
| `node tools/l2-dot1q-parser-selftest.mjs` | ✅ OK |
| `node tools/l2-classification-selftest.mjs` | ✅ OK |
| `node tools/l2-s6730-parser-selftest.mjs` | ✅ OK |

---

## Critérios de aceite

| Critério | Status |
|----------|--------|
| Eth-Trunk1.93 não é VLAN_ORPHAN | ✅ |
| Eth-Trunk1.93 é L3 (Subif L3) | ✅ |
| Eth-Trunk1.93 só DESCRIPTION_MISSING | ✅ |
| Eth-Trunk2.152 não é VLAN_ORPHAN | ✅ |
| Eth-Trunk2.152 reconhece IPv4/IPv6/OSPF | ✅ |
| VLAN_ORPHAN para dot1q puro | ✅ |
| Match exato por interface | ✅ |
| VLAN_LOCAL / L2VC / VSI intactos | ✅ |
| typecheck + build OK | ✅ |
| zero SSH / discovery | ✅ |
| L2_DISCOVER_SSH_ENABLED=false | ✅ |

---

## Impacto UI

- Badge **Subif L3** para `l3_interface`
- Badge **VLAN Órfã** só em órfã real
- Detail sheet: classification, l2_transport, L3 service context
- **Rebuild web necessário** para badges/detail em container (`netops-web`)
- **Rebuild API necessário** para inferência read-time em produção (`netops-api`)

---

## Veredito

**GO** — classificação L3 vs órfã corrigida; findings isolados; regressões L2 OK.
