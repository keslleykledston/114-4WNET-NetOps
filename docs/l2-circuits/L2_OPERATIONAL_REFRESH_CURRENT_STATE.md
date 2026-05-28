# L2 Operational Refresh — Estado Atual

**Versão doc:** 2026-05-28
**Fase:** L2-OPS.1 **GO**
**Commit:** `f2fa7bc`
**Relacionado:** discovery em `L2_CURRENT_STATE.md`

---

## 1. Resumo executivo

Refresh operacional L2 atualiza circuitos **já persistidos** com dados live read-only:

1. **SNMP_FAST** — IF-MIB (`ifOperStatus`, admin) para interfaces locais.
2. **SSH ops** — displays Huawei para L2VC/VSI/status de interface (sem dump de config por default).
3. **Findings** — recalculados em memória e gravados em `l2_circuits.findings`.
4. **Freshness** — `l2_device_operational` por device (`fresh` / `stale` / `expired` / `unknown`).

Frontend `/l2-circuits`: visão **problemas primeiro**, toggle saudáveis, refresh por device.

**Default produção:** `L2_OPERATIONAL_REFRESH_ENABLED=false`.

---

## 2. Quando usar o quê

| Necessidade | Endpoint / ação | Flag |
|-------------|-----------------|------|
| Inventariar circuitos (primeira vez) | `POST /api/l2-circuits/discover` | `L2_DISCOVER_SSH_ENABLED=true` |
| Atualizar status/findings sem re-discovery | `POST /api/l2-circuits/refresh` | `L2_OPERATIONAL_REFRESH_ENABLED=true` |
| Consulta NOC | `GET /api/l2-circuits` | — |

Refresh **não** substitui discovery: não cria linhas novas em `l2_circuits`.

---

## 3. Arquitetura

```
                    ┌─────────────────────┐
                    │  l2_circuits (DB)   │
                    │  inventário base    │
                    └──────────▲──────────┘
                               │ UPDATE oper/admin/pw/findings
┌──────────────┐    ┌──────────┴──────────┐    ┌────────────────────────┐
│  SNMP_FAST   │───▶│ runL2Operational    │◀───│  SSH ops (read-only)   │
│  IF-MIB      │    │ Refresh (1 device)  │    │  l2vc / vsi / if brief │
└──────────────┘    └──────────┬──────────┘    └────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ l2_device_operational│
                    │ freshness, ts       │
                    └─────────────────────┘
```

Módulo: `workspace/artifacts/api-server/src/modules/l2circuits/operational-refresh/`

| Arquivo | Função |
|---------|--------|
| `l2-operational-refresh.service.ts` | Pipeline orchestration |
| `l2-operational-refresh.gate.ts` | Feature flags |
| `l2-operational-refresh.freshness.ts` | fresh/stale/expired |
| `l2-operational-ssh-ops.collector.ts` | SSH allowlist ops |
| `l2-operational-merge.ts` | SNMP/SSH → normalized circuit |
| `l2-operational-refresh.errors.ts` | 503 codes |

---

## 4. Flags de ambiente

| Variável | Default | Efeito |
|----------|---------|--------|
| `L2_OPERATIONAL_REFRESH_ENABLED` | `false` | Master gate refresh |
| `L2_OPERATIONAL_REFRESH_SSH_CONFIG` | `false` | Adiciona comandos de config RO |
| `NETOPS_SNMP_REAL_ENABLED` | `false` | SNMP real no refresh |
| `SNMP_FAST_PILOT_DEVICE_IDS` | `1` | CSV de device IDs permitidos |
| `L2_OPERATIONAL_FRESH_MINUTES` | `15` | Janela `fresh` |
| `L2_OPERATIONAL_STALE_HOURS` | `24` | Janela até `expired` |

Independentes (manter OFF em smoke refresh):

- `L2_DISCOVER_SSH_ENABLED` — discovery full
- `SNMP_POLL_ENABLED` — poller legado
- `BGP_DRILLDOWN_SSH_DETAIL_ENABLED`

---

## 5. API

### Refresh

```http
POST /api/l2-circuits/refresh
Authorization: Bearer … | Cookie session
Content-Type: application/json

{ "device_id": 1 }
```

| Resposta | Significado |
|----------|-------------|
| **200** | Refresh concluído (sync) |
| **503** | `L2_OPERATIONAL_REFRESH_DISABLED` ou `L2_OPERATIONAL_SNMP_DISABLED` |
| **403** | Device fora do pilot |
| **404** | Device ou zero circuitos |
| **422** | SNMP/SSH credential ausente |

### Lista com metadata operacional

```http
GET /api/l2-circuits?device_id=1
```

Campo `operational` (quando `device_id` presente):

```json
{
  "device_id": 1,
  "last_refresh_at": "2026-05-28T04:37:36.560Z",
  "freshness": "fresh",
  "operational_state": { "ssh_ops": true, "ssh_config": false, … }
}
```

Sem refresh prévio: `freshness: "unknown"`, `last_refresh_at: null`.

---

## 6. UI `/l2-circuits`

| Elemento | Comportamento |
|----------|---------------|
| Lista default | Só **problemas** (`showHealthy=false` no storage local) |
| Checkbox | **Mostrar circuitos saudáveis** |
| Filtro device | Obrigatório para refresh operacional |
| Botão | **Atualizar operacional** → POST refresh → refetch GET |
| Badge | Fresh / Stale / Expired / Unknown |
| Texto | **Última atualização operacional** (com device selecionado) |

Códigos de finding operacionais relevantes (exemplos):

- `CIRCUIT_DOWN`, `L2VC_DOWN`, `VSI_DOWN`
- `REMOTE_NOT_FORWARDING`, `VLAN_ORPHAN`, `DESCRIPTION_MISSING`

Info-only (ex.: `VLAN_USED_IN_L2VC`) não classificam circuito como “problema” na UI default.

Arquivos UI:

- `workspace/artifacts/netops-manager/src/pages/l2-circuits.tsx`
- `workspace/artifacts/netops-manager/src/features/l2-circuits/*`

---

## 7. Persistência

### `l2_device_operational`

Migration: `workspace/lib/db/migrations/0019_l2_operational_refresh.sql`

| Coluna | Uso |
|--------|-----|
| `device_id` | PK |
| `last_refresh_at` | Timestamp último refresh OK |
| `freshness` | `fresh` \| `stale` \| `expired` \| `unknown` |
| `operational_state` | JSON métricas (snmp_interfaces, ssh_ops, …) |
| `last_error` | Última falha (se implementado em runs futuros) |

### `l2_circuits` (atualizado no refresh)

- `admin_status`, `oper_status`, `pw_status`
- `findings` (JSON array recalculado)
- `last_seen`, `updated_at`
- `source` → `ssh_live` se SSH ops OK, senão `cached_config`

---

## 8. Comandos SSH

### Sempre no refresh (ops)

| Comando | Propósito |
|---------|-----------|
| `display mpls l2vc verbose` | PW/L2VC NE8000-style |
| `display mpls l2vc` | L2VC S6730-style |
| `display vsi verbose` | VSI/VPLS |
| `display interface brief` | Status interface |

### Somente com `L2_OPERATIONAL_REFRESH_SSH_CONFIG=true`

| Comando | Propósito |
|---------|-----------|
| `display current-configuration interface` | Config truth / dot1q |
| `display interface description` | Descrições |

### Nunca

- Write / commit / save
- NetBox sync
- Comandos fora allowlist Huawei VRP

---

## 9. Resultado piloto (device 1)

Validado em **L2-OPS.1C** (`4WNET-BVA-BRT-RX`):

| Métrica | Valor |
|---------|--------|
| Circuitos | 131 |
| Problems antes → depois | 60 → **43** |
| SNMP interfaces | 138 |
| Interface matches | 100 |
| SSH ops | OK |
| SSH config | false |
| Tempo refresh | ~7.6 s |

Rollback pós-teste: flags OFF, `POST /refresh` → 503.

---

## 10. Operação segura (checklist curto)

1. Confirmar `L2_OPERATIONAL_REFRESH_ENABLED=false` em produção.
2. Para janela NOC: habilitar flags + `SNMP_FAST_PILOT_DEVICE_IDS` explícito.
3. Selecionar **1 device** na UI.
4. `POST /refresh` ou botão **Atualizar operacional**.
5. Verificar `operational.freshness=fresh` no GET.
6. Rollback: flags OFF + restart API.
7. Confirmar `POST /refresh` → 503.

Smoke scripts:

- `tools/l2-ops-1b-refresh-flag-off-smoke.mjs`
- `tools/l2-ops-1c-refresh-real-device1.mjs` (só em janela autorizada)

---

## 11. Limitações

- Um device por chamada; pilot allowlist.
- Sem inventário novo no refresh.
- PW/VSI via SSH ops, não MIB dedicado (L2-OPS.1).
- Refresh síncrono — timeout HTTP em devices lentos.
- `DESCRIPTION_MISSING` pode persistir sem SSH_CONFIG.
- Freshness no DB não apaga ao desligar flag.

---

## 12. Roadmap

| Fase | Entrega |
|------|---------|
| **L2-OPS.2** | Filtros API/UI por criticidade e finding code |
| **L2-OPS.3** | Bulk controlado (tenant / device group + gates) |
| **L2-OPS.4** | Scheduler manual / janela NOC (default off) |
| **L2-OPS.5** | SNMP richer — PW/VSI quando MIB estável |

---

## 13. GO / NO-GO

| Área | Status |
|------|--------|
| Implementação | **GO** (`f2fa7bc`) |
| Gate OFF default | **GO** |
| Piloto device 1 | **GO** |
| UI NOC | **GO** |
| Produção wide enable | **NO-GO** até L2-OPS.2+ e runbook NOC |

---

## 14. Referências

| Tipo | Path |
|------|------|
| Closure report | `reports/l2-circuits/L2_OPERATIONAL_REFRESH_CLOSURE_REPORT.md` |
| Smoke 1B | `reports/l2-circuits/PHASE_L2_OPS_1B_REFRESH_FLAG_OFF_RUNTIME_SMOKE_REPORT.md` |
| Smoke 1C | `reports/l2-circuits/PHASE_L2_OPS_1C_REFRESH_REAL_DEVICE1_RESULT.md` |
| Discovery state | `docs/l2-circuits/L2_CURRENT_STATE.md` |
| Runbook discovery | `docs/l2-circuits/RUNBOOK_L2_DISCOVERY.md` |
