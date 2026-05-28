# L2 Operational Refresh — Closure Report (L2-OPS.1)

**Date:** 2026-05-28
**Status:** **GO**
**Commit:** `f2fa7bc` — `feat(l2): add controlled operational refresh for circuits`
**Branch:** `feature/v0.3.4-operational-pilot-noc`

---

## Resumo executivo

L2-OPS.1 entrega **refresh operacional controlado** para circuitos L2 já descobertos: atualiza status operacional (SNMP IF-MIB + SSH ops read-only), **recalcula findings** a partir do estado atual, e persiste **freshness** por device em `l2_device_operational`.

A UI `/l2-circuits` passa a focar **problemas por default**, com checkbox para circuitos saudáveis, botão **Atualizar operacional**, e badge de freshness / última atualização operacional.

Produção permanece **gate OFF** por default. Piloto real validado em **1 device** (`device_id=1`) com rollback confirmado.

| Fase | Escopo | Veredito |
|------|--------|----------|
| L2-OPS.1 | Implementação + commit | **GO** |
| L2-OPS.1B | Smoke flag OFF (sem rede) | **GO** |
| L2-OPS.1C | Refresh real device 1 + rollback | **GO** |

---

## Commit de referência

| Item | Valor |
|------|--------|
| Hash | `f2fa7bc` |
| Subject | `feat(l2): add controlled operational refresh for circuits` |
| Arquivos | 23 (+1416 / −42 linhas) |
| Backend | `operational-refresh/*`, controller, routes, types, findings |
| DB | `0019_l2_operational_refresh.sql`, `l2_operational.ts` |
| UI | `l2-circuits.tsx`, features `l2-circuits/*` |
| Smoke | `tools/l2-ops-1b-refresh-flag-off-smoke.mjs` |
| Reports | `PHASE_L2_OPS_1B_*`, `PHASE_L2_OPS_1C_*` |

**Fora do commit (intencional):** compose overrides efêmeros, `.env`, BGP/H3/compliance WIP, `docker-compose.yml` (flags documentadas em runbook).

---

## Arquitetura

```
POST /api/l2-circuits/refresh { device_id }
        │
        ▼
  Gate: L2_OPERATIONAL_REFRESH_ENABLED
        │ (503 L2_OPERATIONAL_REFRESH_DISABLED se false)
        ▼
  Pilot: SNMP_FAST_PILOT_DEVICE_IDS
        │
        ├── 1. Preflight device + SNMP credential + SSH credential
        │
        ├── 2. SNMP_FAST — IF-MIB (ifOperStatus / admin)
        │      collectSnmpInterfacesOnly()
        │      → match localInterface em circuitos existentes
        │
        ├── 3. SSH ops (read-only) — se credencial OK
        │      display mpls l2vc verbose | display mpls l2vc
        │      display vsi verbose | display interface brief
        │      (sem config dump se SSH_CONFIG=false)
        │
        ├── 4. Merge operacional → rows l2_circuits (UPDATE only)
        │
        ├── 5. enrichCircuitsWithFindings() — recálculo cross-circuit
        │
        └── 6. Upsert l2_device_operational (freshness, last_refresh_at)
```

**Não é discovery:** não insere circuitos novos; exige inventário prévio (`POST /discover` ou carga histórica).

**Camadas (design target):**

| Camada | L2-OPS.1 | Futuro |
|--------|----------|--------|
| SNMP_FAST | IF-MIB oper/admin | PW/VSI MIB quando disponível |
| SSH ops | L2VC/VSI/if brief | — |
| SSH_FULL_CONFIG | opt-in `L2_OPERATIONAL_REFRESH_SSH_CONFIG` | default false |
| SSH_DETAIL | não no refresh | on-demand (detalhe circuito) |

---

## Flags

| Flag | Default produção | Função |
|------|------------------|--------|
| `L2_OPERATIONAL_REFRESH_ENABLED` | **false** | Gate `POST /refresh` |
| `L2_OPERATIONAL_REFRESH_SSH_CONFIG` | **false** | Inclui `display current-configuration interface` |
| `NETOPS_SNMP_REAL_ENABLED` | **false** | SNMP real vs stub |
| `SNMP_FAST_PILOT_DEVICE_IDS` | `1` | Allowlist device IDs |
| `L2_DISCOVER_SSH_ENABLED` | **false** | Discovery full (separado) |
| `SNMP_POLL_ENABLED` | false (smoke) | Poller legado off |
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | false | Sem SSH BGP detail |

Freshness windows (opcional):

- `L2_OPERATIONAL_FRESH_MINUTES` (default 15)
- `L2_OPERATIONAL_STALE_HOURS` (default 24)

---

## API

### `POST /api/l2-circuits/refresh`

```json
{ "device_id": 1 }
```

| Condição | HTTP | `code` |
|----------|------|--------|
| Flag OFF | **503** | `L2_OPERATIONAL_REFRESH_DISABLED` |
| SNMP OFF | **503** | `L2_OPERATIONAL_SNMP_DISABLED` |
| Device fora pilot | **403** | — |
| Sem circuitos no DB | **404** | — |
| Sucesso | **200** | body com métricas |

Resposta sucesso (síncrona):

```json
{
  "device_id": 1,
  "last_refresh_at": "2026-05-28T04:37:36.560Z",
  "freshness": "fresh",
  "circuits_updated": 131,
  "findings_count": 62,
  "operational_state": {
    "snmp_interfaces": 138,
    "snmp_interface_matches": 100,
    "ssh_ops": true,
    "ssh_config": false
  },
  "warnings": []
}
```

### `GET /api/l2-circuits?device_id=N`

Inclui bloco `operational` quando filtrado por device:

```json
"operational": {
  "device_id": 1,
  "last_refresh_at": "2026-05-28T04:37:36.560Z",
  "freshness": "fresh"
}
```

---

## UI `/l2-circuits`

| Comportamento | Detalhe |
|---------------|---------|
| Default | `showOnlyProblems=true` — oculta circuitos saudáveis |
| Checkbox | **Mostrar circuitos saudáveis** |
| Botão | **Atualizar operacional** — exige device selecionado; POST refresh |
| Freshness | Badge Fresh / Stale / Expired / Unknown |
| Timestamp | **Última atualização operacional** (com device no filtro) |
| Flag OFF | Toast erro 503 — refresh desabilitado |

**Problemas (filtro NOC):** `operStatus` em DOWN/PARTIAL/CONFIG_ONLY e/ou findings de criticidade (ex.: `CIRCUIT_DOWN`, `L2VC_DOWN`, `VSI_DOWN`, `VLAN_ORPHAN`, `DESCRIPTION_MISSING`, …).

**Saudáveis:** `operStatus=UP` e findings apenas `info` (ex.: `VLAN_USED_IN_L2VC`).

---

## Validação runtime

### L2-OPS.1B — flag OFF (sem rede)

Report: `PHASE_L2_OPS_1B_REFRESH_FLAG_OFF_RUNTIME_SMOKE_REPORT.md`

- `POST /refresh` → **503** `L2_OPERATIONAL_REFRESH_DISABLED`
- `GET /l2-circuits` → **200**
- Zero SNMP walk / SSH / discovery na janela

### L2-OPS.1C — device 1 real

Report: `PHASE_L2_OPS_1C_REFRESH_REAL_DEVICE1_RESULT.md`

| Métrica | Antes | Depois |
|---------|-------|--------|
| Device | `4WNET-BVA-BRT-RX` (id=1) | — |
| Circuitos | 131 | 131 |
| Problems (NOC) | **60** | **43** |
| Freshness | unknown | **fresh** |
| `last_refresh_at` | null | **2026-05-28T04:37:36Z** |
| SNMP interfaces | — | **138** (100 matches) |
| SSH ops | — | **OK** |
| SSH config | — | **false** |
| Duração refresh | — | ~7.6 s |

**Rollback:** flags OFF → `POST /refresh` → **503** ✅

---

## Comandos

### Permitidos (refresh)

**SNMP:** IF-MIB walk (`ifOperStatus`, admin) via stack SNMP_FAST existente.

**SSH ops** (allowlist + `validateReadonlyCommand`):

- `display mpls l2vc verbose`
- `display mpls l2vc`
- `display vsi verbose`
- `display interface brief`

**SSH config** (somente se `L2_OPERATIONAL_REFRESH_SSH_CONFIG=true`):

- `display current-configuration interface`
- `display interface description`

### Proibidos / fora de escopo

- Qualquer write config (`undo`, `commit`, `save`, …)
- Remediation automática
- NetBox write
- Bulk multi-device num único request
- Scheduler automático em L2-OPS.1
- `POST /l2-circuits/discover` no fluxo refresh (jobs separados)
- Log de community/password/token

---

## Limitações conhecidas

1. **1 device por request** — pilot `SNMP_FAST_PILOT_DEVICE_IDS`; sem bulk.
2. **Inventário fixo** — refresh só UPDATE; não descobre circuitos novos.
3. **SNMP PW/VSI** — L2-OPS.1 usa IF-MIB + SSH para L2VC/VSI; MIB dedicado fica para fase futura.
4. **Match interface** — normalização de nome; aliases parciais podem não casar.
5. **Síncrono** — resposta 200 após pipeline completo (~segundos por device).
6. **Freshness histórica** — após rollback flag OFF, último `last_refresh_at` permanece no DB (read-only).
7. **DESCRIPTION_MISSING** — persiste até config mudar (SSH_CONFIG off não re-lê descrição em massa).

---

## Próximos passos (fora L2-OPS.1)

| ID | Tema |
|----|------|
| **L2-OPS.2** | Filtros por criticidade (DOWN / PARTIAL / CONFIG_ONLY / finding code) |
| **L2-OPS.3** | Bulk controlado por tenant / device group (gate + rate limit) |
| **L2-OPS.4** | Scheduler manual ou janela NOC (opt-in, default off) |
| **L2-OPS.5** | Richer SNMP — PW/VSI status via MIB quando Huawei OID estável |

---

## Critérios GO — fechamento L2-OPS.1

| Critério | Status |
|----------|--------|
| Endpoint refresh com gate | ✅ |
| SNMP_FAST + SSH ops read-only | ✅ |
| Findings recalculados / stale removidos | ✅ (60→43 problems device 1) |
| Freshness + `last_refresh_at` | ✅ |
| UI problem-first + checkbox | ✅ |
| Zero write config / NetBox | ✅ |
| Commit `f2fa7bc` | ✅ |
| Smoke 1B + 1C + rollback | ✅ |
| typecheck + build + selftests | ✅ (pré-commit) |

---

## Veredito final

**L2-OPS.1 — GO**

Feature pronta para piloto controlado: habilitar flags só em janela NOC, 1 device por vez, rollback documentado. Produção default permanece **refresh desabilitado**.

---

## Referências

| Documento | Caminho |
|-----------|---------|
| Estado atual (operacional) | `docs/l2-circuits/L2_OPERATIONAL_REFRESH_CURRENT_STATE.md` |
| Estado discovery / MVP | `docs/l2-circuits/L2_CURRENT_STATE.md` |
| Smoke 1B | `reports/l2-circuits/PHASE_L2_OPS_1B_REFRESH_FLAG_OFF_RUNTIME_SMOKE_REPORT.md` |
| Smoke 1C | `reports/l2-circuits/PHASE_L2_OPS_1C_REFRESH_REAL_DEVICE1_RESULT.md` |
| Código refresh | `workspace/artifacts/api-server/src/modules/l2circuits/operational-refresh/` |
