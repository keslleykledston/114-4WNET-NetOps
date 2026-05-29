# FASE 1.4 — Re-smoke Device 1 Result

**Date:** 2026-05-23  
**Device:** `device_id=1` — `4WNET-BVA-BRT-RX` (`45.169.161.255`)  
**Branch:** `feature/v0.3.4-operational-pilot-noc`  
**Refs:** FASE 1.3b collector, FASE 1.3 parser dot1q

---

## Resumo executivo

Re-smoke **GO**. Pipeline live completo validado:

```
Huawei RX → SSH read-only (5 cmds) → parser dot1q → vlan_local → DB → API
```

| Métrica | Offline (FASE 1.3) | Live (FASE 1.4) |
|---------|-------------------|-----------------|
| Circuitos | **131** | **131** |
| `vlan_local` | 131 | 131 |
| L2VC/VSI | 0 (device RX) | 0 |

Job **completed** em ~**5,4s**. Findings **72**. Rollback flag SSH **executado** (`false` no container).

---

## Pré-check

| # | Check | Resultado |
|---|-------|-----------|
| 1 | Branch | `feature/v0.3.4-operational-pilot-noc` |
| 2 | Relatório 1.3b | presente |
| 3 | Flag antes | `.env` → `false`; container → `false` |
| 4 | Flag enable | `.env` → `true` + rebuild api |
| 5 | Rebuild api | `docker compose up -d --build api` OK |
| 6 | Health API | `GET :8085/api/healthz` → 200 `ok` |
| 7 | Auth | login 200, token+cookie |
| 8 | Tabelas L2 | `l2_circuits`, `l2_discovery_jobs` existem |
| 9 | Device 1 | IP OK, password_encrypted OK, huawei/vrp |
| 10 | test-connection | `success: true` |
| 11 | Allowlist 5 cmds | `l2-collector-selftest.mjs` OK |

**Nota API:** host `8085` → container `8080` (`API_PORT=8085`).

---

## Execução

| Campo | Valor |
|-------|-------|
| **run_id** | `disc-l2-1-1779575076582` |
| Script | `tools/phase-1-4-smoke-run.mjs` |
| Discover | `POST /api/l2-circuits/discover` → **202** |
| Poll | attempt 2 → **completed** |
| Job started | `2026-05-23T22:24:36.582Z` |
| Job finished | `2026-05-23T22:24:41.991Z` |
| **Duração job** | **~5,4s** |
| Duração smoke total | **~11s** |

---

## Comandos executados (allowlist)

Collector `L2_SSH_COMMANDS` — somente read-only:

1. `display mpls l2vc verbose`
2. `display vsi verbose`
3. `display interface brief`
4. `display interface description`
5. `display current-configuration interface`

**Nenhum** comando fora allowlist. **Nenhum** write/destructivo.

---

## Resultado job / API

| Campo | Valor |
|-------|-------|
| Job status | **completed** |
| `circuit_count` | **131** |
| `findings_count` | **72** |
| `error_message` | null |
| `GET /api/l2-circuits?device_id=1` | total **131** |
| `circuit_type` | 100% `vlan_local` |

### Findings (live)

| Code | Qtd aprox. |
|------|------------|
| `CIRCUIT_DOWN` | 44 |
| `DESCRIPTION_MISSING` | 28 |
| `INCOMPLETE_L2_CONFIG` | 0 |

---

## Exemplos — 3 circuitos

### 1 — Eth-Trunk0.77 (UP)

| Campo | Valor |
|-------|-------|
| `circuit_type` | `vlan_local` |
| `service_id` | `Eth-Trunk0.77:vlan-77` |
| `local_interface` | `Eth-Trunk0.77` |
| `outer_vlan` | 77 |
| `description` | `EN-4WNET-BVA-CDS-RX_M4` |
| `admin_status` / `oper_status` | UP / UP |
| `findings` | [] |

### 2 — Virtual-Ethernet0/2/21.100 (VE + ve-group)

| Campo | Valor |
|-------|-------|
| `circuit_type` | `vlan_local` |
| `service_id` | `Virtual-Ethernet0/2/21.100:vlan-100` |
| `outer_vlan` | 100 |
| `description` | `EN-NETFAST-BVA-BRT-VSI [ve-group 2 l3-access]` |
| `admin_status` / `oper_status` | UNKNOWN / CONFIG_ONLY |
| `findings` | [] |

### 3 — Eth-Trunk0.894 (oper DOWN)

| Campo | Valor |
|-------|-------|
| `circuit_type` | `vlan_local` |
| `outer_vlan` | 894 |
| `description` | `ALLFIBER-CROSSCONNECT-4WNET` |
| `admin_status` / `oper_status` | UP / DOWN |
| `findings` | `CIRCUIT_DOWN` (error) |

---

## Offline 131 vs live

| | Offline fixture | Live SSH |
|--|-----------------|----------|
| Total | 131 | **131** |
| Delta | — | **0** |
| Match | **100%** count |

Parser + collector alinhados com evidência manual device 1.

---

## Evidência de segurança

| Check | Resultado |
|-------|-----------|
| Logs API (5 min pós-smoke) | **sem** password/token/community/cipher/simple |
| `raw_evidence` em DB | trechos interface config; IPs operacionais OK |
| Senha device | não apareceu em logs nem API response |
| Comandos | só allowlist `display`/`show` |

Redact pipeline FASE 1.2 mantido.

---

## Rollback

| Step | Ação | Status |
|------|------|--------|
| 1 | `.env` → `L2_DISCOVER_SSH_ENABLED=false` | OK |
| 2 | `L2_DISCOVER_SSH_ENABLED=false docker compose up -d --force-recreate api` | OK |
| 3 | Container flag | **`false`** confirmado |
| 4 | Health | `{"status":"ok"}` |

**Nota:** após smoke, shell com `.env` sourced tinha `L2_DISCOVER_SSH_ENABLED=true` exportado → override docker compose. Rollback exigiu **env explícito** na linha de comando.

---

## Problemas encontrados

1. **CORS 500** em `:8080` direto — usar `:8085` (mapeamento correto).
2. **Rollback env override** — documentado acima; operador deve usar env explícito ou novo shell.
3. **Timeout** — não ocorreu; config interface ~5s neste device (abaixo limite 300s/cmd).

Nenhum blocker.

---

## GO / NO-GO

### Encerrar device 1 (dot1q/VLAN_LOCAL)

## **GO**

- Pipeline live validado end-to-end
- 131/131 circuitos
- Segurança OK
- Rollback OK

Device 1 **encerrado** para escopo dot1q local.

### FASE 1.5 — S6730 L2VC parser

## **GO** (escopo separado)

Pré-requisitos 1.5:

- Device S6730 no inventário (ou hostname conhecido)
- Parser dialect `display mpls l2vc` (sem verbose)
- VSI `Peer Router ID`
- **Não** misturar com re-smoke device 1 — L2VC mora no switch downstream

Device 1 RX **não** tem L2VC clássico — esperado 0 L2VC no RX pós-1.5 também.

---

## Artefatos

- `tools/phase-1-4-smoke-run.mjs`
- Job DB: `disc-l2-1-1779575076582`
- Output bruto: `/tmp/phase-1-4-smoke-output.json` (host smoke runner)

---

## Referências

- `reports/l2-circuits/PHASE_1_3B_COLLECTOR_DOT1Q_REPORT.md`
- `reports/l2-circuits/PHASE_1_3_DOT1Q_PARSER_FIX_REPORT.md`
- `collectors/ssh.collector.ts`
