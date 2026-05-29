# L2-OPS.1C — Refresh Operacional Real Device 1 — Result

**Date:** 2026-05-28
**Status:** **GO**
**Device:** `device_id=1` (`4WNET-BVA-BRT-RX`)
**Prerequisite:** L2-OPS.1B GO

---

## Objetivo

Um refresh operacional controlado em **1 device** — SNMP_FAST + SSH ops read-only, sem `SSH_CONFIG`, sem write, sem NetBox.

---

## Flags temporárias (janela teste)

Override: `.l2-ops-1c-compose.override.yml`

| Flag | Valor |
|------|--------|
| `L2_OPERATIONAL_REFRESH_ENABLED` | **true** |
| `NETOPS_SNMP_REAL_ENABLED` | **true** |
| `SNMP_FAST_PILOT_DEVICE_IDS` | **1** |
| `L2_OPERATIONAL_REFRESH_SSH_CONFIG` | **false** |
| `SNMP_POLL_ENABLED` | **false** |
| `BGP_DRILLDOWN_SSH_DETAIL_ENABLED` | **false** |
| `L2_DISCOVER_SSH_ENABLED` | **false** |

```bash
docker compose -f docker-compose.yml -f .l2-ops-1c-compose.override.yml up -d --build api
```

---

## Pré-check

| Check | Resultado |
|-------|-----------|
| `GET /api/healthz` | **200** |
| `GET /api/devices/1` | **200** — hostname `4WNET-BVA-BRT-RX`, IP presente |
| SNMP credential | resolvida (device sem `snmpCommunity` no JSON API → fallback env/lab; **valor não logado**) |
| SSH credential | ativa (campo `passwordEncrypted` omitido na API; refresh com `ssh_ops: true`) |
| `GET /api/l2-circuits?device_id=1` | **200** |

### Contagem antes

| Métrica | Valor |
|---------|--------|
| `total` | **131** |
| `problems` (NOC filter) | **60** |
| `operational.freshness` | **unknown** |
| `operational.last_refresh_at` | **null** |

---

## Execução

```http
POST /api/l2-circuits/refresh
Content-Type: application/json

{ "device_id": 1 }
```

### Resposta (implementação síncrona → **200**, não 202)

| Campo | Valor |
|-------|--------|
| HTTP | **200** |
| `elapsed_ms` | **7567** |
| `freshness` | **fresh** |
| `last_refresh_at` | `2026-05-28T04:37:36.560Z` |
| `circuits_updated` | **131** |
| `findings_count` | **62** |
| `warnings` | `[]` |

### `operational_state` (persistido)

| Campo | Valor |
|-------|--------|
| `circuits_total` | 131 |
| `circuits_updated` | 131 |
| `snmp_interfaces` | **138** |
| `snmp_interface_matches` | **100** |
| `ssh_ops` | **true** |
| `ssh_config` | **false** |
| `findings_count` | 62 |

**Comandos SSH ops (read-only):** `display mpls l2vc verbose`, `display mpls l2vc`, `display vsi verbose`, `display interface brief` — **sem** `display current-configuration interface` (`SSH_CONFIG=false`).

**SNMP:** IF-MIB / `ifOperStatus` — 138 interfaces coletadas, 100 match em circuitos com `localInterface`.

---

## Pós — `GET /api/l2-circuits?device_id=1`

| Métrica | Antes | Depois |
|---------|-------|--------|
| `total` | 131 | 131 |
| `problems` (NOC) | 60 | **43** |
| `operational.freshness` | unknown | **fresh** |
| `operational.last_refresh_at` | null | **2026-05-28T04:37:36.560Z** |

**Findings recalculados:** queda de **17** circuitos na visão “problemas” após refresh (status operacional atualizado; findings stale removidos). Ex.: contagem `CIRCUIT_DOWN` alinhada a `oper_status=DOWN` (**34** circuitos).

### Oper status pós-refresh (DB)

| oper_status | count |
|-------------|------:|
| UP | 92 |
| DOWN | 34 |
| CONFIG_ONLY | 5 |

### UI (comportamento esperado L2-OPS.1)

| Check | Evidência |
|-------|-----------|
| Default só problemas | API `problems=43` vs `total=131` → ~88 saudáveis ocultos com `showHealthy=false` |
| Checkbox “Mostrar circuitos saudáveis” | bundle/UI L2-OPS.1 (FASE 2.3 + 1B) |
| Freshness badge | `operational.freshness=fresh` + timestamp na lista com `device_id` |

---

## Logs

| Regra | Resultado |
|-------|-----------|
| SNMP walk executado | ✅ ~7.5s refresh, 138 interfaces |
| SSH ops | ✅ `ssh_ops: true` |
| SSH config full | ❌ não (`ssh_config: false`) |
| Discovery | ❌ não chamado |
| Segredo em log | ❌ nenhum match `password`/`community`/`secret`/`current-configuration` |
| NetBox write | ❌ nenhum |
| Config write | ❌ nenhum |

Trecho request log:

```
POST /api/l2-circuits/refresh → 200 (7566ms)
```

---

## Rollback (obrigatório)

```bash
docker compose -f docker-compose.yml -f .l2-ops-1b-compose.override.yml up -d --no-deps api
```

| Flag pós-rollback | Valor |
|-----------------|--------|
| `L2_OPERATIONAL_REFRESH_ENABLED` | **false** |
| `NETOPS_SNMP_REAL_ENABLED` | **false** |

Verificação:

```http
POST /api/l2-circuits/refresh { "device_id": 1 }
→ 503
code: L2_OPERATIONAL_REFRESH_DISABLED
```

✅ Rollback OK.

**Nota:** `l2_device_operational` mantém último refresh (`fresh`) — dado histórico read-only; gate impede novo refresh até reabilitar flag.

---

## Critérios GO

| Critério | Status |
|----------|--------|
| 1 device apenas | ✅ `device_id=1`, pilot allowlist |
| Refresh executado | ✅ 200, 131 circuitos |
| Freshness atualizada | ✅ `fresh` + timestamp |
| Findings recalculados | ✅ 60→43 problems; DB findings atualizados |
| UI default só problemas | ✅ (modelo API + UI L2-OPS.1) |
| Rollback OK | ✅ 503 pós-rollback |
| Zero write config | ✅ read-only SSH/SNMP |
| Zero NetBox write | ✅ |
| Logs sem segredo | ✅ |

---

## Veredito

**L2-OPS.1C GO** — refresh operacional real em **1 device** concluído: SNMP + SSH ops, sem config dump, findings/freshness atualizados, rollback restaura gate OFF.

---

## Artefatos

| Arquivo | Uso |
|---------|-----|
| `.l2-ops-1c-compose.override.yml` | flags ON janela |
| `.l2-ops-1b-compose.override.yml` | rollback |
| `tools/l2-ops-1c-refresh-real-device1.mjs` | runner smoke |

---

## Próximo (fora escopo)

- Produção: manter `L2_OPERATIONAL_REFRESH_ENABLED=false` até runbook NOC.
- Opcional: smoke UI Playwright com device selecionado + toast sucesso pós-refresh.
