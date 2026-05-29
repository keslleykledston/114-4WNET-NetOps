# Phase 2 Classification Dry-Run Report

## Resumo executivo

- Resultado: GO
- Modo: db-read-plus-fixture-reclass
- Registros DB lidos read-only: 261
- Registros fixture analisados: 146
- Registros alterados no dry-run: 144
- VPWS corrigidos: 135
- VPWS inválidos após classificação: 0
- Dot1Q puro como VPWS após classificação: 0

## Fontes analisadas

- l2_circuits (db-readonly): 261 rows
- manual-device-1 (fixture)
- manual-s6730-brt-a (fixture)
- parser-ne8000-l2vc-vsi (fixture)
- synthetic-edge-cases (inline-fixture)

## Contagem antes

### circuit_type

| item | count |
|---|---|
| vpws | 137 |
| vsi | 4 |
| l2vc | 2 |
| vlan_orphan | 2 |
| l3_interface | 1 |

### classification

| item | count |
|---|---|
| legacy_dot1q_false_vpws | 135 |
| vsi | 4 |
| vpws | 2 |
| l2vc | 2 |
| vlanif_orphan | 1 |
| l3_interface | 1 |
| vlan_not_in_switch_batch | 1 |

## Contagem depois

### circuit_type

| item | count |
|---|---|
| l3_vrf_link | 95 |
| vlan_orphan | 31 |
| vlan_local | 11 |
| vsi | 4 |
| vpws | 2 |
| l2vc | 2 |
| l3_interface | 1 |

### classification

| item | count |
|---|---|
| l3_vrf_link | 95 |
| vlan_orphan | 29 |
| vlan_local | 11 |
| vsi | 4 |
| vpws | 2 |
| l2vc | 2 |
| vlanif_orphan | 1 |
| l3_interface | 1 |
| vlan_not_in_switch_batch | 1 |

## Findings gerados

| item | count |
|---|---|
| CIRCUIT_DOWN | 48 |
| ROUTER_L2_VLAN_ANOMALY | 41 |
| VLAN_ORPHAN | 29 |
| VLAN_NOT_IN_SWITCH_BATCH | 1 |
| VLANIF_ORPHAN | 1 |
| REMOTE_NOT_FORWARDING | 1 |

## Métricas pedidas

- vlan_orphan: 29
- vlanif_orphan: 1
- vlan_local: 11
- l3_interface: 1
- l3_vrf_link: 95
- vsi/vpls: 4
- VPWS corrigidos: 135

## Exemplos reclassificados

1. EN-4WNET-BVA-CDS-RX_M4 Eth-Trunk0.77 vlan 77: vpws/legacy_dot1q_false_vpws -> l3_vrf_link/l3_vrf_link
2. Eth-Trunk0.84 Eth-Trunk0.84 vlan 84: vpws/legacy_dot1q_false_vpws -> l3_vrf_link/l3_vrf_link
3. VRF-CDN Eth-Trunk0.85 vlan 85: vpws/legacy_dot1q_false_vpws -> l3_vrf_link/l3_vrf_link
4. PTP-4WNET_RX-BKP Eth-Trunk0.155 vlan 155: vpws/legacy_dot1q_false_vpws -> l3_vrf_link/l3_vrf_link
5. PROV-PRONET Eth-Trunk0.414 vlan 414: vpws/legacy_dot1q_false_vpws -> l3_vrf_link/l3_vrf_link
6. BGP-BVA-MNS Eth-Trunk0.652 vlan 652: vpws/legacy_dot1q_false_vpws -> l3_vrf_link/l3_vrf_link
7. CL-VTELL-BVA-((724)MJE TELC) Eth-Trunk0.810 vlan 810: vpws/legacy_dot1q_false_vpws -> l3_vrf_link/l3_vrf_link
8. CL-TIXUS-ULTRANET-BVA-((45) I. S. MARQUES) Eth-Trunk0.811 vlan 811: vpws/legacy_dot1q_false_vpws -> l3_vrf_link/l3_vrf_link
9. CL-MACARAO-BVA-(725) E G DOS SANTOS Eth-Trunk0.812 vlan 812: vpws/legacy_dot1q_false_vpws -> l3_vrf_link/l3_vrf_link
10. AS263934-INFORR-BACKUP Eth-Trunk0.813 vlan 813: vpws/legacy_dot1q_false_vpws -> l3_vrf_link/l3_vrf_link

## Warnings

- Nenhum

## Riscos

- Dry-run não grava banco e não muda classificação persistida.
- Quando DB não tem raw snapshot completo, reclassificação real deve usar snapshot/fixture completo, não somente linha antiga.
- Fixture S6730 local contém header com 82 L2VC, mas só um bloco L2VC colado.

## GO/NO-GO

GO: revisar relatório antes de qualquer migração/reclassificação em banco.

## Confirmação read-only

- Nenhum SSH.
- Nenhum device write.
- Nenhum NetBox write.
- Nenhum SNMP.
- Nenhum sync/apply plan.
- Nenhum update/delete/insert em banco.
