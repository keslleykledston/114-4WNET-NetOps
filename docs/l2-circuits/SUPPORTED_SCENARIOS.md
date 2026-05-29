# Matriz de Suporte — L2 Circuit Discovery MVP

**Versão:** 1.7 (2026-05-23)  
**Legenda:** ✅ validado live | 🔶 parser offline only | ❌ não suportado

---

## Huawei RX / NE8000 / VRP — dot1q edge

**Device piloto:** `device_id=1` — `4WNET-BVA-BRT-RX`  
**Smoke:** FASE 1.4 — **GO** (131 circuitos)

| Cenário | circuit_type | Comandos | Parser | Status |
|---------|--------------|----------|--------|--------|
| Subinterface dot1q | `vlan_local` | `display current-configuration interface` | dot1q-local.parser | ✅ |
| VLAN outer | `vlan_local` | idem | `vlan-type dot1q N` | ✅ |
| Interface description merge | `vlan_local` | `display interface description` | PHY/Protocol → status | ✅ |
| Virtual-Ethernet subif | `vlan_local` | config interface | VE blocks | ✅ |
| ve-group awareness | `vlan_local` | config interface | suffix `[ve-group N mode]` | ✅ |
| VSI token em description | `vlan_local` | config | `-VSI` → vsiName hint | ✅ |
| MPLS L2VC clássico | — | `display mpls l2vc verbose` | vazio/erro no RX | ❌ neste device |
| VSI clássico | — | `display vsi verbose` | vazio no RX | ❌ neste device |

**Findings comuns device 1:** CIRCUIT_DOWN (44), DESCRIPTION_MISSING (28).

---

## Huawei S6730 / switch — L2VC / VSI

**Device piloto:** `device_id=2` — NetOps `4WNET-BVA-BRT-RA` = CLI `4WNET-BVA-BRT-A_S6730-H48X6C`  
**Smoke:** FASE 1.6 — **GO** (130 circuitos)

| Cenário | circuit_type | Comandos | Parser | Status |
|---------|--------------|----------|--------|--------|
| L2VC non-verbose | `l2vc` / `vpws` | `display mpls l2vc` | s6730-l2.parser | ✅ |
| L2VC verbose (fallback) | `l2vc` | `display mpls l2vc verbose` | huawei-vrp-l2 NE8000 | 🔶 se output NE format |
| VC ID + destination | `vpws` (VLAN type) | l2vc | vc_id, peer_ip | ✅ |
| client interface | `vpws` | l2vc | VlanifN | ✅ |
| VC state down | — | l2vc | oper DOWN | ✅ |
| remote not forwarding | — | l2vc | REMOTE_NOT_FORWARDING | ✅ |
| session/AC up, VC down | — | l2vc | VC 15 pattern | ✅ |
| VSI S6730 layout | `vsi` | `display vsi verbose` | `***VSI Name`, Peer Router ID | ✅ |
| VPLS-style | `vpls` | vsi verbose | encapsulation vlan | 🔶 |
| SERVICOS_CDS | `vsi` | vsi verbose | vsi_id 601 | ✅ |
| dot1q massivo | `vlan_local` | config interface | se config existir | 🔶 não validado live S6730 |

**Counts live validados:** 82 L2VC/VPWS (63 UP / 19 DOWN), 48 VSI.

---

## Huawei NE8000 — L2VC verbose (fixtures)

**Validação:** offline selftests — **GO** (6 circuitos fixture)

| Cenário | circuit_type | Comando | Status |
|---------|--------------|---------|--------|
| Dot-block L2VC | `l2vc` | `display mpls l2vc verbose` | 🔶 fixture |
| Dot-block VSI | `vsi` | `display vsi verbose` | 🔶 fixture |
| Peer IP format | `l2vc` | verbose | 🔶 fixture |

Live NE8000 com L2VC: **não smokeado** neste MVP (device 1 usa dot1q).

---

## Findings — matriz

| Finding | RX dot1q | S6730 L2VC | NE8000 fixture |
|---------|----------|------------|----------------|
| CIRCUIT_DOWN | ✅ | ✅ | 🔶 |
| REMOTE_NOT_FORWARDING | — | ✅ | — |
| INCOMPLETE_L2_CONFIG | — (vlan_local skip) | — | 🔶 |
| DUPLICATED_VC_ID | — | 🔶 | 🔶 |
| VLAN_CONFLICT | 🔶 QinQ futuro | — | — |
| DESCRIPTION_MISSING | ✅ vlan_local | skip l2vc/vsi | — |

---

## Fora de escopo MVP

| Item | Status |
|------|--------|
| `display mac-address vlan <id>` dinâmico | ❌ |
| `display mac-address vsi <name>` dinâmico | ❌ |
| SNMP discovery | ❌ |
| NetBox write/sync | ❌ |
| Bulk multi-device discover | ❌ |
| Cisco / Juniper / Nokia | ❌ |
| QinQ (second-dot1q) | ❌ não visto device 1 |
| Coleta parametrizada MAC | ❌ |

---

## Comandos collector (todos os cenários)

```
display mpls l2vc verbose
display mpls l2vc
display vsi verbose
display interface brief
display interface description
display current-configuration interface
```

Allowlist: `commands.ts` + `l2-collector-selftest.mjs`.

---

## Selftests offline

```bash
node tools/l2-dot1q-parser-selftest.mjs      # 131 + 6 NE
node tools/l2-s6730-parser-selftest.mjs        # S6730 + regressão
node tools/l2-collector-selftest.mjs           # 6 cmds allowlist
```

---

## Referências

- `MVP_L2_DISCOVERY_CLOSURE_REPORT.md`
- `PHASE_1_4_DEVICE1_RESMOKE_RESULT.md`
- `PHASE_1_6_S6730_SMOKE_RESULT.md`
