# PHASE_L2_OPS_2A_VLAN_SUMMARY_AND_VSI_BINDING_FIX_REPORT

## Objetivo
Corrigir falso positivo de VLAN ausente e CIRCUIT_DOWN crítico quando a VLAN existe no Huawei S6730, está ativa em L2, mas a Vlanif está vazia/desnecessária.

## O que foi ajustado
- Parser de `display vlan summary` para expandir ranges e usar `global_vlan_ids` como verdade global.
- Parser de `display vlan <VID>` / `verbose` para extrair:
  - `vlan_exists`
  - `vlan_status`
  - `vlan_state`
  - `description`
  - `tagged_ports[]`
  - `active_ports[]`
  - `ports_up_count`
  - `vlan_oper_up`
- Parser de `Vlanif<VID>` para detectar:
  - `vlanif_exists`
  - `vlanif_empty`
  - `has_l3`
  - `l2_binding_vsi_name`
  - `l2_binding_type=vsi`
- Resolver de findings:
  - não gerar `VLAN_NOT_IN_SWITCH_BATCH` quando a VLAN existe no summary ou no `display vlan <VID>`
  - não usar `Vlanif` down/vazia como motivo principal de `CIRCUIT_DOWN` em `vlan_local`
  - gerar `VLAN_L2_ACTIVE_WITH_EMPTY_VLANIF` para VLAN ativa com portas UP e Vlanif vazia
  - tratar `l2 binding vsi` como `vlan_vsi_binding`
- UI:
  - copy nova para Vlanif vazia em VLAN L2 ativa
  - copy contextual para VSI binding

## Validação offline
- `pnpm -C workspace run typecheck`
- `pnpm -C workspace --filter @workspace/api-server run build`
- `PORT=24780 BASE_PATH=/ pnpm -C workspace build`
- `node tools/l2-vlan-summary-vsi-binding-selftest.mjs`

## Container
- `tools/apply-containers.sh api web`

## Resultado observado
- VLAN 199 e VLAN 1842 passam a existir no summary e não devem cair em `VLAN_NOT_IN_SWITCH_BATCH`
- Vlanif vazia em VLAN L2 ativa gera alerta baixo
- `Vlanif1118` com `l2 binding vsi L2L-1118` é correlacionada com VSI

## Observação
O endpoint de refresh responde `401 Authentication required` quando chamado sem sessão. Nos logs do backend não apareceu erro interno do refresh.
