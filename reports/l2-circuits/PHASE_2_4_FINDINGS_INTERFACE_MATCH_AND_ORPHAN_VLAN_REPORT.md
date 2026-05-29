# FASE 2.4 — Findings Interface Match + VLAN Órfã — Report

**Date:** 2026-05-24  
**Status:** **GO**  
**Branch:** `feature/v0.3.4-operational-pilot-noc`

---

## Resumo

Corrigido bug onde findings de interfaces parecidas (ex.: `Eth-Trunk1.891`) apareciam no circuito `Eth-Trunk1.89`. Causa: attach por `message.includes(circuit.name)`. Solução: chave lógica exata + rehydrate na leitura API. Classificação `vlan_orphan` + finding `VLAN_ORPHAN` reforçados.

---

## Causa raiz

**Arquivo:** `workspace/artifacts/api-server/src/modules/l2circuits/normalizers/findings.resolver.ts`

```typescript
// ANTES (bug)
findings.filter((f) => f.message.includes(circuit.name))
```

`"Eth-Trunk1.891".includes("Eth-Trunk1.89") === true` → findings vazavam entre subinterfaces.

Documentado também em `reports/l2-circuits/MVP_VALIDATION_REPORT.md` item 12.

---

## Correção aplicada

### 1. Helper chave exata

**Novo:** `normalizers/circuit-key.helpers.ts`

`buildCircuitKey(circuit, deviceId)`:

| Família | Chave |
|---------|-------|
| dot1q / vlan_local / orphan | `device\|dot1q\|local_interface\|outer_vlan\|inner_vlan` |
| l2vc / vpws | `device\|type\|local_interface\|vc_id\|peer_ip` |
| vsi / vpls | `device\|type\|vsi_name\|vsi_id\|peer_ip\|local_interface` |

**Proibido:** startsWith, includes, regex sem boundary no attach.

### 2. Findings resolver reescrito

**Arquivo:** `findings.resolver.ts`

- `enrichCircuitsWithFindings()` — attach por chave exata durante geração
- `resolveL2Findings()` — flat list deduped (contadores job)
- `attachFindingsToCircuits()` — wrapper legacy → enrich

Mensagens usam `circuitLabel()` → `localInterface` preferido sobre `name`.

### 3. Rehydrate na leitura API (261 rows preservados)

**Arquivo:** `l2circuits.service.ts`

- `listL2Circuits`, `getL2Circuit`, `getL2CircuitsByRunId` recomputam findings na leitura
- **Sem SSH/discovery** — corrige UI com dados já persistidos
- `inferDot1qView()` — infere `vlan_orphan` quando DB legado sem `classification`/description/binding

### 4. Classificação VLAN órfã (parser)

**Arquivo:** `parsers/dot1q-local.parser.ts`

- `hasValidDescription` (dot1q subif, não vlanif) conta como uso L2 real
- dot1q isolado → `circuit_type=vlan_orphan`, `classification=vlan_orphan`

### 5. Finding VLAN_ORPHAN

Mensagem PT com recomendação operacional (warning).

### 6. UI badges

**Arquivo:** `l2-circuit-badges.tsx`

- Label `VLAN Órfã` para `vlan_orphan`
- Badge inline `VLAN Órfã` em `NocFindingBadges`

---

## Exemplo Eth-Trunk1.89 vs .891

### Selftest (fixture sintética)

| Interface | circuit_type | Findings próprios |
|-----------|--------------|-------------------|
| Eth-Trunk1.89 (com description) | vlan_local | CIRCUIT_DOWN, DESCRIPTION_MISSING — **sem** leak 891/893 |
| Eth-Trunk1.891 | vlan_orphan | VLAN_ORPHAN + ROUTER_L2_VLAN_ANOMALY |
| Eth-Trunk1.893 | vlan_orphan | VLAN_ORPHAN + ROUTER_L2_VLAN_ANOMALY |

Chaves distintas: `1|dot1q|Eth-Trunk1.89|89|` ≠ `1|dot1q|Eth-Trunk1.891|891|`

### API live (device_id=1, pós-fix)

```
Eth-Trunk1.89   → findings só sobre Eth-Trunk1.89
Eth-Trunk1.891  → findings só sobre Eth-Trunk1.891
Eth-Trunk1.893  → findings só sobre Eth-Trunk1.893
```

DB legado: description vazia em `.89` → infer `vlan_orphan` + `DESCRIPTION_MISSING` (consistente com row).

---

## Arquivos alterados

```
workspace/artifacts/api-server/src/modules/l2circuits/normalizers/circuit-key.helpers.ts   (novo)
workspace/artifacts/api-server/src/modules/l2circuits/normalizers/findings.resolver.ts
workspace/artifacts/api-server/src/modules/l2circuits/l2circuits.service.ts
workspace/artifacts/api-server/src/modules/l2circuits/parsers/dot1q-local.parser.ts
workspace/artifacts/netops-manager/src/features/l2-circuits/l2-circuit-badges.tsx
tools/l2-findings-interface-match-selftest.mjs   (novo)
tools/l2-classification-dryrun.mjs
```

---

## Testes executados

| Teste | Resultado |
|-------|-----------|
| `pnpm typecheck` | ✅ OK |
| `pnpm --filter @workspace/netops-manager build` | ✅ OK |
| `node tools/l2-findings-interface-match-selftest.mjs` | ✅ PASS |
| `node tools/l2-dot1q-parser-selftest.mjs` | ✅ OK |
| `node tools/l2-s6730-parser-selftest.mjs` | ✅ OK |
| `node tools/l2-classification-selftest.mjs` | ✅ OK |
| `GET /api/l2-circuits?device_id=1` | ✅ 200, 131 circuitos |
| Findings isolados por interface | ✅ |

---

## Flags / SSH / discovery

| Item | Valor |
|------|-------|
| `L2_DISCOVER_SSH_ENABLED` | **false** |
| SSH | **zero** |
| Discovery | **zero** |
| Rows DB | **261 preservados** |
| Migration destrutiva | **nenhuma** |

---

## UI

- Detail sheet: findings próprios via API rehydrate ✅
- Badge `VLAN Órfã` no frontend (requer rebuild web para deploy container)
- API rebuild aplicado para smoke backend

---

## Pendências

1. **Rebuild `netops-web`** para badge/deploy UI em container
2. **Re-discovery** (futuro, com flag) persiste `classification` no DB — infer read-time é view-only
3. DB legado sem `evidence_flags` ricos — infer orphan conservador
4. Paginação server-side — FASE 2.5+

---

## Veredito

**GO** — findings por interface corrigidos; vlan órfã classificada; selftests passam; API live OK; zero SSH/discovery.
