# Provisioning Template Model

## Campos do template (registry)

| Campo | Descrição |
|-------|-----------|
| `id` | Identificador estável (`huawei-vrp-bgp-customer`) |
| `name` | Nome exibido na UI |
| `description` | Descrição operacional |
| `vendor` / `platform` | Compatibilidade com inventário |
| `serviceType` | Tipo lógico (`bgp_customer`, `l3vpn_vrf`, …) |
| `parameterSchema` | Schema de parâmetros (tipo, required, sensitive) |
| `configTemplate` | Corpo de config (preview only) |
| `rollbackTemplate` | Rollback textual |
| `precheckHints` / `postcheckHints` | Orientações NOC |
| `risks` | Riscos padrão do serviço |

## serviceType suportados (v0.4.0)

- `bgp_customer`
- `bgp_provider`
- `l3vpn_vrf`
- `l2vpn_vpws`
- `l2vpn_vpls`
- `interface_subinterface`
- `route_policy`
- `community_filter`
- `prefix_list`

## Render

Substituição `{{param}}` e blocos condicionais `{{#param}}...{{/param}}`.

Parâmetros `sensitive: true` (ex.: `password`) são mascarados como `***REDACTED***` no preview/export.

## Validação

- Obrigatórios ausentes → `blocked`
- Vendor/platform incompatível → `blocked`
- ASN/IP/VLAN inválidos → `blocked`
- Conflitos discovery (VRF/peer/subinterface/policy) → `warning` (não bloqueia automaticamente)
