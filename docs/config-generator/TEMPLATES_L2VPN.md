# Templates L2VPN — Config Generator

Documentação da fase **CONFIG-GENERATOR.TEMPLATES-L2VPN-PTP-VSI** (preview-only).

Relacionado: [CONFIG_GENERATOR_MVP_CLOSURE.md](./CONFIG_GENERATOR_MVP_CLOSURE.md) · [ID_ALLOCATOR.md](./ID_ALLOCATOR.md) · [CHANGE_REQUEST_PREVIEW.md](./CHANGE_REQUEST_PREVIEW.md)

## Visão geral

| Template | `templateKey` | `serviceType` primário | Aliases |
|----------|---------------|------------------------|---------|
| L2VPN VLAN (legado MVP) | `huawei_vrp_l2vpn_vlan` | `l2vpn_vlan` | — |
| L2VPN PTP/L2VC | `huawei_vrp_l2vpn_ptp_l2vc` | `l2vpn_ptp` | `vpws`, `l2vc` |
| L2VPN PTMP/VSI | `huawei_vrp_l2vpn_ptmp_vsi` | `l2vpn_ptmp` | `vpls`, `vsi` |

UI: `/provisioning` e `/config-generator`. Nenhum comando é enviado ao device.

## Fontes de dados (suggestions)

| Fonte | Campos usados |
|-------|----------------|
| `l2_circuits` | circuitId, circuitType, vlan, interface, peerIp, vcId, vsiName, vsiId |
| `discovery_snapshots` | interfaces, l2vpn.l2vcs/vsis |
| `snmp_snapshots` | interfaces, peers |
| `collected_configs` | baseline diff, subinterfaces, L2VC/VSI existentes |
| `config_generator_discovered_ids` | inventário ID allocator |
| `service_catalog` | customerName, description, serviceType |
| ID Allocator | vlan, subinterfaceId, l2vcId, vsiId |

`fieldOrigins`: `l2_circuit`, `id_allocator`, `inventory`, `service_catalog`, `manual`, `bgp_peer`.

## L2VPN PTP/L2VC

### Blocos

- `global_dependencies` — MPLS/trunk baseline (nunca tratados como exclusivos de circuito)
- `circuit_dependencies`
- `interface_binding` — subinterface dot1q/qinq
- `l2vc_binding` — `mpls l2vc`
- `peer_binding`
- `postcheck`
- `rollback_placeholder` — manual; não remove global/VLAN reutilizada/trunk físico

### Campos principais

`circuitId`, `customerName`, `localDeviceName`, `localInterface`, `interface`, `vlan`, `subinterfaceId`, `l2vcId`, `remotePeerIp`, `remoteSite`, `remoteDeviceName`, `encapsulation`, `description`, `mtu`, `controlWord`, `tunnelPolicy`, `allocationScope`, `allocationRangeKey`, `allocationReason`.

### ID Allocator

- VLAN **600–799** (catálogo K3G `l2vpn`)
- `subinterfaceId` alinhado à VLAN
- `l2vcId` próximo livre no **tenant**

### Postcheck

```
display mpls l2vc
display mpls l2vc interface <interface>
display interface <subinterface>
display current-configuration interface <subinterface>
display vlan <vlan>
display mac-address vlan <vlan>
```

## L2VPN PTMP/VSI

### Blocos

- `global_dependencies`
- `circuit_dependencies`
- `vsi_definition`
- `peer_binding`
- `access_binding` — `l2 binding vsi`
- `postcheck`
- `rollback_placeholder` — manual; não remove VSI com outros peers

### Campos principais

`circuitId`, `customerName`, `vsiName`, `vsiId`, `vlan`, `subinterfaceId`, `accessInterface`, `remotePeers[]`, `siteRole`, `neighborSites[]`, `description`, `mtu`, `encapsulation`, alocação.

### ID Allocator

- VLAN 600–799
- `vsiId` livre no tenant
- conflito de vlan/subinterface no device bloqueia

### Postcheck

```
display vsi name <vsiName>
display vsi services all
display mpls l2vpn vsi
display current-configuration | include <vsiName>
display interface <accessInterface>
display vlan <vlan>
```

## Validações

| Regra | Severidade |
|-------|------------|
| `l2vcId` / `vsiId` ocupado no tenant | error |
| VLAN/subinterface ocupada no device | error |
| `remotePeerIp` ausente (PTP) | error |
| `remotePeers` vazio (VSI) | error |
| VLAN fora do range L2VPN (600–799) | warning forte |
| PTP com múltiplos peers | warning → sugere VSI |
| PTMP com 1 peer | warning → sugere PTP |
| Interface down | warning |
| MTU divergente do baseline | warning |

## Diff / precheck

Baseline enriquecido com `l2vcs`, `vsis`, `subinterfaces` a partir de `collected_configs`.

Classificações: `already_present`, `new_candidate`, `partial_match`, `conflict`, `manual_review`, `global_existing`, `global_missing`.

Casos L2:

- subinterface já existente → `partial_match`
- L2VC existente com peer diferente → `conflict`
- VSI existente com conteúdo diferente → `partial_match`
- VLAN/peer já presentes → `partial_match` / `already_present`

## Change Request Preview

Pacote inclui tipo L2VPN, IDs, peers, diff L2, risco, postcheck, rollback manual, ticket markdown.

Risco:

- **high/blocked** — conflito l2vcId/vsiId/vlan/subinterface ou diff bloqueante
- **medium** — interface down, baseline ausente, MTU divergente, sugestão PTP↔VSI
- **low** — IDs livres e baseline OK

## Limitações

- Preview-only; `CONFIG_WRITE_ENABLED=false`
- Controlled Execution não invocado
- Provisioning legado não reativado
- Rollback sempre `manual_placeholder`
- Objetos globais nunca exclusivos de circuito
- Sem remoção automática sugerida

## Testes

```bash
cd workspace
pnpm --dir ./scripts exec tsx ../artifacts/api-server/src/modules/config-generator/config-generator.l2vpn-templates.selftest.ts
```

Ver também selftests existentes listados em [CONFIG_GENERATOR_MVP_CLOSURE.md](./CONFIG_GENERATOR_MVP_CLOSURE.md).
