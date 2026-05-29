# FASE 1.3 — Dot1Q / VLAN_LOCAL Parser Fix Report

**Date:** 2026-05-23  
**Scope:** parser offline only — sem SSH, sem discover, sem device 2  
**Base:** FASE 1.2 evidência `manual/device-1/`  
**Device alvo:** `4WNET-BVA-BRT-RX` (`device_id=1`)

---

## Resumo

Parser Huawei L2 estendido para circuitos **dot1q / VLAN_LOCAL** a partir de:

- `display current-configuration interface` (fonte principal VLAN + description config)
- `display interface description` (status PHY/Protocol + description merge)

**Resultado offline:** **131 circuitos** `vlan_local` (bate 131× `vlan-type dot1q` na evidência).  
Regressão L2VC/VSI NE8000: **6 circuitos** (3 L2VC + 3 VSI) — intacta.

**Veredito:** critério FASE 1.3 **atingido** offline.  
**Re-smoke live device 1:** **NO-GO** até collector enviar `display current-configuration interface` ao parser (pendência).

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `parsers/dot1q-local.parser.ts` | **novo** — parse config interface + merge description |
| `parsers/huawei-vrp-l2.ts` | wire VLAN_LOCAL + dedupe |
| `l2circuits.types.ts` | tipo `vlan_local` |
| `normalizers/status.normalizer.ts` | `*down` / `^down` admin; oper CONFIG_ONLY sem description |
| `normalizers/findings.resolver.ts` | CIRCUIT_DOWN por oper DOWN; sem INCOMPLETE para vlan_local |
| `l2circuits.service.ts` | persiste `serviceId` no insert |
| `__fixtures__/manual-device-1/*.txt` | **3 fixtures** copiadas da evidência NOC |
| `tools/l2-dot1q-parser-selftest.mjs` | **novo** selftest offline |

---

## Fixtures usadas

Origem: `reports/l2-circuits/manual/device-1/`

Destino: `workspace/artifacts/api-server/src/modules/l2circuits/__fixtures__/manual-device-1/`

| Fixture | Uso |
|---------|-----|
| `display_current_config_interface.txt` | blocos `interface` + `vlan-type dot1q` + VE/ve-group |
| `display_interface_description.txt` | PHY/Protocol/Description merge |
| `display_current_config_l2_include.txt` | copiada (referência dot1q count); **não** parseada sozinha |

Regressão L2VC/VSI: `parsers/__fixtures__/display-mpls-l2vc-verbose.txt`, `display-vsi-verbose.txt`

---

## Quantidade extraída (offline)

| Métrica | Valor |
|---------|-------|
| Total circuitos | **131** |
| `circuit_type=vlan_local` | **131** |
| `operStatus=UP` | 75 |
| `operStatus=DOWN` | 44 |
| `operStatus=CONFIG_ONLY` | 12 (sem linha em interface description) |
| Findings total | 72 |
| `CIRCUIT_DOWN` | 44 |
| `DESCRIPTION_MISSING` | 28 |
| `INCOMPLETE_L2_CONFIG` | **0** (vlan_local válido sem L2VC/VSI) |

---

## Exemplos parseados (3)

### 1 — Eth-Trunk0.77 (UP + description merge)

| Campo | Valor |
|-------|-------|
| `circuit_type` | `vlan_local` |
| `service_id` | `Eth-Trunk0.77:vlan-77` |
| `local_interface` | `Eth-Trunk0.77` |
| `parent_interface` | `Eth-Trunk0` |
| `outer_vlan` | 77 |
| `description` | `EN-4WNET-BVA-CDS-RX_M4` |
| `admin_status` / `oper_status` | UP / UP |

### 2 — Virtual-Ethernet0/2/21.100 (VE + ve-group + VSI token)

| Campo | Valor |
|-------|-------|
| `circuit_type` | `vlan_local` |
| `service_id` | `Virtual-Ethernet0/2/21.100:vlan-100` |
| `outer_vlan` | 100 |
| `description` | `EN-NETFAST-BVA-BRT-VSI [ve-group 2 l3-access]` |
| `vsi_name` | `EN-NETFAST-BVA-BRT-VSI` |
| `oper_status` | CONFIG_ONLY (VE subif ausente em interface description) |

### 3 — Eth-Trunk0.894 (oper DOWN → finding)

| Campo | Valor |
|-------|-------|
| `circuit_type` | `vlan_local` |
| `outer_vlan` | 894 |
| `description` | `ALLFIBER-CROSSCONNECT-4WNET` |
| `admin_status` / `oper_status` | UP / DOWN |
| `findings` | `CIRCUIT_DOWN` |

---

## Status / findings behavior

| Regra | Comportamento |
|-------|---------------|
| Só config, sem linha description | `oper_status=CONFIG_ONLY` |
| PHY/Protocol em description | normaliza UP/DOWN (`*down` → admin DOWN) |
| Oper DOWN | `CIRCUIT_DOWN` (severity error) |
| Sem description | `DESCRIPTION_MISSING` (info) |
| vlan_local sem peer/vc_id | **sem** `INCOMPLETE_L2_CONFIG` |
| Description merge | config preferida se texto ≥ interface description |

---

## Testes executados

```bash
cd workspace/artifacts/api-server && pnpm typecheck   # OK
cd workspace/artifacts/api-server && pnpm build     # OK
node tools/l2-dot1q-parser-selftest.mjs             # OK
```

Selftest valida:

- `manualCount=131` (~131 dot1q)
- todos `vlan_local`
- Eth-Trunk0.77 + VE100 + Eth-Trunk0.894
- L2VC/VSI regression = 6 circuitos
- zero `INCOMPLETE_L2_CONFIG` no batch manual

---

## Pendências

1. **Collector SSH** — adicionar `display current-configuration interface` (read-only) em `ssh.collector.ts`; hoje coleta só l2vc/vsi/brief/description → discover live ainda retorna 0.
2. **MAC address** — `display mac-address vlan <id>` fora escopo 1.3.
3. **S6730 dialect** — `display mpls l2vc` sem verbose (addendum FASE 1.2); fase futura.
4. **Filtro ruído** — 131 subifs incluem trunks internos; heurística “só com description” opcional depois.

---

## GO / NO-GO re-smoke device 1

| Gate | Status |
|------|--------|
| Parser offline >0 circuitos | **GO** |
| VLAN_LOCAL + merge + status | **GO** |
| Regressão L2VC/VSI | **GO** |
| typecheck / build | **GO** |
| Collector passa config interface | **NO-GO** (não feito nesta fase) |
| `L2_DISCOVER_SSH_ENABLED` | permanece **false** |

### Decisão

- **GO** re-smoke **após** FASE 1.3b (collector + 1 linha no job) — flag SSH com rollback.
- **NO-GO** re-smoke **agora** — parser pronto, pipeline live ainda incompleto.

---

## Referências

- `reports/l2-circuits/PHASE_1_2_L2_EVIDENCE_ANALYSIS.md`
- `reports/l2-circuits/manual/device-1/`
- `tools/l2-dot1q-parser-selftest.mjs`
