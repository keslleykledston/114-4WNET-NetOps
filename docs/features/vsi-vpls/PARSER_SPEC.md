# Parser Spec

## Fonte inicial

- Huawei VRP.

## Objetivo

Extrair informacao suficiente para consolidar VSI/VPLS por tenant e VS-ID.

## Campos

- `vsi_name`
- `vs_id`
- `signaling`
- `peers`
- `peer_ip`
- `pw_id`
- `pw_status`
- `interface_ac`
- `vlan_id`
- `qinq_outer_vlan`
- `qinq_inner_vlan`
- `mtu`
- `raw_config_block`
- `device_id`
- `site_id`
- `tenant_id`

## Comandos de referencia

- `display vsi`
- `display vsi verbose`
- `display vsi name <VSI_NAME> verbose`
- `display current-configuration configuration vsi`
- `display current-configuration interface`
- `display mpls l2vc`
- `display mpls l2vpn vsi`
- `display mpls ldp peer`
- `display interface brief`
- `display interface description`

## Regras

- Preservar bloco bruto como evidência.
- Suportar VSI sem VS-ID.
- Suportar config incompleta.
- Fixture-first para testes.
