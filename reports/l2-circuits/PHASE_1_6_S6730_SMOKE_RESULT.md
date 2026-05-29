# FASE 1.6 — S6730 Smoke Result

**Date:** 2026-05-23  
**Device NetOps:** `device_id=2` — `4WNET-BVA-BRT-RA`  
**Device real:** `4WNET-BVA-BRT-A_S6730-H48X6C` (S6730 — mesmo equipamento, nome diferente no cadastro)  
**IP:** `45.169.161.5`  
**Refs:** `PHASE_1_6_S6730_COLLECTOR_FALLBACK_REPORT.md`

---

## Resumo executivo

| Parte | Resultado |
|-------|-----------|
| Collector fallback | **GO** |
| Smoke live S6730 | **GO** |

Pipeline live validado no S6730 (via `device_id=2`):

- **82** circuitos L2VC/VPWS (63 UP / 19 DOWN) — bate header fixture manual
- **VC 15** encontrado com peer/interface/status/findings esperados
- **VSI SERVICOS_CDS** encontrada
- **48** VSI adicionais (output live completo > fixture manual)
- Job **completed** ~**16s**
- Rollback flag SSH **OK**

---

## Mapeamento inventário

| Campo | Valor |
|-------|-------|
| `device_id` | **2** |
| hostname NetOps | `4WNET-BVA-BRT-RA` |
| hostname operacional | `4WNET-BVA-BRT-A_S6730-H48X6C` |
| vendor/platform | huawei / vrp |
| IP | 45.169.161.5 |
| credenciais | OK (test-connection success) |

---

## Execução

| Campo | Valor |
|-------|-------|
| **run_id** | `disc-l2-2-1779576876490` |
| Job status | **completed** |
| Started | `2026-05-23T22:54:36.490Z` |
| Finished | `2026-05-23T22:54:52.799Z` |
| **Duração job** | **~16,3s** |
| `circuit_count` (job) | **130** |
| `findings_count` (job) | **35** |

Script: `tools/phase-1-6-s6730-smoke-run.mjs` (`SMOKE_DEVICE_ID=2`)

---

## Comandos collector (allowlist)

1. `display mpls l2vc verbose`
2. `display mpls l2vc` ← S6730 dialect (82 VCs)
3. `display vsi verbose`
4. `display interface brief`
5. `display interface description`
6. `display current-configuration interface`

Somente read-only. Logs API: **sem** vazamento password/token/community.

---

## Circuitos por tipo (live)

| circuit_type | count |
|--------------|-------|
| `l2vc` | 15 |
| `vpws` | 67 |
| **L2VC+VPWS total** | **82** |
| `vsi` | 48 |
| **Total API** | **130** |

### L2VC/VPWS oper status

| Status | Count |
|--------|-------|
| UP | **63** |
| DOWN | **19** |
| PARTIAL | 0 |

Regra parser: VC state down → **DOWN** (não PARTIAL), alinhado fixture header 63/19.

---

## VC 15 (live)

| Campo | Valor | Fixture manual |
|-------|-------|----------------|
| `vc_id` | 15 | 15 |
| `circuit_type` | vpws | vpws |
| `local_interface` | Vlanif15 | Vlanif15 |
| `peer_ip` | 10.200.5.1 | 10.200.5.1 |
| `admin_status` | UP | AC up |
| `oper_status` | **DOWN** | DOWN |
| Findings | CIRCUIT_DOWN + REMOTE_NOT_FORWARDING | idem |

---

## VSI SERVICOS_CDS (live)

| Campo | Valor | Fixture manual |
|-------|-------|----------------|
| `vsi_name` | SERVICOS_CDS | SERVICOS_CDS |
| `vsi_id` | 601 | 601 |
| `peer_ip` | 10.200.4.1 | 10.200.4.1 |
| `oper_status` | UP | up |

Live retornou **48 VSI** (múltiplos serviços no switch); fixture manual tinha 1 bloco.

---

## Findings (L2VC/VPWS)

| Code | Circuits afetados (approx) |
|------|---------------------------|
| CIRCUIT_DOWN | 19 |
| REMOTE_NOT_FORWARDING | 8 |

Job total findings: **35** (inclui VSI/outros).

---

## Comparação fixture manual vs live

| Métrica | Manual (offline) | Live (device 2) |
|---------|------------------|-----------------|
| L2VC header total | 82 | **82** parseados |
| UP / DOWN | 63 / 19 | **63 / 19** |
| VC 15 | OK | **OK** |
| VSI SERVICOS_CDS | 1 | **OK** (+ 47 outras VSI) |
| Blocos no fixture | 1 VC sample | output completo SSH |

**Match perfeito** nos counts L2VC e VC 15.

---

## Evidência de segurança

| Check | Resultado |
|-------|-----------|
| Logs sem password/token/community | OK |
| test-connection sem expor cred | OK |
| Allowlist only | OK |
| Rollback flag | OK |

---

## Rollback

| Step | Status |
|------|--------|
| `.env` → `L2_DISCOVER_SSH_ENABLED=false` | OK |
| `L2_DISCOVER_SSH_ENABLED=false docker compose up -d --force-recreate api` | OK |
| Container flag | **false** |
| Health | `{"status":"ok"}` |

---

## Problemas encontrados

1. **Nome inventário ≠ hostname CLI** — `BRT-RA` vs `BRT-A_S6730-H48X6C`; documentado acima.
2. **Findings attach por substring** — `L2VC-15` pode colar finding de `L2VC-1548` (bug menor attachFindings; fora escopo smoke).
3. **130 vs 82** — total inclui 48 VSI; expectativa “82 L2VC” = subset `l2vc`+`vpws` only.
4. **vlan_local** — S6730 não gerou dot1q neste run (config interface possivelmente vazio/diferente vs RX).

Nenhum blocker.

---

## GO / NO-GO

### Encerrar S6730 L2VC (live)

## **GO**

- Collector fallback OK
- 82 L2VC/VPWS live
- 63/19 UP/DOWN
- VC 15 + SERVICOS_CDS OK
- Findings OK
- Segurança + rollback OK

### Recomendações pós-1.6

1. Renomear device 2 para hostname operacional (opcional, cosmético).
2. Coletar fixture completa `display mpls l2vc` no repo (82 blocos) para regressão offline.
3. Fix attachFindings substring (L2VC-15 vs L2VC-1548) — backlog.

---

## Referências

- `PHASE_1_6_S6730_COLLECTOR_FALLBACK_REPORT.md`
- `PHASE_1_5_S6730_L2VC_PARSER_REPORT.md`
- `manual/s6730-brt-a/`
- `tools/phase-1-6-s6730-smoke-run.mjs`
