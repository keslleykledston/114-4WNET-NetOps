# Phase 2 Classification Fix Report

## Escopo

- Somente fixtures e dados locais.
- Nenhum SSH executado.
- `L2_DISCOVER_SSH_ENABLED` não alterado.
- Nenhum write em device.
- Nenhum write em NetBox.
- Nenhum SNMP novo.

## Causa raiz

Pipeline antigo tratava `vlan-type dot1q` como circuito L2 suficiente e acabava promovendo VLAN/subinterface local para `vpws` em cenários sem evidência de pseudowire. O parser também não separava L3, VLAN local real, VLAN órfã, VLANIF órfã e inconsistência de `vlan batch`.

## Regra nova

Prioridade de classificação:

1. `vpws/l2vc` somente com `vc_id + peer/destination + client/local interface`.
2. `vsi/vpls` somente com `vsi/vsi-id/peer` ou vínculo explícito.
3. `l3_vrf_link` / `l3_interface` quando há IP, IPv6 ou VRF.
4. `vlan_local` somente com uso L2 real: múltiplas interfaces, trunk/access, MAC, bridge/VE válido.
5. `vlan_orphan` / `vlanif_orphan` quando não há IP, VRF, VC, VSI, MAC ou uso L2 real.
6. `vlan_not_in_switch_batch` quando switch referencia VLAN em interface, mas VLAN não existe em `vlan batch`/`vlan <id>`.

## Arquivos alterados

- `workspace/artifacts/api-server/src/modules/l2circuits/parsers/classification.helpers.ts`
- `workspace/artifacts/api-server/src/modules/l2circuits/parsers/dot1q-local.parser.ts`
- `workspace/artifacts/api-server/src/modules/l2circuits/parsers/huawei-vrp-l2.ts`
- `workspace/artifacts/api-server/src/modules/l2circuits/parsers/s6730-l2.parser.ts`
- `workspace/artifacts/api-server/src/modules/l2circuits/normalizers/findings.resolver.ts`
- `workspace/artifacts/api-server/src/modules/l2circuits/l2circuits.types.ts`
- `workspace/artifacts/api-server/src/modules/l2circuits/l2circuits.service.ts`
- `workspace/lib/db/src/schema/l2circuits.ts`
- `workspace/lib/db/migrations/0014_l2_circuit_classification.sql`
- `tools/l2-classification-selftest.mjs`
- `tools/l2-dot1q-parser-selftest.mjs`
- `tools/l2-s6730-parser-selftest.mjs`

## Evidências

- Subinterface `dot1q` sem IP/VRF/VC/VSI/uso L2 real vira `vlan_orphan` e gera `VLAN_ORPHAN`.
- Duas subinterfaces usando mesma VLAN sem IP/VRF viram `vlan_local` e geram evidência `VLAN_MULTI_INTERFACE_LOCAL`.
- `Vlanif` sem IP/VRF/VC/VSI vira `vlanif_orphan` e gera `VLANIF_ORPHAN`.
- `Vlanif` com IP vira `l3_interface`.
- Subinterface com IP/VRF vira `l3_vrf_link`.
- `Vlanif` em `display mpls l2vc` com VC-ID, destination e client interface vira `vpws`.
- `display mpls l2vc` sem peer não gera `vpws`.
- Switch com VLAN referenciada e sem `vlan batch` gera `VLAN_NOT_IN_SWITCH_BATCH`.
- Huawei NE sem `vlan batch` não gera `VLAN_NOT_IN_SWITCH_BATCH` automaticamente.
- Router NE com VLAN local/órfã recebe `ROUTER_L2_VLAN_ANOMALY`.

## Testes executados

- `node tools/l2-classification-selftest.mjs` — PASS
- `node tools/l2-dot1q-parser-selftest.mjs` — PASS
- `node tools/l2-s6730-parser-selftest.mjs` — PASS
- `cd workspace && pnpm run typecheck` — PASS
- `cd workspace && BASE_PATH=/ PORT=5000 pnpm run build` — PASS

## Observações de fixture

- Fixture local S6730 contém cabeçalho `Total LDP VC : 82 63 up 19 down`, mas só um bloco L2VC colado no arquivo; selftest mantém caminho parcial e valida VC 15.
- Fixture local VSI contém apenas `SERVICOS_CDS`; relatório anterior indica outras 47 VSI, mas elas não estão no arquivo local atual.

## Riscos

- Classificação depende da presença de evidência local no snapshot. Snapshot parcial pode aumentar `UNKNOWN`/órfãos.
- `VLAN_NOT_IN_SWITCH_BATCH` é forte em switch. Em router NE, regra é fraca e não dispara sem evidência global.

## Confirmação read-only

- Nenhum comando SSH executado.
- Nenhum comando em device executado.
- Nenhum NetBox write executado.
- Nenhum sync/apply plan executado.
